/**
 * Scenario simulator.
 *
 * The platform will not manufacture demand. The simulator takes the buyer number the user types in,
 * applies multipliers the user can see and edit, and reports what follows — with every intermediate
 * step written into the assumption trace, so no number ever appears without its reason.
 */

import type {
  CatalogueProduct, CostAssumptions, SimulationAssumptions, SimulationResult, SimulationScenario,
} from '@/lib/types';
import { formatINR, type ResolvedEconomics } from './pricing';

export const DISCLAIMER =
  'These figures are projections computed from the assumptions you entered. They are not forecasts, and they are not observed outcomes for this offer — the platform does not supply conversion rates for offers that have not run.';

export const SIMULATOR_PRESETS: { id: string; label: string; description: string; values: Partial<SimulationAssumptions> }[] = [
  {
    id: 'cautious', label: 'Cautious',
    description: 'A small response and heavy switching. Use this when you want to know how the offer behaves if it mostly moves revenue rather than adding it.',
    values: { expectedBuyers: 15, cannibalisationRatePct: 45, scenarioMultipliers: { conservative: 0.6, expected: 1, optimistic: 1.35 } },
  },
  {
    id: 'balanced', label: 'Balanced',
    description: 'Mid-range response with moderate switching. Reasonable when you have no directly comparable past campaign.',
    values: { expectedBuyers: 40, cannibalisationRatePct: 30, scenarioMultipliers: { conservative: 0.7, expected: 1, optimistic: 1.4 } },
  },
  {
    id: 'capacity', label: 'Capacity fill',
    description: 'For off-peak offers where the point is to use places that would otherwise be empty, rather than to make each sale stand alone.',
    values: { expectedBuyers: 60, cannibalisationRatePct: 15, scenarioMultipliers: { conservative: 0.6, expected: 1, optimistic: 1.6 } },
  },
];

export interface SimulateInput {
  economics: ResolvedEconomics;
  assumptions: SimulationAssumptions;
  buyersOverride?: number | null;
  observedConversion?: { pct: number | null; label: string; source: string } | null;
  baseProduct?: CatalogueProduct | null;
  costs?: CostAssumptions | null;
}

export function simulateScenarios(input: SimulateInput): SimulationResult {
  const { economics, assumptions, observedConversion, baseProduct } = input;
  const blockers: string[] = [];
  const trace: string[] = [];

  const buyers = input.buyersOverride ?? assumptions.expectedBuyers;
  if (buyers == null || buyers <= 0) {
    blockers.push('Enter how many buyers you expect. The platform will not supply a demand figure for an offer that has not run.');
  }
  if (economics.sellingPrice == null) blockers.push('The offer has no calculable selling price yet.');
  if (buyers == null || economics.sellingPrice == null) {
    return { ready: false, blockers, scenarios: [], recommendation: 'Complete the missing inputs to see scenarios — nothing is estimated on your behalf.', assumptionTrace: [], disclaimer: DISCLAIMER, observedReference: observedConversion?.pct != null ? observedConversion : null };
  }

  const price = economics.sellingPrice;
  const referencePrice = economics.listPrice ?? price;

  // ---------------------------------------------------------------- units each buyer consumes
  let unitsPerBuyer: number | null = null;
  if (economics.unlimitedAccess) {
    const visitsPerMonth = assumptions.attendancePerMonth ?? economics.attendance?.visitsPerMonth ?? null;
    const months = economics.validityDays != null ? economics.validityDays / 30.44 : null;
    if (visitsPerMonth != null && months != null) {
      unitsPerBuyer = visitsPerMonth * months;
      trace.push(`Unlimited access: ${visitsPerMonth} visits/month × ${months.toFixed(1)} months = ${unitsPerBuyer.toFixed(1)} visits per buyer. ${economics.attendance?.source ?? 'Attendance assumption from settings.'}`);
    } else {
      blockers.push('An unlimited offer needs an attendance assumption before delivery load can be estimated. Set it in Settings → Attendance.');
    }
  } else if (economics.includedCredits != null) {
    unitsPerBuyer = (economics.includedCredits ?? 0) + economics.bonusCredits + economics.complimentaryClasses;
    trace.push(`Credit-based offer: ${economics.includedCredits} classes in the package, plus ${economics.bonusCredits} bonus and ${economics.complimentaryClasses} complimentary = ${unitsPerBuyer} classes per buyer.`);
  } else if (economics.privateSessions > 0) {
    unitsPerBuyer = economics.privateSessions;
    trace.push(`Private-format offer: ${economics.privateSessions} private session(s) per buyer.`);
  } else {
    blockers.push('The offer has no class, visit or session count, so delivery load cannot be estimated.');
  }

  if (blockers.length) {
    return { ready: false, blockers, scenarios: [], recommendation: 'Complete the missing inputs to see scenarios — nothing is estimated on your behalf.', assumptionTrace: trace, disclaimer: DISCLAIMER, observedReference: observedConversion?.pct != null ? observedConversion : null };
  }

  const displacement = Math.min(1, Math.max(0, (assumptions.cannibalisationRatePct ?? 0) / 100));
  const deliveryCostPerClass = assumptions.deliveryCostPerClass ?? input.costs?.deliveryCostPerStudioClass ?? null;

  trace.push(`Buyers: ${buyers} — your input, not a platform estimate.`);
  trace.push(`Displacement: ${(displacement * 100).toFixed(0)}% — these buyers would have purchased something at list price anyway. Entered as an assumption.`);
  trace.push(`Selling price ${formatINR(price)} taken from the pricing engine for this offer, not from the simulator.`);
  trace.push(baseProduct
    ? `Displaced revenue valued at the reference price of ${baseProduct.name} (${formatINR(referencePrice)}).`
    : `Displaced revenue valued at ${formatINR(referencePrice)}.`);
  trace.push(deliveryCostPerClass != null
    ? `Delivery cost ${formatINR(deliveryCostPerClass)} per class visit — ${assumptions.deliveryCostPerClass != null ? 'entered for this simulation' : 'from the configured cost assumptions'}.`
    : 'No delivery cost is configured, so contribution stops at incremental revenue. Revenue is not profit.');

  if (observedConversion?.pct != null) {
    trace.push(`Reference only, not applied: ${observedConversion.label} at ${observedConversion.pct.toFixed(1)}% (${observedConversion.source}). Historical conversion covers all offers combined and is not a rate for this offer.`);
  }

  const multipliers = assumptions.scenarioMultipliers ?? { conservative: 0.7, expected: 1, optimistic: 1.4 };

  const scenarios: SimulationScenario[] = (['conservative', 'expected', 'optimistic'] as const).map(scenario => {
    const mult = multipliers[scenario] ?? 1;
    const scenarioBuyers = Math.max(0, Math.round(buyers * mult));
    const gross = scenarioBuyers * price;
    const displaced = scenarioBuyers * displacement * referencePrice;
    const incremental = gross - displaced;
    const visits = unitsPerBuyer != null ? scenarioBuyers * unitsPerBuyer : 0;
    const delivery = deliveryCostPerClass != null ? visits * deliveryCostPerClass : null;
    const contribution = delivery != null ? incremental - delivery : null;
    return {
      scenario,
      multiplier: mult,
      buyers: scenarioBuyers,
      grossRevenue: Math.round(gross),
      displacedRevenue: Math.round(displaced),
      incrementalRevenue: Math.round(incremental),
      totalVisits: Math.round(visits),
      deliveryCost: delivery != null ? Math.round(delivery) : null,
      contribution: contribution != null ? Math.round(contribution) : null,
      assumptionTrace: [
        `${scenario}: ${buyers} buyers × ${mult} = ${scenarioBuyers} buyers.`,
        `Gross revenue ${scenarioBuyers} × ${formatINR(price)} = ${formatINR(Math.round(gross))}.`,
        `Displaced revenue ${scenarioBuyers} × ${(displacement * 100).toFixed(0)}% × ${formatINR(referencePrice)} = ${formatINR(Math.round(displaced))}.`,
        delivery != null
          ? `Delivery ${Math.round(visits)} visits × ${formatINR(deliveryCostPerClass)} = ${formatINR(Math.round(delivery))}.`
          : 'Delivery cost not configured, so contribution is not calculated.',
      ],
    };
  });

  const conservative = scenarios[0];
  const expected = scenarios[1];
  const optimistic = scenarios[2];

  const recommendation = [
    `On your assumptions this offer produces ${formatINR(expected.incrementalRevenue)} of incremental revenue at the expected case (${formatINR(conservative.incrementalRevenue)} conservative, ${formatINR(optimistic.incrementalRevenue)} optimistic), before any delivery cost.`,
    expected.incrementalRevenue <= 0
      ? 'At this displacement level the offer reduces revenue even before delivery: the price concession is buying volume that already existed. Either tighten eligibility or shift the concession into access.'
      : `Revenue only rises if the extra volume outweighs the ${(displacement * 100).toFixed(0)}% of buyers who would have bought at list price anyway — that ratio, not the headline discount, is what decides this.`,
    deliveryCostPerClass == null
      ? 'Contribution is withheld because no delivery cost is configured. Treat the incremental revenue figure as a ceiling, not a result.'
      : `After delivery the expected contribution is ${formatINR(expected.contribution ?? 0)}, which is the number worth defending in a review.`,
    'Change any assumption and the whole table moves — that sensitivity is the useful part, not any single figure.',
  ].join(' ');

  return {
    ready: true,
    blockers: [],
    scenarios,
    recommendation,
    assumptionTrace: trace,
    disclaimer: DISCLAIMER,
    observedReference: observedConversion?.pct != null ? observedConversion : null,
  };
}

/** One-line summary used in offer lists and approval screens. */
export function buildSimulationSummary(result: SimulationResult): string {
  if (!result.ready) return result.blockers[0] ?? 'Not ready to simulate.';
  const expected = result.scenarios.find(s => s.scenario === 'expected');
  if (!expected) return 'No scenarios computed.';
  const parts = [`${expected.buyers} buyers`, `${formatINR(expected.incrementalRevenue)} incremental`];
  if (expected.contribution != null) parts.push(`${formatINR(expected.contribution)} contribution`);
  else parts.push('contribution not calculated');
  return `${parts.join(' · ')} — projection on entered assumptions.`;
}
