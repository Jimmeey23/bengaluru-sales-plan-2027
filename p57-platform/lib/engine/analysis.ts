/**
 * Cannibalisation detection + offer scorecard.
 * Both are deterministic and explainable; scores are explicitly heuristic, never presented as
 * statistically validated conversion forecasts.
 */
import type { AudienceSegment, CatalogueProduct, CannibalisationFinding, ScorecardResult } from '@/lib/types';
import { formatINR, type ResolvedEconomics } from './pricing';
import { formatFamily } from './guardrails';

export interface CannibalisationInput {
  economics: ResolvedEconomics;
  baseProduct: CatalogueProduct | null;
  catalogue: CatalogueProduct[];
  audienceSegments: AudienceSegment[];
}

/** Revenues that a discount on a high-volume line would put at risk — grounded in observed sales. */
export function detectCannibalisation(input: CannibalisationInput): CannibalisationFinding[] {
  const { economics, baseProduct, catalogue, audienceSegments } = input;
  const findings: CannibalisationFinding[] = [];
  if (!baseProduct || economics.sellingPrice == null || economics.listPrice == null) return findings;

  // 1. Direct price displacement inside the same *kind* of purchase.
  //    A group class, an unlimited membership and a private session are not substitutes, so they
  //    are never compared to each other — only like-for-like formats are.
  const baseFamily = formatFamily(baseProduct);
  const family = catalogue.filter(p =>
    p.id !== baseProduct.id && p.status !== 'archived' && p.price != null &&
    p.locationId === baseProduct.locationId &&
    p.productClass === 'standard_retail' &&
    formatFamily(p) === baseFamily
  );
  for (const p of family) {
    const offerPerCredit = economics.effectivePricePerClass;
    const otherPerCredit = p.credits ? (p.price as number) / (p.credits as number) : null;
    if (offerPerCredit != null && otherPerCredit != null && p.credits && p.credits >= 4 &&
        offerPerCredit < otherPerCredit * 0.85 && offerPerCredit > otherPerCredit * 0.2) {
      const pct = Math.round((1 - offerPerCredit / otherPerCredit) * 100);
      findings.push({
        severity: pct > 25 ? 'high' : 'medium',
        productId: p.id, productName: p.name,
        metric: `${formatINR(Math.round(offerPerCredit))} vs ${formatINR(Math.round(otherPerCredit))} per class`,
        detail: `This offer prices a class ${pct}% below ${p.name}. Buyers who compare will move to the offer, and the standing product becomes hard to sell at list price afterwards.`,
      });
    }
  }

  // 2. Long-commitment products losing their reason to exist
  const longerTerms = catalogue.filter(p =>
    p.id !== baseProduct.id && baseFamily === 'unlimited' && p.unlimitedAccess && p.price != null && p.duration != null && p.durationUnit === 'months' &&
    baseProduct.duration != null && (p.duration as number) > (baseProduct.duration as number)
  );
  for (const p of longerTerms) {
    const months = p.duration as number;
    const perMonth = (p.price as number) / months;
    const offerMonths = baseProduct.unlimitedAccess && baseProduct.durationUnit === 'months' ? (baseProduct.duration as number) : null;
    if (offerMonths && economics.sellingPrice != null && economics.sellingPrice / offerMonths < perMonth * 0.9) {
      findings.push({
        severity: 'medium',
        productId: p.id, productName: p.name,
        metric: `${formatINR(Math.round((economics.sellingPrice ?? 0) / offerMonths))} vs ${formatINR(Math.round(perMonth))} per month`,
        detail: `A discounted ${offerMonths}-month commitment works out cheaper per month than ${p.name}. Members on shorter terms may step down instead of stepping up, which pulls against the longer-commitment objective.`,
      });
    }
  }

  // 3. Discount depth against observed revenue concentration
  const observed = baseProduct.observed;
  if (observed && observed.units > 50 && (economics.discountPct ?? 0) > 10) {
    findings.push({
      severity: 'high',
      productId: baseProduct.id, productName: baseProduct.name,
      metric: `${observed.units} units sold · ${formatINR(observed.revenue, { compact: true })} observed`,
      detail: `${baseProduct.name} is one of the studio's highest-volume lines (${observed.units} units in the Bengaluru sales export). Every rupee taken off it is a rupee removed from the revenue line the studio depends on most, rather than a rupee invested in new demand. Consider a value-add instead of a cash discount.`,
    });
  }

  // 4. Audience overlap with the standing renewal motion
  if (audienceSegments.includes('existing_active_members') && (economics.discountPct ?? 0) > 0) {
    findings.push({
      severity: 'low',
      productId: baseProduct.id, productName: baseProduct.name,
      metric: `discount applies to existing members`,
      detail: 'Discounting active members trains the base to wait for the next promotion. If the objective is frequency or commitment, a value-add usually holds price better.',
    });
  }

  // 5. Offer that is cheaper than a smaller pack of the same family
  const smaller = catalogue.filter(p =>
    p.id !== baseProduct.id && p.credits != null && baseProduct.credits != null &&
    (p.credits as number) < (baseProduct.credits as number) && p.price != null &&
    p.productClass === 'standard_retail' && formatFamily(p) === baseFamily &&
    (economics.sellingPrice ?? 0) <= (p.price as number) * 0.95
  );
  for (const p of smaller) {
    findings.push({
      severity: 'medium',
      productId: p.id, productName: p.name,
      metric: `offer ${formatINR(economics.sellingPrice)} ≤ ${p.name} ${formatINR(p.price as number)}`,
      detail: `This offer costs the same or less than the smaller ${p.name}, while giving more. It makes the smaller pack uneconomic for anyone who sees both.`,
    });
  }

  return findings.slice(0, 6);
}

export interface ScorecardInput {
  economics: ResolvedEconomics;
  audienceSegments: AudienceSegment[];
  objectives: string[];
  componentsCount: number;
  baseProduct: CatalogueProduct | null;
  cannibalisation: CannibalisationFinding[];
  guardrailsFailed: number;
  evidenceTags: string[];
}

const clamp = (n: number, max = 10) => Math.max(0, Math.min(max, Math.round(n * 10) / 10));

export function buildScorecard(input: ScorecardInput): ScorecardResult {
  const { economics, audienceSegments, componentsCount, baseProduct, cannibalisation, guardrailsFailed } = input;
  const dims: ScorecardResult['dimensions'] = [];

  // Customer attractiveness — savings depth, value-add mix, entry clarity
  const savings = economics.customerSavingsPct ?? 0;
  const valueAddUnits = economics.bonusCredits + economics.complimentaryClasses + economics.privateSessions + economics.guestPasses;
  let attract = 4 + Math.min(savings / 4, 4) + Math.min(valueAddUnits, 3) * 0.6;
  if (economics.customerValueReceived && economics.sellingPrice && economics.customerValueReceived / economics.sellingPrice >= 1.3) attract += 1;
  dims.push({
    key: 'attractiveness', label: 'Customer attractiveness', score: clamp(attract), max: 10, basis: 'heuristic',
    reasoning: `Perceived value of ${formatINR(economics.customerValueReceived)} against a ${formatINR(economics.sellingPrice)} price (${savings.toFixed(1)}% saving) with ${valueAddUnits} value-add unit(s).`,
  });

  // Commercial sustainability — how much revenue is retained and how concentrated the risk is
  const retention = economics.revenueRetentionPct ?? 100;
  let sustain = retrievalToScore(retention);
  if (cannibalisation.some(c => c.severity === 'high')) sustain -= 2.5;
  else if (cannibalisation.length) sustain -= 1;
  sustain -= guardrailsFailed * 0.6;
  dims.push({
    key: 'sustainability', label: 'Commercial sustainability', score: clamp(sustain), max: 10, basis: 'calculated',
    reasoning: `Retains ${retention.toFixed(1)}% of the reference price, with ${cannibalisation.length} displacement risk(s) and ${guardrailsFailed} failed guardrail(s). ${economics.breakEvenUnits ? `Needs ${economics.breakEvenUnits} sales to match one list-price sale.` : ''}`,
  });

  // Clarity — fewer mechanics, round numbers, one clear ask
  let clarity = 10 - Math.max(0, componentsCount - 1) * 1.4;
  if (economics.sellingPrice != null && economics.sellingPrice % 500 === 0) clarity += 0.8;
  if ((economics.discountPct ?? 0) > 0 && valueAddUnits > 0) clarity -= 1.2;
  dims.push({
    key: 'clarity', label: 'Clarity of proposition', score: clamp(clarity), max: 10, basis: 'heuristic',
    reasoning: `${componentsCount} commercial mechanic(s)${(economics.discountPct ?? 0) > 0 && valueAddUnits ? ' combining a cash discount with value-adds, which is harder to explain at the desk' : ''}.`,
  });

  // Differentiation — against the standing catalogue
  const standingDiscounts = baseProduct?.observed?.discountGiven ?? 0;
  let diff = 5;
  if (valueAddUnits > 0 && (economics.discountPct ?? 0) === 0) diff += 2.5;
  if (componentsCount > 2) diff += 1;
  if (economics.validityDeltaDays > 0) diff += 1;
  if (standingDiscounts > 0 && (economics.discountPct ?? 0) > 0) diff -= 0.5;
  dims.push({
    key: 'differentiation', label: 'Differentiation', score: clamp(diff), max: 10, basis: 'heuristic',
    reasoning: valueAddUnits > 0
      ? 'Structured as an access/value-add proposition rather than a straight price cut, which separates it from ordinary promotions.'
      : 'Relies primarily on price, which is the most easily copied and least brand-consistent lever.',
  });

  // Audience relevance
  const fit = audienceSegments.length ? 8 + (baseProduct?.isIntroOffer === true && audienceSegments.includes('first_time_customers') ? 1 : 0) : 4;
  dims.push({
    key: 'audience_fit', label: 'Target audience relevance', score: clamp(fit), max: 10, basis: 'heuristic',
    reasoning: `${audienceSegments.length} audience segment(s) selected${baseProduct ? `, built on ${baseProduct.name} — a ${baseProduct.unlimitedAccess ? 'unlimited access' : `${baseProduct.credits ?? '?'}-credit`} product aimed at ${baseProduct.eligibility.newClientsOnly ? 'new clients' : 'the general base'}` : ''}.`,
  });

  // Operational feasibility
  let ops = 9;
  if (economics.privateSessions > 3) ops -= 2.5;
  if (economics.privateSessions > 0) ops -= 1; // trainer capacity needed
  if ((economics.validityDays ?? 0) < 14) ops -= 1.5;
  if (economics.complimentaryClasses > 4) ops -= 1;
  dims.push({
    key: 'feasibility', label: 'Operational feasibility', score: clamp(ops), max: 10, basis: 'heuristic',
    reasoning: `${economics.privateSessions} private session(s) and ${economics.complimentaryClasses} complimentary class(es) to schedule${(economics.validityDays ?? 0) < 14 ? '; a very short redemption window pushes pressure onto the front desk' : ''}.`,
  });

  const weights = { attractiveness: 0.22, sustainability: 0.26, clarity: 0.16, differentiation: 0.12, audience_fit: 0.12, feasibility: 0.12 } as Record<string, number>;
  const overall = Math.round(dims.reduce((s, d) => s + d.score * (weights[d.key] ?? 0), 0) * 10) / 10;

  return {
    overall,
    dimensions: dims,
    disclaimer: 'Heuristic assessment generated by the platform rules engine from the offer\'s own commercial structure. It is a structured prompt for discussion, not a statistically validated conversion prediction.',
  };
}

function retrievalToScore(retention: number): number {
  if (retention >= 100) return 9;
  if (retention >= 92) return 8;
  if (retention >= 85) return 6.5;
  if (retention >= 78) return 5;
  if (retention >= 70) return 3.5;
  return 2;
}

export function estimatedRevenueOpportunity(
  offers: { metrics: ResolvedEconomics | null; expectedBuyers?: number | null }[],
  fallbackPrice: number,
): number | null {
  let total = 0;
  let any = false;
  for (const o of offers) {
    if (!o.metrics?.sellingPrice) continue;
    const buyers = o.expectedBuyers ?? null;
    if (buyers == null) continue;
    any = true;
    total += buyers * o.metrics.sellingPrice;
  }
  return any ? Math.round(total) : null;
}
