/**
 * Offer generation and strategy endpoint.
 *
 * Two layers, deliberately separated:
 *  1. the local strategist engine (deterministic, catalogue-grounded) — always available, no key needed;
 *  2. optional model provider — contributes language and idea variation only.
 * Numbers always come from the pricing engine, and every response states which layer produced it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb, nowIso, newId } from '@/lib/db';
import { getSettings, listCatalogue, listOffers, getEvidence, getOffer, logActivity, listGenerations } from '@/lib/data';
import {
  generateProposals, generateMessages, suggestOfferNames, parseIntent, remixProposal, computeOfferMetrics, ENGINE_VERSION,
  type GeneratorControls,
} from '@/lib/engine';
import { callModel, parseJsonLoose, resolveProvider } from '@/lib/ai/provider';
import { runStrategist } from '@/lib/ai/strategist';
import type { AudienceSegment, CommercialObjective, LocationId } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LOCAL_LABEL = 'Local strategist engine — deterministic, catalogue-driven (no external model connected)';

export async function GET() {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const settings = getSettings();
  const resolution = resolveProvider(settings.ai);
  const connected = resolution.key != null;
  return NextResponse.json({
    provider: settings.ai.provider,
    model: settings.ai.model,
    keyConfigured: settings.ai.keyConfigured,
    connected,
    label: connected ? `${settings.ai.provider} · ${settings.ai.model}` : LOCAL_LABEL,
    engineVersion: ENGINE_VERSION,
    generations: listGenerations(12),
  });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode ?? 'random');
  const settings = getSettings();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const allOffers = listOffers({ status: 'all', includeArchived: true });
  const evidence = getEvidence();
  const resolution = resolveProvider(settings.ai);
  const connected = resolution.key != null;
  const started = Date.now();

  // ---- interpreted brief ---------------------------------------------------
  const prompt = String(body?.prompt ?? '').trim();
  const intent = prompt ? parseIntent(prompt) : null;
  const audience: AudienceSegment[] = (body?.audience?.length ? body.audience : intent?.audience ?? ['existing_active_members']) as AudienceSegment[];
  const objectives: CommercialObjective[] = (body?.objectives?.length ? body.objectives : intent?.objectives ?? ['increase_renewals']) as CommercialObjective[];
  const locationIds: LocationId[] = (body?.locationIds?.length ? body.locationIds : (intent?.constraints?.locationHint ? [intent.constraints.locationHint] : ['p57-blr-vmr'])) as LocationId[];
  const controls: GeneratorControls = {
    creativity: 55, discountAggressiveness: 45, customerAttractiveness: 60, revenueProtection: 60, complexity: 40,
    durationBias: 'same', segment: 'auto', category: 'auto',
    ...(body?.controls ?? {}),
  };
  const count = Math.max(1, Math.min(8, Number(body?.count ?? 3)));
  const presetId = body?.presetId ?? 'balanced';
  const seed = Number(body?.seed ?? Math.floor(Math.random() * 100000));

  type Mode = 'guided' | 'random' | 'nlq' | 'remix';
  const generationMode: Mode = mode === 'guided' ? 'guided' : mode === 'nlq' ? 'nlq' : mode === 'remix' ? 'remix' : 'random';

  if (mode === 'names') {
    const base = body?.baseProductId ? catalogue.find(p => p.id === body.baseProductId) ?? null : null;
    return NextResponse.json({
      names: suggestOfferNames({ angle: body?.angle ?? 'access', audience, objectives, baseName: base?.name, seed }),
      layer: 'local',
      label: LOCAL_LABEL,
    });
  }

  if (mode === 'messages' || mode === 'pitch') {
    const offer = body?.offerId ? getOffer(String(body.offerId)) : null;
    if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
    const { metrics } = await computeForOffer(offer.id);
    const messages = generateMessages({
      name: offer.name, description: offer.description,
      locationLabel: offer.locationIds.map(l => l.replace(/-/g, ' ')).join(', '),
      economics: metrics as any, audienceSegments: offer.audienceSegments, objectives: offer.objectives,
      baseProductName: offer.baseProductName,
      deadlines: { purchaseDeadline: offer.terms.purchaseDeadline, redeemableTo: offer.terms.redeemableTo },
    });
    let polished = null;
    if (connected) {
      const result = await callModel(resolution, {
        system: 'You are a senior membership sales lead at a premium boutique fitness studio in India. Rewrite the supplied sales copy so it is warm, specific and never pushy. Keep every number exactly as given. Never invent prices, dates, discounts or conversion claims. Reply as JSON: {"headline": "", "whatsappShort": "", "verbalScript": ""}',
        user: JSON.stringify({ headline: messages.headline, whatsappShort: messages.whatsappShort, verbalScript: messages.verbalScript, facts: messages.factsUsed }),
      });
      polished = parseJsonLoose(result.text);
    }
    return NextResponse.json({
      messages, polished,
      layer: connected ? 'remote+local' : 'local',
      label: connected ? `${settings.ai.provider} · ${settings.ai.model}` : LOCAL_LABEL,
      note: connected
        ? 'Copy rewritten by the configured model; every number below still comes from the pricing engine.'
        : 'Copy generated by the local template engine — no external model connected.',
    });
  }

  if (mode === 'strategist') {
    const targetOffer = body?.offerId ? getOffer(String(body.offerId)) : null;
    const result = await runStrategist({
      catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance,
      aiConfig: settings.ai, evidence,
      prompt, audience, objectives, locationIds, controls, count, seed,
      presetId, mode: generationMode === 'nlq' ? 'nlq' : 'guided',
      constraints: intent?.constraints,
      narrativeOnly: Boolean(body?.narrativeOnly),
    });

    // When reviewing an existing offer, attach its live engine numbers to the brief so the
    // strategist reasons about the real record rather than a description of it.
    const focus = targetOffer ? computeOfferMetrics(targetOffer, {
      catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers,
    }) : null;

    logGeneration({
      userId: user.id, mode: 'strategist', provider: result.meta.provider, label: result.meta.providerLabel,
      prompt: prompt || (targetOffer ? `Strategy review of ${targetOffer.name}` : 'Strategy brief requested without a written prompt.'),
      inputs: { audience, objectives, locationIds, controls, offerId: targetOffer?.id ?? null },
      summary: (result.modelNarrative ?? result.proposals[0]?.strategy.concept ?? 'Local strategist brief').slice(0, 240),
      offerIds: [], durationMs: Date.now() - started,
      fallbackReason: result.meta.fallbackReason ?? null,
    });

    return NextResponse.json({
      proposals: result.proposals,
      meta: result.meta,
      interpretation: result.interpretation ?? intent ?? null,
      narrative: result.modelNarrative ?? null,
      focus: focus ? { offerId: targetOffer!.id, name: targetOffer!.name, metrics: focus.metrics } : null,
      layer: result.meta.usedModel ? 'remote+local' : 'local',
      label: result.meta.providerLabel,
    });
  }

  if (mode === 'remix') {
    const source = body?.offerId ? getOffer(String(body.offerId)) : null;
    if (!source) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
    const action = (['more_attractive', 'protect_revenue', 'increase_perceived_value', 'reduce_discount', 'add_twist']
      .includes(String(body?.action)) ? String(body.action) : 'more_attractive') as
      'more_attractive' | 'protect_revenue' | 'increase_perceived_value' | 'reduce_discount' | 'add_twist';
    // Remix always starts from an engine-built proposal anchored on the saved offer, so the
    // remix inherits the same base product, audience and objectives — then varies the structure.
    const anchor = generateProposals({
      catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance,
      audience: source.audienceSegments.length ? source.audienceSegments : audience,
      objectives: source.objectives.length ? source.objectives : objectives,
      locationIds: source.locationIds.length ? source.locationIds : locationIds,
      controls, count: 1, seed, mode: 'remix', presetId,
      locked: { baseProductId: source.baseProductId, naming: source.name },
    })[0];
    if (!anchor) return NextResponse.json({ error: 'Could not build a proposal from this offer — set a base package first.' }, { status: 422 });
    const proposal = remixProposal({
      proposal: anchor,
      catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance,
      action,
    });
    return NextResponse.json({ proposal, layer: 'local', label: LOCAL_LABEL, action });
  }

  // guided / random / nlq
  const proposals = generateProposals({
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance,
    audience, objectives, locationIds, controls, count, presetId, seed, prompt,
    mode: generationMode, evidence,
    locked: body?.locked ?? undefined,
    constraints: intent?.constraints ?? body?.constraints ?? undefined,
  });

  let engineNotes: string[] = [];
  let providerLabel = LOCAL_LABEL;
  if (connected) {
    providerLabel = `${settings.ai.provider} · ${settings.ai.model}`;
    const result = await callModel(resolution, {
      system: `You write offer concepts for Physique 57 India. The deterministic engine has already produced ${proposals.length} offers with fixed prices and terms. Do not change any number, price, credit count or date. You may only improve the wording of each concept and supply one alternative headline per offer. Reply as JSON: {"notes": string[], "concepts": [{"index": number, "concept": string, "headline": string}]}`,
      user: JSON.stringify(proposals.map((p, i) => ({ index: i, name: p.name, concept: p.strategy.concept, price: p.economics.sellingPrice, facts: p.strategy.facts }))),
    });
    const parsed = parseJsonLoose(result.text);
    if (parsed?.concepts) {
      for (const c of parsed.concepts) {
        const target = proposals[c.index];
        if (target && typeof c.concept === 'string') target.strategy.concept = c.concept;
      }
    }
    if (Array.isArray(parsed?.notes)) engineNotes = parsed.notes.map(String);
  }

  logGeneration({
    userId: user.id, mode: generationMode, provider: connected ? settings.ai.provider : 'local_strategist',
    label: providerLabel, prompt: prompt || `${generationMode} generation · ${presetId}`,
    inputs: { audience, objectives, locationIds, controls, count, seed, presetId },
    summary: proposals.map(p => `${p.name} — ${p.angleLabel} on ${p.baseProductName}`).join('; ').slice(0, 400),
    offerIds: [], durationMs: Date.now() - started, fallbackReason: null,
  });

  return NextResponse.json({
    proposals,
    interpretation: intent,
    layer: connected ? 'remote+local' : 'local',
    label: providerLabel,
    notes: engineNotes,
    engineVersion: ENGINE_VERSION,
  });
}

async function computeForOffer(offerId: string) {
  const settings = getSettings();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const offer = getOffer(offerId);
  const all = listOffers({ status: 'all', includeArchived: true });
  return computeOfferMetrics(offer!, {
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: all,
  });
}

function logGeneration(entry: {
  userId: string; mode: string; provider: string; label: string; prompt: string; inputs: unknown;
  summary: string; offerIds: string[]; durationMs: number; fallbackReason?: string | null;
}) {
  getDb().prepare(`INSERT INTO ai_generations (id,created_by,mode,provider,provider_label,prompt,inputs_json,output_summary,offer_ids_json,duration_ms,fallback_reason,engine_version,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    newId('gen'), entry.userId, entry.mode, entry.provider, entry.label, entry.prompt,
    JSON.stringify(entry.inputs), entry.summary, JSON.stringify(entry.offerIds),
    entry.durationMs, entry.fallbackReason ?? null, ENGINE_VERSION, nowIso());
}

/** Persist chosen proposals into the offer bank. Used by the generator's save action. */
export async function PUT(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const proposals: any[] = Array.isArray(body?.proposals) ? body.proposals : [];
  if (!proposals.length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  const { remixOfferToOffer } = await import('@/lib/data/offers');
  const saved: string[] = [];
  for (const p of proposals) {
    const offer = remixOfferToOffer(p, user, { collectionIds: body?.collectionIds, campaignId: body?.campaignId ?? null });
    if (offer) saved.push(offer.id);
  }
  logActivity({
    actorId: user.id, action: 'saved_generated_offers', entityType: 'offer', entityId: saved[0] ?? 'batch',
    entityLabel: `${saved.length} generated concept${saved.length === 1 ? '' : 's'}`,
    detail: `Saved from the ${String(body?.mode ?? 'generator')} generator as draft concepts.`,
  });
  return NextResponse.json({ saved, message: `${saved.length} concept${saved.length === 1 ? '' : 's'} saved to the offer bank as drafts.` });
}
