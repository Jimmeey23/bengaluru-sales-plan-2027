/**
 * Offer concept generation (the "strategist").
 *
 * Fully deterministic and catalogue-driven: given an audience, objectives and control values it
 * returns candidate offers with pricing already resolved, guardrails evaluated and a written
 * rationale. This runs locally with no model connected — which is why the UI labels its output
 * "local strategist engine" rather than AI. When a model provider is configured, the model
 * contributes language and idea variation, and the numbers here still govern.
 */
import type {
  AttendanceAssumptions, AudienceSegment, CatalogueProduct, CommercialObjective, CostAssumptions,
  GuardrailConfig, LocationId, OfferComponent, OfferEligibility, OfferStrategy, OfferTerms, ComponentKind,
} from '@/lib/types';
import {
  buildReferenceRates, formatINR, normaliseTerms, resolveEconomics, durationToDays,
  type ReferenceRates, type ResolvedEconomics,
} from './pricing';
import { detectCannibalisation, buildScorecard } from './analysis';
import { evaluateGuardrails } from './guardrails';
import { AUDIENCE_PLAYS, OBJECTIVE_PLAYS, GENERATION_PRESETS, type GenerationPreset } from './templates';
import { ANGLES, anglePoolForObjectives, suggestOfferNames, generateMessages, type AngleKey } from './copy';
import { LOCATION_LABELS } from './templates';

export interface GeneratorControls {
  creativity: number;
  discountAggressiveness: number;
  customerAttractiveness: number;
  revenueProtection: number;
  complexity: number;
  durationBias?: 'shorter' | 'same' | 'longer';
  segment?: AudienceSegment | 'auto';
  category?: string | 'auto';
}

export interface EvidenceContext {
  funnel?: any;
  customerBase?: any;
  capacity?: any;
  sales?: any;
}

export interface GenerateRequest {
  catalogue: CatalogueProduct[];
  guardrails: GuardrailConfig;
  costs: CostAssumptions;
  attendance: AttendanceAssumptions;
  audience: AudienceSegment[];
  objectives: CommercialObjective[];
  locationIds: LocationId[];
  controls: GeneratorControls;
  constraints?: {
    maxDiscountPct?: number;
    priceTarget?: number;
    preferValueAdd?: boolean;
    festive?: boolean;
    includePrivate?: boolean;
    targetMarginPct?: number;
  };
  count: number;
  presetId?: string;
  seed?: number;
  prompt?: string;
  mode: 'guided' | 'random' | 'nlq' | 'remix';
  evidence?: EvidenceContext;
  locked?: {
    baseProductId?: string | null;
    audience?: boolean;
    objectives?: boolean;
    discount?: number | null;
    validityDays?: number | null;
    structure?: ComponentKind[];
    naming?: string | null;
  };
}

export interface OfferProposal {
  proposalId: string;
  name: string;
  internalTitle: string;
  concept: string;
  angle: AngleKey;
  angleLabel: string;
  baseProductId: string;
  baseProductName: string;
  locationIds: LocationId[];
  audienceSegments: AudienceSegment[];
  objectives: CommercialObjective[];
  components: OfferComponent[];
  terms: OfferTerms;
  eligibility: OfferEligibility;
  tags: string[];
  collectionId: string;
  strategy: OfferStrategy;
  economics: ResolvedEconomics;
  guardrails: ReturnType<typeof evaluateGuardrails>;
  cannibalisation: ReturnType<typeof detectCannibalisation>;
  scorecard: ReturnType<typeof buildScorecard>;
  nameOptions: { name: string; rationale: string }[];
  evidenceNotes: string[];
  relevance: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function objectiveBonus(name: string, unlim: boolean, credits: number | null, objectives: CommercialObjective[]): number {
  let s = 0;
  const longTerm = /annual|6 month|year/i.test(name);
  const midTerm = /3 month/i.test(name);
  const shortTerm = /2 week|10 days|weekend|single/i.test(name);
  for (const o of objectives) {
    if (o === 'longer_commitment' && (longTerm || midTerm)) s += 2;
    if (o === 'upsell_private_training' && /private/i.test(name)) s += 2.5;
    if (o === 'improve_frequency' && credits != null && credits >= 8 && credits <= 20) s += 1.5;
    if (o === 'reactivate_lapsed' && shortTerm) s += 2;
    if (o === 'reactivate_lapsed' && (credits != null && credits <= 4)) s += 1.5;
    if (o === 'increase_atv' && (/hybrid|private|annual/i.test(name))) s += 1.8;
    if (o === 'drive_offpeak' && (credits != null && credits >= 8)) s += 1;
    if (o === 'increase_renewals' && (unlim || credits != null && credits >= 8)) s += 1.2;
    if (o === 'convert_after_trial' && (credits != null && credits <= 8)) s += 1.5;
    if (o === 'acquire_new_members' && (credits != null && credits <= 8)) s += 1;
  }
  return s;
}

function mechanismForAngle(angle: AngleKey, controls: GeneratorControls, preset: GenerationPreset): ComponentKind[] {
  const base: Record<AngleKey, ComponentKind[]> = {
    access: ['bonus_credits', 'validity_extension'],
    experience: ['private_sessions', 'tier_benefit'],
    term: ['validity_extension', 'bonus_credits', 'tier_benefit'],
    frequency: ['bonus_credits', 'complimentary_classes'],
    price: ['discount_pct'],
    social: ['guest_passes', 'referral_credit'],
    capacity: ['discount_amount', 'validity_extension'],
    bundle: ['private_sessions', 'bundle_item', 'guest_passes'],
  };
  const set = [...base[angle]];
  if (controls.complexity > 65) {
    const extra = preset.mechanismBias.find(m => !set.includes(m));
    if (extra) set.push(extra);
  }
  if (controls.creativity > 85 && !set.includes('referral_credit') && angle !== 'price') set.push('referral_credit');
  return set.slice(0, controls.complexity > 80 ? 4 : 3);
}

function chooseParameters(args: {
  angle: AngleKey; controls: GeneratorControls; preset: GenerationPreset; base: CatalogueProduct;
  guardrails: GuardrailConfig; constraints: GenerateRequest['constraints']; rnd: () => number;
}) {
  const { angle, controls, base, guardrails: g, constraints, rnd } = args;
  const classLimit = g.maxDiscountPctByClass[base.productClass] ?? g.maxDiscountPct;
  const hardCap = Math.min(classLimit, constraints?.maxDiscountPct ?? 100);
  const aggression = controls.discountAggressiveness / 100;
  const protection = controls.revenueProtection / 100;
  let discountPct = 0;
  if (angle === 'price' || angle === 'capacity') {
    discountPct = Math.round(clamp(hardCap * (0.45 + aggression * 0.55) * (1 - protection * 0.35), 0, hardCap));
  } else if (angle === 'bundle' && controls.discountAggressiveness > 70) {
    discountPct = Math.round(clamp(hardCap * 0.3 * (1 - protection * 0.4), 0, hardCap));
  }
  if (constraints?.preferValueAdd) discountPct = Math.min(discountPct, Math.round(hardCap * 0.25));
  // A class ceiling of zero, or an introductory product with intro discounting switched off, means
  // no cash comes off at all. The generator reads the same rule the guardrail applies, so nothing
  // is ever generated already in breach of it.
  const cashAllowed = classLimit > 0 && !(base.isIntroOffer && g.blockDiscountOnIntroProducts);
  if (!cashAllowed) discountPct = 0;
  discountPct = Math.max(0, Math.round(discountPct));
  // A fixed cash amount is the alternative to a percentage cut, never an addition to it: two cash
  // mechanics on one offer is exactly the stacking the configuration blocks.
  const amountSmall = angle === 'capacity';
  const discountAmount = cashAllowed && amountSmall && discountPct === 0
    ? Math.round((base.price ?? 0) * 0.05 / 50) * 50
    : 0;

  const baseCredits = base.credits ?? (base.unlimitedAccess ? 12 : 4);
  // An unlimited product has no credit unit, so extra credits would add nothing. For those bases
  // the generator uses the access mechanisms that do carry value: time, guests, privates, tier.
  const creditMechanismsApply = !base.unlimitedAccess;
  const bonusCredits = creditMechanismsApply && ['access', 'term', 'frequency'].includes(angle)
    ? Math.max(1, Math.round(baseCredits * (g.maxBonusCreditsPct / 100) * (0.3 + controls.customerAttractiveness / 200)))
    : 0;
  const complimentaryClasses = creditMechanismsApply && (angle === 'frequency' || (angle === 'price' && controls.customerAttractiveness > 70))
    ? Math.max(1, Math.round((baseCredits * 0.15) * (0.5 + controls.customerAttractiveness / 200)))
    : 0;
  const validityExtensionDays = ['access', 'term', 'frequency', 'capacity'].includes(angle)
    ? Math.round(clamp((g.maxValidityExtensionDays * (0.3 + controls.customerAttractiveness / 200)), 0, g.maxValidityExtensionDays))
    : 0;
  const privateSessions = angle === 'experience' || angle === 'bundle'
    ? clamp(Math.round(1 + controls.complexity / 45), 1, base.unlimitedAccess ? 3 : 2)
    : (base.unlimitedAccess && angle === 'term' && controls.complexity > 55 ? 1 : 0);
  const guestPasses = angle === 'social' ? clamp(Math.round(g.maxGuestPasses * (0.5 + controls.customerAttractiveness / 250)), 1, g.maxGuestPasses) : (controls.complexity > 85 ? 1 : 0);

  // duration bias
  let validityDays = durationToDays(base.duration, base.durationUnit) ?? 30;
  const bias = controls.durationBias ?? 'same';
  if (bias === 'longer') validityDays = Math.round(validityDays * 1.2);
  if (bias === 'shorter') validityDays = Math.round(validityDays * 0.75);
  validityDays += validityExtensionDays;

  // Repair step: never hand back a structure that trips the configured per-class floor.
  // Extra credits are trimmed first (cheapest to give away, easiest to remove), then comp classes,
  // until the price per class clears the floor — or until nothing is left to trim.
  let repaired = 0;
  if (!base.unlimitedAccess && base.price != null && g.minEffectivePricePerClass > 0) {
    const baseCreditsCount = base.credits ?? 0;
    const priceAfterDiscount = base.price
      - (discountPct ? Math.round(base.price * (discountPct / 100)) : 0)
      - (discountAmount ?? 0);
    const maxTotalCredits = Math.floor(priceAfterDiscount / g.minEffectivePricePerClass);
    let allowedExtra = Math.max(0, maxTotalCredits - baseCreditsCount);
    const offeredExtra = bonusCredits + complimentaryClasses;
    if (allowedExtra < offeredExtra) {
      repaired = offeredExtra - allowedExtra;
      const trimComps = Math.min(complimentaryClasses, repaired);
      const trimBonus = Math.min(bonusCredits, repaired - trimComps);
      return {
        discountPct, discountAmount,
        bonusCredits: Math.max(0, bonusCredits - trimBonus),
        complimentaryClasses: Math.max(0, complimentaryClasses - trimComps),
        validityExtensionDays, privateSessions, guestPasses, validityDays,
        structureRepaired: repaired,
      };
    }
  }
  return { discountPct, discountAmount, bonusCredits, complimentaryClasses, validityExtensionDays, privateSessions, guestPasses, validityDays, structureRepaired: 0 };
}

export function generateProposals(req: GenerateRequest): OfferProposal[] {
  const preset = GENERATION_PRESETS.find(p => p.id === req.presetId) ?? GENERATION_PRESETS[0];
  const rnd = mulberry32((req.seed ?? 42) + (req.prompt?.length ?? 0) * 7 + (req.presetId?.length ?? 0) * 13);
  const reference: ReferenceRates = buildReferenceRates(req.catalogue);
  const sellable = req.catalogue.filter(p =>
    p.price != null && p.price > 0 &&
    ['standard_retail', 'promotional', 'introductory', 'partner'].includes(p.productClass) &&
    (req.locationIds.length === 0 || req.locationIds.includes(p.locationId))
  );
  const pool = sellable.length ? sellable : req.catalogue.filter(p => p.price && p.price > 0);
  if (!pool.length) return [];

  const angles = ANGLES.map(a => a.key);
  const structureLock = req.locked?.structure ?? [];
  const anglePool: AngleKey[] = structureLock.length
    ? (angles as AngleKey[])
    : shuffle(anglePoolForObjectives(req.objectives, req.audience), rnd);
  const usedProducts = new Set<string>();
  const proposals: OfferProposal[] = [];

  for (let i = 0; i < req.count; i++) {
    const angle = anglePool[i % anglePool.length] as AngleKey;
    const angleMeta = ANGLES.find(a => a.key === angle)!;

    // ---- base product selection
    let base: CatalogueProduct;
    const lockedBaseId = req.locked?.baseProductId ?? null;
    if (lockedBaseId) {
      base = pool.find(p => p.id === lockedBaseId) ?? pool[0];
    } else if (i === 0 && req.constraints?.priceTarget) {
      base = nearestByPrice(pool, req.constraints.priceTarget) ?? pool[0];
    } else {
      base = rankProducts(pool, req, angle, rnd, usedProducts)[0] ?? pool[0];
    }
    usedProducts.add(base.id);

    // ---- parameters + terms
    const p = chooseParameters({ angle, controls: req.controls, preset, base, guardrails: req.guardrails, constraints: req.constraints, rnd });
    const terms: OfferTerms = normaliseTerms({
      pricingMode: p.discountPct ? 'discount_pct' : p.discountAmount ? 'discount_amount' : 'value_add',
      discountPct: (req.locked?.discount ?? (p.discountPct || null)) as number | null,
      discountAmount: p.discountAmount || null,
      sellingPrice: null,
      validityDays: (req.locked?.validityDays ?? p.validityDays) as number,
      creditsIncluded: base.unlimitedAccess ? null : base.credits,
      bonusCredits: p.bonusCredits,
      complimentaryClasses: p.complimentaryClasses,
      privateSessions: p.privateSessions || (req.constraints?.includePrivate ? 1 : 0),
      guestPasses: p.guestPasses,
      validityExtensionDays: p.validityExtensionDays,
      purchaseDeadline: deadlineFor(req.constraints?.festive ? 'festive' : 'standard'),
      redeemableFrom: null,
      redeemableTo: null,
    }, base);

    const economics = resolveEconomics({
      baseProduct: base, terms, guardrails: req.guardrails, costs: req.costs, attendance: req.attendance,
      reference, catalogue: req.catalogue, audienceSegments: req.audience,
    });

    const components: OfferComponent[] = componentsFor(terms, angle, p);

    const eligibility: OfferEligibility = {
      audienceSegments: req.audience,
      newClientsOnly: req.audience.includes('first_time_customers') && !req.audience.includes('existing_active_members'),
      existingMembersOnly: req.audience.every(s => ['existing_active_members', 'high_value_clients', 'low_frequency_members', 'recently_expired_members', 'private_training_clients'].includes(s)),
      lapsedOnly: req.audience.includes('long_lapsed_members') && !req.audience.includes('existing_active_members'),
      minLapsedDays: req.audience.includes('long_lapsed_members') ? 90 : null,
      locationIds: req.locationIds.length ? req.locationIds : [base.locationId],
      purchaseLimitPerMember: 1,
      requiresCode: true,
      code: null,
      stackableWithOtherOffers: false,
      exclusions: [
        base.isIntroOffer ? 'Not valid with other introductory pricing.' : 'Not combinable with other promotions.',
        angle === 'capacity' ? 'Off-peak sessions only (weekday mornings and quieter windows).' : '',
      ].filter(Boolean),
    };

    const cannibalisation = detectCannibalisation({ economics, baseProduct: base, catalogue: req.catalogue, audienceSegments: req.audience });
    const guardrails = evaluateGuardrails({
      offer: {
        components, eligibility, locationIds: eligibility.locationIds, status: 'draft',
        requiresReapproval: false, terms, approvedVersion: null, version: 1,
      },
      baseProduct: base, economics, guardrails: req.guardrails, duplicates: [], catalogue: req.catalogue,
      locationLabel: eligibility.locationIds.join(', '),
    });
    const scorecard = buildScorecard({
      economics, audienceSegments: req.audience, objectives: req.objectives, componentsCount: components.length,
      baseProduct: base, cannibalisation, guardrailsFailed: guardrails.filter(g => !g.passed).length,
      evidenceTags: base.observed ? ['observed_sales'] : [],
    });

    const nameOptions = suggestOfferNames({ angle, audience: req.audience, objectives: req.objectives, baseName: base.name, seed: i + (req.seed ?? 0) });
    const name = (req.locked?.naming ?? nameOptions[0].name) as string;
    const strategy = buildStrategy({
      name, base, angle: angleMeta, economics, audience: req.audience, objectives: req.objectives,
      components, guardrails, cannibalisation, evidence: req.evidence, req,
    });

    proposals.push({
      proposalId: `prop-${Date.now().toString(36)}-${i}-${angle}`,
      name,
      internalTitle: `${angleMeta.label} · ${base.name}`,
      concept: strategy.concept,
      angle, angleLabel: angleMeta.label,
      baseProductId: base.id,
      baseProductName: base.name,
      locationIds: eligibility.locationIds,
      audienceSegments: req.audience,
      objectives: req.objectives,
      components, terms, eligibility,
      tags: tagsFor(angle, base, req),
      collectionId: collectionFor(req.audience, req.objectives),
      strategy, economics, guardrails, cannibalisation, scorecard, nameOptions,
      evidenceNotes: evidenceNotes(base, economics, req.evidence),
      relevance: scorecard.overall,
    });
  }
  return proposals.sort((a, b) => b.relevance - a.relevance);
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nearestByPrice(pool: CatalogueProduct[], target: number): CatalogueProduct | null {
  return [...pool].sort((a, b) => Math.abs((a.price ?? 0) - target) - Math.abs((b.price ?? 0) - target))[0] ?? null;
}

function rankProducts(pool: CatalogueProduct[], req: GenerateRequest, angle: AngleKey, rnd: () => number, used: Set<string>): CatalogueProduct[] {
  const ctx = (p: CatalogueProduct) => ({
    credits: p.credits, unlimited: p.unlimitedAccess, intro: p.isIntroOffer,
    privateProducts: /private/i.test(p.name),
    durationDays: durationToDays(p.duration, p.durationUnit),
  });
  return [...pool].sort((a, b) => score(b) - score(a));
  function score(p: CatalogueProduct): number {
    let s = 0;
    for (const seg of req.audience) {
      const play = AUDIENCE_PLAYS[seg];
      if (play) s += play.match(p.name, ctx(p) as any) * 1.2;
    }
    s += objectiveBonus(p.name, p.unlimitedAccess, p.credits, req.objectives);
    if (angle === 'term' && /annual|6 month|3 month/i.test(p.name)) s += 2;
    if (angle === 'experience' && /private|annual|hybrid/i.test(p.name)) s += 2;
    if (angle === 'capacity' && (p.credits ?? 0) >= 8) s += 1.5;
    if (angle === 'price' && (p.credits ?? 0) <= 12) s += 1;
    if (used.has(p.id)) s -= 6;
    if (p.status === 'review') s -= 1.5;
    if (p.productClass === 'partner') s -= 3;
    if (req.constraints?.includePrivate && /private/i.test(p.name)) s += 2;
    if (req.constraints?.festive && /festive/i.test(p.name)) s += 3;
    s += rnd() * 1.6;
    return s;
  }
}

function deadlineFor(kind: 'festive' | 'standard'): string {
  const now = new Date('2026-10-16T00:00:00.000Z');
  const days = kind === 'festive' ? 21 : 30;
  return new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
}

function componentsFor(terms: OfferTerms, angle: AngleKey, p: ReturnType<typeof chooseParameters>): OfferComponent[] {
  const out: OfferComponent[] = [];
  const add = (kind: ComponentKind, value: number, unit: OfferComponent['unit'], label: string, note?: string) => {
    if (!value) return;
    out.push({ id: `cmp-${kind}-${out.length}`, kind, value, unit, label, note });
  };
  if (terms.discountPct) add('discount_pct', terms.discountPct, 'percent', 'Percentage discount');
  if (terms.discountAmount) add('discount_amount', terms.discountAmount, 'inr', 'Fixed amount discount');
  add('bonus_credits', terms.bonusCredits ?? 0, 'credits', 'Bonus credits', 'Extra credits inside the same validity window');
  add('complimentary_classes', terms.complimentaryClasses ?? 0, 'credits', 'Complimentary classes', 'Value-add rather than a price cut');
  add('validity_extension', terms.validityExtensionDays ?? 0, 'days', 'Additional validity', 'Removes the "no time to use it" objection');
  add('private_sessions', terms.privateSessions ?? 0, 'sessions', 'Private session inclusion', 'Capacity-constrained — confirm trainer availability');
  add('guest_passes', terms.guestPasses ?? 0, 'passes', 'Guest passes', 'Low delivery cost, social pull');
  return out;
}

function tagsFor(angle: AngleKey, base: CatalogueProduct, req: GenerateRequest): string[] {
  const tags = new Set<string>();
  if (angle !== 'price') tags.add('no-cash-discount');
  if (['access', 'term', 'bundle', 'experience'].includes(angle)) tags.add('value-add');
  if (angle === 'capacity') tags.add('off-peak');
  if (angle === 'experience') tags.add('high-ticket');
  if (base.isIntroOffer) tags.add('first-purchase');
  if (base.privateSessionCount || /private/i.test(base.name)) tags.add('capacity-constrained');
  if (req.objectives.includes('encourage_referrals')) tags.add('referral');
  if (req.constraints?.festive) tags.add('seasonal');
  if (req.mode === 'random' && req.presetId === 'completely-unexpected') tags.add('test-idea');
  return Array.from(tags);
}

function collectionFor(audience: AudienceSegment[], objectives: CommercialObjective[]): string {
  if (audience.includes('first_time_customers') || objectives.includes('acquire_new_members')) return 'col-new-client';
  if (objectives.includes('reactivate_lapsed') || audience.includes('long_lapsed_members')) return 'col-winback';
  if (audience.includes('recently_expired_members') || objectives.includes('increase_renewals')) return 'col-renewal';
  if (objectives.includes('encourage_referrals') || audience.includes('referral_customers')) return 'col-referral';
  if (objectives.includes('upsell_private_training') || audience.includes('private_training_clients')) return 'col-private';
  if (audience.includes('high_value_clients') || objectives.includes('increase_atv')) return 'col-premium';
  if (objectives.includes('drive_offpeak')) return 'col-limited';
  if (audience.includes('corporate_clients')) return 'col-corporate';
  return 'col-experimental';
}

function buildStrategy(args: {
  name: string; base: CatalogueProduct; angle: { key: AngleKey; label: string; thesis: string };
  economics: ResolvedEconomics; audience: AudienceSegment[]; objectives: CommercialObjective[];
  components: OfferComponent[]; guardrails: ReturnType<typeof evaluateGuardrails>;
  cannibalisation: ReturnType<typeof detectCannibalisation>; evidence?: EvidenceContext; req: GenerateRequest;
}): OfferStrategy {
  const { name, base, angle, economics: e, audience, objectives, guardrails, cannibalisation } = args;
  const audienceText = audience.map(a => AUDIENCE_PLAYS[a]?.label ?? a).join(', ');
  const objectiveText = objectives.map(o => OBJECTIVE_PLAYS[o]?.label ?? o).join(', ');
  const facts: string[] = [];
  const estimates: string[] = [];
  const assumptions: string[] = [];
  const recommendations: string[] = [];

  facts.push(`Base product: ${base.name} at ${formatINR(base.price)}${base.credits ? `, ${base.credits} credits` : base.unlimitedAccess ? ', unlimited access' : ''}.`);
  if (e.sellingPrice != null) facts.push(`Proposed price ${formatINR(e.sellingPrice)}${e.discountPct ? ` — a ${e.discountPct.toFixed(1)}% reduction (${formatINR(e.discountAmount)} per sale).` : ' — no cash discount applied.'}`);
  if (e.effectivePricePerClass != null) facts.push(`Effective ${formatINR(Math.round(e.effectivePricePerClass))} per class across the included credits.`);
  if (e.customerValueReceived) facts.push(`Customer value received ${formatINR(e.customerValueReceived)} valued at the catalogue's own standard rates (studio single class and private class rates from the Bengaluru price list).`);
  if (base.observed) facts.push(`Observed Bengaluru sales for the base product: ${base.observed.units} units, ${formatINR(base.observed.revenue, { compact: true })} revenue, average realised ${formatINR(base.observed.avgRealisedPrice)}.`);
  if (e.unlimitedAccess && e.attendance) facts.push(`Unlimited access is valued at ${e.attendance.visitsPerMonth} visits/month (${e.attendance.source}).`);

  estimates.push(`Scorecard assessment of customer attractiveness and revenue retention is a heuristic read of this offer's own structure — it is not a modelled conversion rate or a validated prediction.`);
  if (args.evidence?.customerBase) estimates.push(`Reference point only: median Bengaluru member attendance is ${args.evidence.customerBase.behaviour?.avgSessionsPerMonth?.median ?? '—'} sessions/month and the median time since last visit among lapsed members is ${args.evidence.customerBase.behaviour?.daysSinceLastVisit?.median ?? '—'} days.`);

  assumptions.push('No post-launch performance data exists for this concept, so nothing here is a forecast.');
  if (e.unlimitedAccess) assumptions.push(`Cost per visit depends on actual attendance, which the studio controls only indirectly.`);
  if (e.privateSessions > 0) assumptions.push(`${e.privateSessions} private session(s) require trainer capacity to be reserved before launch.`);

  recommendations.push(...guardrails.filter(g => !g.passed).map(g => `${g.severity === 'blocker' ? 'Blocker' : 'Check'}: ${g.detail}`));
  if (!cannibalisation.length) recommendations.push('No displacement risk detected against the standing catalogue at this price.');
  recommendations.push(`Route through: ${approvalRoute(guardrails, e)}.`);

  const concept = `${angle.label} proposition built on ${base.name}: ${describeValue(e)}.` + (e.discountPct ? ` A ${e.discountPct.toFixed(0)}% reduction brings it to ${formatINR(e.sellingPrice)}.` : ' Sold at list price with added access rather than a price cut.');

  const whyItWorks = [
    AUDIENCE_PLAYS[audience[0]]?.rationale ?? 'Chosen to fit the audience stated in the brief.',
    OBJECTIVE_PLAYS[objectives[0]]?.guard ?? '',
    angle.thesis,
  ].filter(Boolean).join(' ');

  const customerAppeal = (() => {
    const parts: string[] = [];
    if (e.customerSavings) parts.push(`An extra ${formatINR(e.customerSavings)} of value at standard rates.`);
    if (e.privateSessions) parts.push('Personal attention, which is the hardest thing to buy piecemeal.');
    if (e.guestPasses) parts.push('Something to give away — socially valuable and free to the studio at the point of sale.');
    if (e.validityDeltaDays > 0) parts.push(`More time to use it (${e.validityDeltaDays} extra days), which answers the real reason packs go unused.`);
    if (e.discountPct) parts.push(`A visible price reduction of ${e.discountPct.toFixed(0)}% — the simplest thing to say out loud.`);
    return parts.join(' ') || 'A clean, clearly-priced proposition.';
  })();

  const commercialImpact = [
    e.discountAmount ? `Revenue per sale falls ${formatINR(e.discountAmount)} versus ${base.name}; ${e.breakEvenUnits} sales are needed to match the revenue of one list-price sale.` : `Revenue per sale is unchanged at ${formatINR(e.sellingPrice)}.`,
    e.effectivePricePerClass ? `Effective price per class: ${formatINR(Math.round(e.effectivePricePerClass))}.` : '',
    cannibalisation.length ? `Displacement risks identified against ${cannibalisation.length} standing product(s).` : 'No displacement against the standing catalogue found.',
  ].filter(Boolean).join(' ');

  const risks = [
    ...cannibalisation.map(c => `${c.productName}: ${c.detail}`),
    ...guardrails.filter(g => !g.passed).map(g => g.detail),
    !facts.some(f => f.includes('Observed')) ? 'The base product has no observed sales in the export, so there is nothing to check the concept against.' : '',
  ].filter(Boolean).slice(0, 5);

  return {
    offerName: name,
    concept,
    whyItWorks,
    customerAppeal,
    commercialImpact,
    risks: risks.length ? risks : ['No material risk flagged by the configured guardrails — review commercially before launch.'],
    recommendedAudience: `${audienceText}. Objective: ${objectiveText}.`,
    salesPitch: generateMessages({
      name, description: concept, locationLabel: LOCATION_LABELS[args.req.locationIds[0]] ?? 'Bengaluru studios',
      economics: e, audienceSegments: audience, objectives, baseProductName: base.name,
      deadlines: { purchaseDeadline: e.validityDays ? null : null, redeemableTo: null },
    }).verbalScript,
    alternativeApproach: alternativeFor(angle.key, base, e),
    facts, estimates,
    assumptions,
    recommendations,
  };
}

function describeValue(e: ResolvedEconomics): string {
  const bits = [
    e.includedCredits ? `${e.includedCredits} class credits` : e.unlimitedAccess ? 'unlimited studio access' : null,
    e.bonusCredits ? `+${e.bonusCredits} bonus credits` : null,
    e.complimentaryClasses ? `+${e.complimentaryClasses} complimentary classes` : null,
    e.privateSessions ? `${e.privateSessions} private session(s)` : null,
    e.guestPasses ? `${e.guestPasses} guest pass(es)` : null,
    e.validityDays ? `${e.validityDays} days validity` : null,
  ].filter(Boolean);
  return bits.join(', ');
}

function alternativeFor(angle: AngleKey, base: CatalogueProduct, e: ResolvedEconomics): string {
  switch (angle) {
    case 'price':
      return `Same economics delivered as access instead of cash: keep ${formatINR(base.price)} and add ${Math.max(2, Math.round((e.discountAmount ?? 0) / (e.effectivePricePerClass ?? 1200)))} extra classes. The customer sees comparable value and the headline price stays intact.`;
    case 'access':
      return `If the audience needs a price signal, convert one bonus credit into an equivalent rupee reduction and cap it at the configured ceiling so the discount stays inside policy.`;
    case 'experience':
      return `For a lower-delivery-cost version, swap one private session for two studio credits plus priority booking — similar perceived value, no trainer capacity required.`;
    case 'term':
      return `If the step-up is not landing, shorten the term by one month and hold the extra validity; the commitment ask becomes smaller without changing the value story.`;
    case 'frequency':
      return `Replace the bonus credits with a fixed 4-week cadence challenge at the same price; it changes behaviour rather than inventory.`;
    case 'capacity':
      return `Run the same price for a 6-week window instead of a 2-week one, or restrict to a single weekday morning band, to concentrate the effect on genuinely quiet sessions.`;
    case 'social':
      return `Cap the guest pass at one per member and add a small credit for the member only when the guest purchases — the reward then attaches to a real conversion.`;
    case 'bundle':
      return `Offer the private sessions as an upgrade at the point of purchase instead of bundling them, so members who do not want them do not pay for them.`;
  }
}

function approvalRoute(guardrails: ReturnType<typeof evaluateGuardrails>, e: ResolvedEconomics): string {
  const blockers = guardrails.filter(g => !g.passed && g.severity === 'blocker');
  if (blockers.length) return 'resolve the blockers above before submitting for review';
  return (e.discountPct ?? 0) > 15 || (e.customerSavingsPct ?? 0) > 30
    ? 'manager approval required (above the configured approval threshold)'
    : 'standard manager review';
}

function evidenceNotes(base: CatalogueProduct, e: ResolvedEconomics, evidence?: EvidenceContext): string[] {
  const notes: string[] = [];
  if (base.observed && base.observed.unitsLast90d > 0) notes.push(`Base product sold ${base.observed.unitsLast90d} units in the last 90 days of the sales export.`);
  if (evidence?.capacity?.byStudioDayBand && ['drive_offpeak'].length) {
    const rows = (evidence.capacity.byStudioDayBand as any[]).filter(r => r.studio === base.locationName);
    if (rows.length) {
      const quiet = [...rows].sort((a, b) => (a.utilisationPct ?? 100) - (b.utilisationPct ?? 100))[0];
      notes.push(`Quietest observed window at this studio: ${quiet.day} ${quiet.timeBand} at ${quiet.utilisationPct}% utilisation.`);
    }
  }
  if (evidence?.funnel?.byStudio) {
    const row = (evidence.funnel.byStudio as any[]).find(s => s.studio === base.locationName);
    if (row) notes.push(`Observed enquiry → sale conversion at this studio: ${row.conversionOfLeadsPct}% of ${row.leads} enquiries. This is context for planning, not a prediction for this offer.`);
  }
  return notes;
}

/** Remix: targeted adjustments that preserve locked attributes. */
export function remixProposal(args: {
  proposal: OfferProposal; action: 'more_attractive' | 'protect_revenue' | 'increase_perceived_value' | 'reduce_discount' | 'add_twist';
  guardrails: GuardrailConfig; catalogue: CatalogueProduct[]; costs: CostAssumptions; attendance: AttendanceAssumptions;
}): OfferProposal {
  const { proposal, action, guardrails } = args;
  const terms: OfferTerms = { ...proposal.terms };
  const notes: string[] = [];
  const base = args.catalogue.find(p => p.id === proposal.baseProductId) ?? null;
  const classLimit = guardrails.maxDiscountPctByClass[base?.productClass ?? 'standard_retail'] ?? guardrails.maxDiscountPct;
  switch (action) {
    case 'more_attractive':
      if (terms.discountPct) terms.discountPct = Math.min(classLimit, Math.round(terms.discountPct * 1.35));
      else terms.bonusCredits = (terms.bonusCredits ?? 0) + 2;
      if (!terms.complimentaryClasses) terms.complimentaryClasses = 1;
      notes.push('Increased perceived value on the mechanisms that cost the least to deliver first.');
      break;
    case 'protect_revenue':
      if (terms.discountPct) { terms.discountPct = Math.max(0, Math.round(terms.discountPct * 0.5)); notes.push('Halved the cash discount and shifted weight to access-based value.'); }
      terms.validityExtensionDays = (terms.validityExtensionDays ?? 0) + 14;
      terms.guestPasses = Math.min(guardrails.maxGuestPasses, (terms.guestPasses ?? 0) + 1);
      if (!notes.length) notes.push('Already value-add led; added validity and a guest pass to keep the value story strong.');
      break;
    case 'increase_perceived_value':
      terms.bonusCredits = (terms.bonusCredits ?? 0) + 1;
      if (proposal.economics.unlimitedAccess) terms.guestPasses = Math.min(guardrails.maxGuestPasses, (terms.guestPasses ?? 0) + 1);
      else terms.privateSessions = (terms.privateSessions ?? 0) + 1;
      notes.push('Added high-visibility inclusions without touching the headline price.');
      break;
    case 'reduce_discount':
      terms.discountPct = terms.discountPct ? Math.max(0, Math.round(terms.discountPct * 0.6)) : null;
      terms.pricingMode = terms.discountPct ? 'discount_pct' : 'value_add';
      notes.push('Reduced discount depth; price is now closer to list.');
      break;
    case 'add_twist':
      terms.guestPasses = Math.min(guardrails.maxGuestPasses, (terms.guestPasses ?? 0) + 1);
      terms.validityExtensionDays = (terms.validityExtensionDays ?? 0) + 7;
      notes.push('Added a social and time-based twist to separate the offer from ordinary promotions.');
      break;
  }
  const regenerated = generateProposals({
    catalogue: args.catalogue, guardrails, costs: args.costs, attendance: args.attendance,
    audience: proposal.audienceSegments, objectives: proposal.objectives, locationIds: proposal.locationIds,
    controls: { creativity: 50, discountAggressiveness: 45, customerAttractiveness: 70, revenueProtection: 60, complexity: 45 },
    count: 1, mode: 'remix', seed: Date.now() % 10000,
    locked: { baseProductId: proposal.baseProductId, audience: true, objectives: true, discount: terms.discountPct ?? 0, validityDays: terms.validityDays, structure: proposal.components.map(c => c.kind), naming: proposal.name },
  });
  const next = regenerated[0] ?? proposal;
  return {
    ...next,
    proposalId: `${proposal.proposalId}-r${Math.random().toString(36).slice(2, 6)}`,
    strategy: {
      ...next.strategy,
      concept: `${next.strategy.concept} Remix: ${notes.join(' ')}`,
      facts: [...next.strategy.facts, ...notes],
      alternativeApproach: proposal.strategy.alternativeApproach,
    },
    nameOptions: proposal.nameOptions,
  };
}
