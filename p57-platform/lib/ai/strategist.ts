/**
 * The strategist layer: composes the local deterministic engine with an optional language model.
 *
 * Division of labour (deliberate):
 *   • The model may propose a *concept* — a base product from the catalogue, mechanisms and a
 *     written rationale.
 *   • The pricing engine prices whatever comes back, applies guardrails and produces the numbers.
 *   • If the model is unavailable, misbehaves, or returns something outside the catalogue, the
 *     deterministic engine produces the proposals instead and the response records why.
 */
import type {
  AttendanceAssumptions, AudienceSegment, CatalogueProduct, CommercialObjective, CostAssumptions,
  GuardrailConfig, LocationId, OfferStrategy,
} from '@/lib/types';
import { ENGINE_VERSION, formatINR, normaliseTerms, resolveEconomics, buildReferenceRates } from '@/lib/engine/pricing';
import { generateProposals, type EvidenceContext, type GenerateRequest, type OfferProposal } from '@/lib/engine/recommend';
import { parseIntent } from '@/lib/engine/templates';
import { callModel, parseJsonLoose, resolveProvider, type ModelResult, type ProviderResolution } from './provider';
import type { AIProviderConfig } from '@/lib/types';

export interface StrategistContext {
  catalogue: CatalogueProduct[];
  guardrails: GuardrailConfig;
  costs: CostAssumptions;
  attendance: AttendanceAssumptions;
  aiConfig: AIProviderConfig;
  evidence?: EvidenceContext;
}

export interface StrategistRunMeta {
  provider: string;
  providerLabel: string;
  model: string;
  engineVersion: string;
  usedModel: boolean;
  fallbackReason: string | null;
  durationMs: number;
  catalogueProductsSent: number;
  prompt: string | null;
}

export interface StrategistResult {
  proposals: OfferProposal[];
  meta: StrategistRunMeta;
  interpretation?: { audience: AudienceSegment[]; objectives: CommercialObjective[]; matchedTerms: string[]; unmatchedTerms: string[]; constraints: Record<string, unknown> };
  modelNarrative?: string | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  local_strategist: 'Local strategist engine (deterministic, catalogue-driven — no external model connected)',
  anthropic: 'Anthropic Claude (your key)',
  openai: 'OpenAI (your key)',
  gemini: 'Google Gemini (your key)',
};

/** Compact catalogue digest sent to a model. Prices and policies only — nothing invented. */
export function catalogueDigest(catalogue: CatalogueProduct[], limit = 60): string {
  const sellable = catalogue
    .filter(p => p.price != null && p.price > 0 && ['standard_retail', 'promotional', 'introductory', 'partner'].includes(p.productClass))
    .slice(0, limit);
  return sellable.map(p => {
    const bits = [
      `id=${p.id}`,
      `name="${p.name}"`,
      `price=₹${p.price}`,
      p.unlimitedAccess ? 'access=unlimited' : p.credits ? `credits=${p.credits}` : 'credits=?',
      p.duration ? `validity=${p.duration}${p.durationUnit}` : '',
      p.privateSessionCount ? `private=${p.privateSessionCount}` : '',
      `class=${p.productClass}`,
      `location="${p.locationName}"`,
      p.isIntroOffer ? 'intro=true' : '',
      p.policies.freezeAllowance != null ? `freezes=${p.policies.freezeAllowance}` : '',
      p.observed ? `observed_units=${p.observed.units} observed_revenue=₹${Math.round(p.observed.revenue)}` : 'observed=none',
    ].filter(Boolean);
    return `- ${bits.join(' ')}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `You are the commercial strategist for Physique 57 India, a premium boutique barre and pilates studio group.
You design membership offers that a studio manager would actually approve.

Rules you must follow:
1. Use ONLY products from the supplied catalogue, referenced by their exact id. Never invent a product, price, credit count or policy.
2. Never invent sales projections, conversion rates or customer statistics. If you reference numbers, they must come from the catalogue digest or the evidence block.
3. Prefer value-add mechanisms (bonus credits, validity, private sessions, guest passes) over cash discounts, except where a discount is clearly the right tool and within the stated guardrail ceilings.
4. Respect guardrails: maximum discount percentage, effective price-per-class floor, bonus-credit ceiling, validity-extension ceiling.
5. Every proposal must have a different commercial angle — not merely a different discount percentage.
6. Write like a thoughtful commercial operator: direct, specific, no hype, no exclamation marks, no emoji.

Return STRICT JSON only, matching:
{"proposals":[{"name":"","baseProductId":"","angle":"access|experience|term|frequency|price|social|capacity|bundle",
"pitch":"","concept":"","whyItWorks":"","customerAppeal":"","risks":[""],"alternativeApproach":"",
"terms":{"discountPct":0,"validityDays":30,"creditsIncluded":null,"bonusCredits":0,"complimentaryClasses":0,"privateSessions":0,"guestPasses":0,"validityExtensionDays":0}}],
"narrative":""}
discountPct is a number from 0 to the ceiling. Use 0 when the proposal is value-add led.`;

export async function runStrategist(args: {
  prompt?: string;
  audience: AudienceSegment[];
  objectives: CommercialObjective[];
  locationIds: LocationId[];
  controls: GenerateRequest['controls'];
  constraints?: GenerateRequest['constraints'];
  count: number;
  presetId?: string;
  seed?: number;
  mode: 'guided' | 'random' | 'nlq';
  narrativeOnly?: boolean;
} & StrategistContext): Promise<StrategistResult> {
  const resolution = resolveProvider(args.aiConfig);
  const started = Date.now();
  const localRequest: GenerateRequest = {
    catalogue: args.catalogue, guardrails: args.guardrails, costs: args.costs, attendance: args.attendance,
    audience: args.audience, objectives: args.objectives, locationIds: args.locationIds,
    controls: args.controls, constraints: args.constraints, count: args.count, presetId: args.presetId,
    seed: args.seed, prompt: args.prompt, mode: args.mode, evidence: args.evidence,
  };

  const interpretation = args.prompt
    ? (() => {
        const intent = parseIntent(args.prompt);
        return {
          audience: intent.audience, objectives: intent.objectives, matchedTerms: intent.matchedTerms,
          unmatchedTerms: intent.unmatchedTerms, constraints: intent.constraints as unknown as Record<string, unknown>,
        };
      })()
    : undefined;

  let modelResult: ModelResult | null = null;
  if (resolution.key) {
    const digest = catalogueDigest(args.catalogue);
    const user = [
      args.prompt ? `BRIEF FROM THE TEAM:\n${args.prompt}` : 'BRIEF: create commercially sound offers for the stated audience and objective.',
      `Audience: ${args.audience.join(', ')}`,
      `Objective: ${args.objectives.join(', ')}`,
      `Location scope: ${args.locationIds.join(', ') || 'all Bengaluru studios'}`,
      args.constraints ? `Constraints: ${JSON.stringify(args.constraints)}` : '',
      `Guardrails: max discount ${args.guardrails.maxDiscountPct}%, per-product ceilings ${JSON.stringify(args.guardrails.maxDiscountPctByClass)}, price-per-class floor ₹${args.guardrails.minEffectivePricePerClass}, bonus-credit ceiling ${args.guardrails.maxBonusCreditsPct}%, validity-extension ceiling ${args.guardrails.maxValidityExtensionDays} days.`,
      `Produce ${args.count} proposals.`,
      '',
      'CATALOGUE (authoritative):',
      digest,
      args.evidence ? `\nOBSERVED EVIDENCE (context only, do not extend):\n${JSON.stringify(args.evidence).slice(0, 4000)}` : '',
    ].filter(Boolean).join('\n');
    modelResult = await callModel(resolution, { system: SYSTEM_PROMPT, user, maxTokens: 2600, temperature: 0.7 });
  }

  const fallbackReason = !resolution.key
    ? 'No model provider configured. Proposals generated by the local strategist engine.'
    : modelResult && !modelResult.ok
      ? `Model call failed (${modelResult.error ?? 'unknown error'}). Local strategist engine used instead.`
      : null;

  let proposals: OfferProposal[] | null = null;
  let modelNarrative: string | null = null;

  if (modelResult?.ok && modelResult.text) {
    const parsed = parseJsonLoose(modelResult.text);
    if (parsed?.proposals?.length) {
      proposals = normaliseModelProposals(parsed, args, localRequest);
      modelNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : null;
    } else {
      modelNarrative = null;
    }
  }

  if (!proposals || !proposals.length) {
    proposals = generateProposals(localRequest);
  }

  return {
    proposals,
    meta: {
      provider: proposals.length && modelResult?.ok ? modelResult.provider : 'local_strategist',
      providerLabel: proposals.length && modelResult?.ok ? (PROVIDER_LABEL[modelResult.provider] ?? modelResult.provider) : PROVIDER_LABEL.local_strategist,
      model: (modelResult?.ok ? modelResult.model : null) ?? 'rules-v1',
      engineVersion: ENGINE_VERSION,
      usedModel: Boolean(modelResult?.ok && proposals.length),
      fallbackReason: modelResult?.ok ? null : fallbackReason,
      durationMs: Date.now() - started,
      catalogueProductsSent: resolution.key ? Math.min(60, args.catalogue.filter(p => p.price && p.price > 0).length) : 0,
      prompt: args.prompt ?? null,
    },
    interpretation,
    modelNarrative,
  };
}

/**
 * Model proposals are re-priced by the deterministic engine. Any product id the model invented is
 * dropped rather than trusted.
 */
function normaliseModelProposals(parsed: any, args: Parameters<typeof runStrategist>[0], localRequest: GenerateRequest): OfferProposal[] {
  const reference = buildReferenceRates(args.catalogue);
  const out: OfferProposal[] = [];
  const local = generateProposals({ ...localRequest, count: args.count });
  for (const raw of (parsed.proposals as any[]).slice(0, args.count)) {
    const base = args.catalogue.find(p => p.id === raw.baseProductId && p.price != null && p.price > 0);
    if (!base) continue; // model referenced something outside the catalogue
    const template = local[out.length % Math.max(local.length, 1)];
    const terms = normaliseTerms({
      pricingMode: raw.terms?.discountPct ? 'discount_pct' : 'value_add',
      discountPct: clampNum(raw.terms?.discountPct, 0, args.guardrails.maxDiscountPctByClass[base.productClass] ?? args.guardrails.maxDiscountPct),
      validityDays: clampNum(raw.terms?.validityDays, args.guardrails.minValidityDays, 720) ?? undefined,
      creditsIncluded: base.unlimitedAccess ? null : base.credits,
      bonusCredits: Math.max(0, Math.round(clampNum(raw.terms?.bonusCredits, 0, 12) ?? 0)),
      complimentaryClasses: Math.max(0, Math.round(clampNum(raw.terms?.complimentaryClasses, 0, 6) ?? 0)),
      privateSessions: Math.max(0, Math.round(clampNum(raw.terms?.privateSessions, 0, 4) ?? 0)),
      guestPasses: Math.max(0, Math.round(clampNum(raw.terms?.guestPasses, 0, args.guardrails.maxGuestPasses) ?? 0)),
      validityExtensionDays: Math.max(0, Math.round(clampNum(raw.terms?.validityExtensionDays, 0, args.guardrails.maxValidityExtensionDays) ?? 0)),
    }, base);
    const economics = resolveEconomics({
      baseProduct: base, terms, guardrails: args.guardrails, costs: args.costs, attendance: args.attendance,
      reference, catalogue: args.catalogue, audienceSegments: args.audience,
    });
    out.push({
      ...template,
      proposalId: `model-${Math.random().toString(36).slice(2, 8)}`,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : template.name,
      baseProductId: base.id,
      baseProductName: base.name,
      terms,
      components: template.components,
      economics,
      concept: typeof raw.concept === 'string' ? raw.concept : template.concept,
      strategy: {
        ...template.strategy,
        offerName: raw.name ?? template.name,
        concept: typeof raw.concept === 'string' ? raw.concept : template.concept,
        whyItWorks: typeof raw.whyItWorks === 'string' ? raw.whyItWorks : template.strategy.whyItWorks,
        customerAppeal: typeof raw.customerAppeal === 'string' ? raw.customerAppeal : template.strategy.customerAppeal,
        salesPitch: typeof raw.pitch === 'string' ? raw.pitch : '',
        risks: Array.isArray(raw.risks) && raw.risks.length ? raw.risks.filter((r: unknown) => typeof r === 'string') : template.strategy.risks,
        alternativeApproach: typeof raw.alternativeApproach === 'string' ? raw.alternativeApproach : template.strategy.alternativeApproach,
        facts: [...template.strategy.facts, `Concept text proposed by ${'model'} and priced by engine v${ENGINE_VERSION}.`],
      },
      economicsNote: undefined,
    } as OfferProposal);
  }
  return out;
}

function clampNum(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (Number.isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Optional model polish for written copy. Falls back silently to the deterministic text. */
export async function polishCopy(args: {
  aiConfig: AIProviderConfig;
  kind: 'whatsapp_short' | 'whatsapp_detailed' | 'email' | 'verbal' | 'headline' | 'campaign' | 'strategy';
  draft: string;
  facts: string[];
}): Promise<{ text: string; usedModel: boolean; note: string }> {
  const resolution = resolveProvider(args.aiConfig);
  if (!resolution.key) {
    return { text: args.draft, usedModel: false, note: 'Deterministic copy — no model connected.' };
  }
  const result = await callModel(resolution, {
    system: `You refine commercial copy for Physique 57 India, a premium boutique barre and pilates studio.
Tone: warm, precise, confident, never salesy. No emoji. No exclamation marks. Never invent prices, credits, dates or guarantees — use only the facts supplied. Keep WhatsApp versions short enough to read on a phone. Return plain text only.`,
    user: `Task: rewrite the following ${args.kind.replace(/_/g, ' ')} draft so it reads naturally, keeping every fact intact.\n\nFACTS (authoritative, do not alter):\n${args.facts.map(f => `- ${f}`).join('\n')}\n\nDRAFT:\n${args.draft}`,
    maxTokens: 900,
    temperature: 0.5,
  });
  if (!result.ok || !result.text) {
    return { text: args.draft, usedModel: false, note: result.error ?? 'Model unavailable — deterministic copy used.' };
  }
  return { text: result.text.trim(), usedModel: true, note: `Rewritten by ${result.provider}/${result.model}.` };
}

export function strategyBlocksForDisplay(strategy: OfferStrategy) {
  return [
    { key: 'facts', label: 'Calculated facts', tone: 'fact', items: strategy.facts },
    { key: 'estimates', label: 'Heuristic estimates', tone: 'estimate', items: strategy.estimates },
    { key: 'assumptions', label: 'Assumptions', tone: 'assumption', items: strategy.assumptions },
    { key: 'recommendations', label: 'Recommendations', tone: 'recommendation', items: strategy.recommendations },
  ];
}

export function offerSummaryForModel(offer: { name: string; baseProductName: string | null; metrics: any }) {
  return `${offer.name} on ${offer.baseProductName}: price ${formatINR(offer.metrics?.sellingPrice)}, discount ${offer.metrics?.discountPct?.toFixed(1) ?? 0}%, effective ${formatINR(offer.metrics?.effectivePricePerClass)}/class`;
}
