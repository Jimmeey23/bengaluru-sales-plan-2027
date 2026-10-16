/**
 * Engine facade: turns a stored offer + settings + catalogue into ComputedMetrics.
 * This is the single source of truth for every calculated number in the product.
 */
import type {
  AttendanceAssumptions, CatalogueProduct, ComputedMetrics, CostAssumptions,
  GuardrailConfig, Offer, OfferComponent,
} from '@/lib/types';
import {
  ENGINE_VERSION, buildReferenceRates, componentsFromTerms, formatINR, normaliseTerms, resolveEconomics,
  type ReferenceRates, type ResolvedEconomics,
} from './pricing';
import { evaluateGuardrails, similarity, worstSeverity } from './guardrails';
import { buildScorecard, detectCannibalisation } from './analysis';

export * from './pricing';
export * from './guardrails';
export * from './analysis';
export { simulateScenarios, buildSimulationSummary, SIMULATOR_PRESETS, DISCLAIMER } from './simulator';
export * from './copy';
export * from './templates';
export * from './recommend';

export interface EngineContext {
  catalogue: CatalogueProduct[];
  guardrails: GuardrailConfig;
  costs: CostAssumptions;
  attendance: AttendanceAssumptions;
  allOffers?: Offer[];
  locationLabel?: string;
}

export interface OfferComputation {
  economics: ResolvedEconomics;
  metrics: ComputedMetrics;
}

export function computeOfferMetrics(offer: Offer, ctx: EngineContext): OfferComputation {
  const baseProduct = offer.baseProductId ? ctx.catalogue.find(p => p.id === offer.baseProductId) ?? null : null;
  const reference: ReferenceRates = buildReferenceRates(ctx.catalogue);
  const terms = normaliseTerms(offer.terms, baseProduct);
  const economics = resolveEconomics({
    baseProduct, terms, guardrails: ctx.guardrails, costs: ctx.costs, attendance: ctx.attendance,
    reference, catalogue: ctx.catalogue, audienceSegments: offer.audienceSegments,
  });

  const duplicates = (ctx.allOffers ?? [])
    .filter(o => o.id !== offer.id && o.status !== 'archived')
    .map(o => ({ id: o.id, name: o.name, similarity: similarity(offer, o) }))
    .filter(d => d.similarity >= 0.62)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  const cannibalisation = detectCannibalisation({ economics, baseProduct, catalogue: ctx.catalogue, audienceSegments: offer.audienceSegments });

  const guardrails = evaluateGuardrails({
    offer, baseProduct, economics, guardrails: ctx.guardrails, duplicates, catalogue: ctx.catalogue,
    locationLabel: ctx.locationLabel ?? offer.locationIds.join(', '),
  });

  const components: OfferComponent[] = offer.components?.length ? offer.components : componentsFromTerms(terms);
  const scorecard = buildScorecard({
    economics,
    audienceSegments: offer.audienceSegments,
    objectives: offer.objectives,
    componentsCount: components.length,
    baseProduct,
    cannibalisation,
    guardrailsFailed: guardrails.filter(g => !g.passed).length,
    evidenceTags: baseProduct?.observed ? ['observed_sales'] : [],
  });

  const metrics: ComputedMetrics = {
    computedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    listPrice: economics.listPrice,
    sellingPrice: economics.sellingPrice,
    discountAmount: economics.discountAmount,
    discountPct: economics.discountPct,
    includedCredits: economics.includedCredits,
    totalCreditsValue: (economics.includedCredits ?? 0) + economics.bonusCredits + economics.complimentaryClasses,
    effectivePricePerClass: economics.effectivePricePerClass,
    effectivePricePerVisit: economics.effectivePricePerVisit,
    attendanceAssumption: economics.attendance,
    customerValueReceived: economics.customerValueReceived,
    valueAddPct: economics.valueAddPct,
    customerSavings: economics.customerSavings,
    customerSavingsPct: economics.customerSavingsPct,
    revenueDeltaVsReference: economics.revenueDeltaVsReference,
    revenueRetentionPct: economics.revenueRetentionPct,
    breakEvenUnits: economics.breakEvenUnits,
    validityDays: economics.validityDays,
    validityDeltaDays: economics.validityDeltaDays,
    valuePerRupee: economics.valuePerRupee,
    deliveryCostEstimate: economics.deliveryCostEstimate,
    contributionMargin: economics.contributionMargin,
    contributionMarginPct: economics.contributionMarginPct,
    costBasis: economics.costBasis,
    cannibalisation,
    guardrails,
    scorecard,
    notes: [
      ...economics.notes,
      `Computed by pricing engine v${ENGINE_VERSION} on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Figures are derived from the catalogue, the offer terms and the configured assumptions — no AI model is involved in this calculation.`,
    ],
  };

  return { economics, metrics };
}

export function metricsSummaryLine(m: ComputedMetrics | null): string {
  if (!m) return 'Not yet calculated';
  const bits: string[] = [];
  if (m.sellingPrice != null && m.listPrice != null) {
    bits.push(m.sellingPrice === m.listPrice ? `${formatINR(m.sellingPrice)} (list)` : `${formatINR(m.sellingPrice)} vs list ${formatINR(m.listPrice)}`);
  }
  if (m.discountPct) bits.push(`${m.discountPct.toFixed(1)}% off`);
  if (m.effectivePricePerClass) bits.push(`${formatINR(Math.round(m.effectivePricePerClass))}/class`);
  if (m.totalCreditsValue) bits.push(`${m.totalCreditsValue} credits`);
  return bits.join(' · ');
}

export { worstSeverity };
