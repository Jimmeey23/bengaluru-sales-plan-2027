/**
 * Pricing engine — the deterministic half of the platform.
 *
 * Everything here is arithmetic on the offer's own terms, the catalogue and the settings the
 * business has configured. No AI model touches this file, and the same inputs always produce the
 * same outputs, which is what makes the numbers testable and defensible in a review.
 *
 * Two rules are enforced structurally rather than by convention:
 *  - an unlimited membership is never valued on a fixed credit count; it is valued on an
 *    attendance assumption that is shown wherever the number is used;
 *  - a margin is never stated while the cost basis is empty. Revenue is not profit.
 */

import type {
  AttendanceAssumptions, AudienceSegment, CatalogueProduct, CostAssumptions, GuardrailConfig,
  LocationId, OfferComponent, OfferTerms, SimulationAssumptions, ValueBuildUpItem,
} from '@/lib/types';

export const ENGINE_VERSION = '1.0.1';
export const AS_OF_ISO = '2026-10-16T09:00:00.000Z';

export function formatINR(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (!opts.compact) return `₹${Math.round(value).toLocaleString('en-IN')}`;
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export function durationToDays(duration: number | null | undefined, unit: string | null | undefined): number | null {
  if (duration == null) return null;
  switch (unit) {
    case 'days': return duration;
    case 'weeks': return duration * 7;
    case 'months': return Math.round(duration * 30.44);
    case 'years': return Math.round(duration * 365);
    default: return null;
  }
}

const MONTH_DAYS = 30.44;

// ---------------------------------------------------------------- reference rates

export interface ReferenceRates {
  /** Lowest single-class retail price, per location — "what a class costs bought one at a time". */
  singleClassByLocation: Record<string, number>;
  singleClass: number | null;
  /** Lowest single-session private price, per location. */
  privateSessionByLocation: Record<string, number>;
  privateSession: number | null;
  /** Median price per credit across multi-class packs, per location. */
  creditPackRateByLocation: Record<string, number>;
  /** Median price per credit across the whole catalogue. */
  creditPackRate: number | null;
  sampleSizes: { singleClass: number; privateSessions: number; creditPacks: number };
  /** Provenance line shown next to any value derived from these rates. */
  basis: string;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildReferenceRates(catalogue: CatalogueProduct[]): ReferenceRates {
  // Reference rates are what a class, pack or private session costs when bought at standard retail
  // price. Introductory, complimentary, promotional, operational and bundled records are excluded:
  // an entry price or a comp must never set the benchmark another offer is measured against.
  const sellable = catalogue.filter(p =>
    p.price != null && p.price > 0 && p.status !== 'archived' &&
    p.productClass === 'standard_retail' && !p.isIntroOffer);

  const singles = sellable.filter(p => !p.unlimitedAccess && !p.privateSessionCount && (p.credits === 1 || /single class/i.test(p.name)));
  const singleClassByLocation: Record<string, number> = {};
  for (const p of singles) {
    const current = singleClassByLocation[p.locationId];
    if (current == null || (p.price as number) < current) singleClassByLocation[p.locationId] = p.price as number;
  }

  const privates = sellable.filter(p => p.privateSessionCount === 1);
  const privateSessionByLocation: Record<string, number> = {};
  for (const p of privates) {
    const current = privateSessionByLocation[p.locationId];
    if (current == null || (p.price as number) < current) privateSessionByLocation[p.locationId] = p.price as number;
  }

  const packs = sellable.filter(p => !p.unlimitedAccess && !p.privateSessionCount && p.credits != null && p.credits >= 4);
  const byLocation: Record<string, number[]> = {};
  for (const p of packs) {
    (byLocation[p.locationId] ??= []).push((p.price as number) / (p.credits as number));
  }
  const creditPackRateByLocation: Record<string, number> = {};
  for (const [loc, rates] of Object.entries(byLocation)) {
    const m = median(rates);
    if (m != null) creditPackRateByLocation[loc] = Math.round(m);
  }

  const singleClass = Object.values(singleClassByLocation).length ? Math.min(...Object.values(singleClassByLocation)) : null;
  const privateSession = Object.values(privateSessionByLocation).length ? Math.min(...Object.values(privateSessionByLocation)) : null;
  const creditPackRate = median(packs.map(p => (p.price as number) / (p.credits as number)));

  return {
    singleClassByLocation, singleClass,
    privateSessionByLocation, privateSession,
    creditPackRateByLocation,
    creditPackRate: creditPackRate != null ? Math.round(creditPackRate) : null,
    sampleSizes: { singleClass: singles.length, privateSessions: privates.length, creditPacks: packs.length },
    basis: `Reference rates derived from ${singles.length} single-class product(s), ${privates.length} private single-session product(s) and ${packs.length} multi-class pack(s) at standard retail price in the catalogue export. Introductory, complimentary, promotional and bundled records are excluded so an entry price never sets the benchmark.`,
  };
}

export function classRateFor(rates: ReferenceRates, locationId: LocationId | string | null | undefined, privateToo = false) {
  const loc = locationId ?? null;
  const single = (loc && rates.singleClassByLocation[loc]) || rates.singleClass;
  return { single, private: (loc && rates.privateSessionByLocation[loc]) || rates.privateSession, pack: (loc && rates.creditPackRateByLocation[loc]) || rates.creditPackRate };
}

// ---------------------------------------------------------------- terms

const DEFAULT_TERMS: OfferTerms = {
  pricingMode: 'value_add',
  discountPct: null,
  discountAmount: null,
  sellingPrice: null,
  validityDays: null,
  creditsIncluded: null,
  bonusCredits: null,
  complimentaryClasses: null,
  privateSessions: null,
  guestPasses: null,
  validityExtensionDays: 0,
  purchaseDeadline: null,
  redeemableFrom: null,
  redeemableTo: null,
};

/** Fills in what the catalogue already knows, so a partially-specified offer still prices cleanly. */
export function normaliseTerms(terms: Partial<OfferTerms> | null | undefined, base: CatalogueProduct | null): OfferTerms {
  const t = { ...DEFAULT_TERMS, ...(terms ?? {}) };
  const baseDays = durationToDays(base?.duration ?? null, base?.durationUnit ?? null);
  return {
    pricingMode: t.pricingMode ?? 'value_add',
    discountPct: t.discountPct ?? null,
    discountAmount: t.discountAmount ?? null,
    sellingPrice: t.sellingPrice ?? null,
    validityDays: t.validityDays ?? baseDays ?? null,
    creditsIncluded: t.creditsIncluded ?? (base ? (base.unlimitedAccess ? null : base.credits) : null),
    bonusCredits: t.bonusCredits ?? null,
    complimentaryClasses: t.complimentaryClasses ?? null,
    privateSessions: t.privateSessions ?? null,
    guestPasses: t.guestPasses ?? null,
    validityExtensionDays: t.validityExtensionDays ?? 0,
    purchaseDeadline: t.purchaseDeadline ?? null,
    redeemableFrom: t.redeemableFrom ?? null,
    redeemableTo: t.redeemableTo ?? null,
  };
}

const COMPONENT_LABELS: Record<string, { label: string; unit: string }> = {
  discount_pct: { label: 'Percentage discount', unit: 'pct' },
  discount_amount: { label: 'Fixed discount', unit: 'inr' },
  bonus_credits: { label: 'Bonus classes', unit: 'credits' },
  validity_extension: { label: 'Extra validity', unit: 'days' },
  complimentary_classes: { label: 'Complimentary classes', unit: 'credits' },
  private_sessions: { label: 'Private sessions', unit: 'sessions' },
  guest_passes: { label: 'Guest passes', unit: 'passes' },
  bundle_item: { label: 'Bundled item', unit: 'items' },
  tier_benefit: { label: 'Tier benefit', unit: 'level' },
  referral_credit: { label: 'Referral credit', unit: 'inr' },
};

export function componentsFromTerms(terms: OfferTerms): OfferComponent[] {
  const out: OfferComponent[] = [];
  const push = (kind: keyof typeof COMPONENT_LABELS, value: number | null | undefined, note?: string) => {
    if (value == null || value === 0) return;
    const meta = COMPONENT_LABELS[kind];
    out.push({ id: `cmp_${kind}`, kind: kind as OfferComponent['kind'], value, unit: meta.unit, label: meta.label, note, derived: true });
  };
  if (terms.pricingMode === 'discount_pct') push('discount_pct', terms.discountPct, 'Cash discount applied to the reference price.');
  if (terms.pricingMode === 'discount_amount') push('discount_amount', terms.discountAmount, 'Fixed cash amount off the reference price.');
  push('bonus_credits', terms.bonusCredits, 'Extra classes beyond the base package.');
  push('complimentary_classes', terms.complimentaryClasses, 'Classes given at no charge.');
  push('validity_extension', terms.validityExtensionDays, 'Additional redeemable days.');
  push('private_sessions', terms.privateSessions, 'Private one-to-one sessions.');
  push('guest_passes', terms.guestPasses, 'Passes the member can share.');
  return out;
}

// ---------------------------------------------------------------- economics

export interface ResolvedEconomics {
  listPrice: number | null;
  sellingPrice: number | null;
  discountAmount: number | null;
  discountPct: number | null;
  includedCredits: number | null;
  bonusCredits: number;
  complimentaryClasses: number;
  privateSessions: number;
  guestPasses: number;
  unlimitedAccess: boolean;
  validityDays: number | null;
  validityDeltaDays: number;
  effectivePricePerClass: number | null;
  effectivePricePerVisit: number | null;
  attendance: { visitsPerMonth: number; source: string } | null;
  impliedVisits: number | null;
  customerValueReceived: number | null;
  /** The base package's own composition, valued at the same rate-card prices. */
  baseAccessValue: number | null;
  /** Extra access this offer carries over the base package, as a % of the base package's value. */
  valueAddPct: number | null;
  customerSavings: number | null;
  customerSavingsPct: number | null;
  revenueDeltaVsReference: number | null;
  revenueRetentionPct: number | null;
  breakEvenUnits: number | null;
  valuePerRupee: number | null;
  deliveryCostEstimate: number | null;
  contributionMargin: number | null;
  contributionMarginPct: number | null;
  costBasis: string;
  valueBuildUp: ValueBuildUpItem[];
  notes: string[];
}

export interface ResolveEconomicsInput {
  baseProduct: CatalogueProduct | null;
  terms: OfferTerms;
  guardrails: GuardrailConfig;
  costs: CostAssumptions;
  attendance: AttendanceAssumptions;
  reference: ReferenceRates;
  catalogue: CatalogueProduct[];
  audienceSegments?: AudienceSegment[];
}

export function resolveEconomics(input: ResolveEconomicsInput): ResolvedEconomics {
  const { baseProduct, terms, costs, attendance, reference } = input;
  const notes: string[] = [];
  const locationId = baseProduct?.locationId ?? null;

  const listPrice = baseProduct?.price ?? null;
  const unlimitedAccess = Boolean(baseProduct?.unlimitedAccess);

  // ------------------------------------------------------------ price
  let sellingPrice: number | null = null;
  let discountAmount: number | null = null;
  switch (terms.pricingMode) {
    case 'discount_pct': {
      const pct = terms.discountPct ?? 0;
      if (listPrice != null) {
        discountAmount = Math.round(listPrice * (pct / 100));
        sellingPrice = listPrice - discountAmount;
        notes.push(`Price: ${formatINR(listPrice)} list less ${pct}% (${formatINR(discountAmount)}) = ${formatINR(sellingPrice)}.`);
      } else sellingPrice = terms.sellingPrice ?? null;
      break;
    }
    case 'discount_amount': {
      if (listPrice != null) {
        discountAmount = Math.min(terms.discountAmount ?? 0, listPrice);
        sellingPrice = listPrice - discountAmount;
        notes.push(`Price: ${formatINR(listPrice)} list less a fixed ${formatINR(discountAmount)} = ${formatINR(sellingPrice)}.`);
      } else sellingPrice = terms.sellingPrice ?? null;
      break;
    }
    case 'fixed_price': {
      sellingPrice = terms.sellingPrice ?? null;
      if (sellingPrice != null && listPrice != null) {
        discountAmount = Math.max(0, listPrice - sellingPrice);
        notes.push(`Price: fixed at ${formatINR(sellingPrice)} against a ${formatINR(listPrice)} reference price.`);
      }
      break;
    }
    default: {
      sellingPrice = terms.sellingPrice ?? listPrice;
      discountAmount = sellingPrice != null && listPrice != null ? Math.max(0, listPrice - sellingPrice) : null;
      notes.push('Pricing mode is value-add: the reference price is held and the concession is given in access rather than cash.');
    }
  }
  if (sellingPrice != null) sellingPrice = Math.max(0, Math.round(sellingPrice));
  const discountPct = listPrice && discountAmount != null && listPrice > 0 ? Math.round((discountAmount / listPrice) * 1000) / 10 : null;

  // ------------------------------------------------------------ composition
  const includedCredits = unlimitedAccess ? null : (terms.creditsIncluded ?? baseProduct?.credits ?? null);
  const bonusCredits = Math.max(0, terms.bonusCredits ?? 0);
  const complimentaryClasses = Math.max(0, terms.complimentaryClasses ?? 0);
  const privateSessions = Math.max(0, terms.privateSessions ?? 0);
  const guestPasses = Math.max(0, terms.guestPasses ?? 0);
  const totalCredits = includedCredits != null ? includedCredits + bonusCredits + complimentaryClasses : null;

  const baseDays = durationToDays(baseProduct?.duration ?? null, baseProduct?.durationUnit ?? null);
  const validityDays = terms.validityDays ?? baseDays ?? null;
  const validityDeltaDays = baseDays != null && validityDays != null ? validityDays - baseDays : 0;

  // ------------------------------------------------------------ attendance (unlimited only)
  let attendanceAssumption: ResolvedEconomics['attendance'] = null;
  let impliedVisits: number | null = null;
  if (unlimitedAccess) {
    const visits = (locationId && attendance.visitsPerMonthByLocation?.[locationId]) || attendance.visitsPerMonthDefault || attendance.observedMedianVisitsPerMonth || null;
    const months = validityDays != null ? validityDays / MONTH_DAYS : null;
    if (visits != null) {
      attendanceAssumption = {
        visitsPerMonth: visits,
        source: attendance.source === 'observed_export'
          ? (attendance.sourceNote || 'Assumption derived from the supplied member-base export')
          : attendance.source === 'org_configured'
            ? 'Assumption configured by the business in Settings'
            : 'Platform default — not yet confirmed by the business',
      };
      if (months != null) impliedVisits = visits * months;
      notes.push(`Unlimited membership valued on attendance: ${visits} visits/month${months ? ` × ${months.toFixed(1)} months = ${(impliedVisits ?? 0).toFixed(1)} visits` : ''}. ${attendanceAssumption.source}.`);
    } else {
      notes.push('Unlimited membership, but no attendance assumption is configured — a per-visit figure and any delivery-cost estimate must stay blank until one is set.');
    }
  }

  const months = validityDays != null ? validityDays / MONTH_DAYS : null;
  const effectivePricePerVisit = unlimitedAccess && sellingPrice != null && attendanceAssumption && months
    ? Math.round(sellingPrice / (attendanceAssumption.visitsPerMonth * months))
    : null;
  const effectivePricePerClass = !unlimitedAccess
    ? (totalCredits != null && totalCredits > 0 && sellingPrice != null
      ? Math.round(sellingPrice / totalCredits)
      : privateSessions > 0 && includedCredits == null && sellingPrice != null
        ? Math.round(sellingPrice / privateSessions)
        : null)
    : null;

  // ------------------------------------------------------------ value build-up
  const rates = classRateFor(reference, locationId);
  const valueBuildUp: ValueBuildUpItem[] = [];

  if (unlimitedAccess) {
    if (impliedVisits != null && rates.single != null) {
      valueBuildUp.push({
        label: 'Unlimited studio access', quantity: Math.round(impliedVisits), unitValue: rates.single,
        value: Math.round(impliedVisits * rates.single),
        note: `Assumes ${attendanceAssumption?.visitsPerMonth} visits a month over ${(months ?? 0).toFixed(1)} months, valued at the studio's single-class price.`,
      });
    } else {
      valueBuildUp.push({ label: 'Unlimited studio access', quantity: 0, unitValue: null, value: null, note: 'Not valued — no attendance assumption configured.' });
    }
  } else if (includedCredits != null && includedCredits > 0) {
    valueBuildUp.push({
      label: 'Classes in the base package', quantity: includedCredits, unitValue: rates.single,
      value: rates.single != null ? Math.round(includedCredits * rates.single) : null,
      note: rates.single != null ? `Valued at ${formatINR(rates.single)} — the studio's own single-class price.` : 'Not valued — no single-class reference price found.',
    });
  }
  if (bonusCredits > 0) {
    valueBuildUp.push({ label: 'Bonus classes', quantity: bonusCredits, unitValue: rates.single, value: rates.single != null ? Math.round(bonusCredits * rates.single) : null });
  }
  if (complimentaryClasses > 0) {
    valueBuildUp.push({ label: 'Complimentary classes', quantity: complimentaryClasses, unitValue: rates.single, value: rates.single != null ? Math.round(complimentaryClasses * rates.single) : null });
  }
  if (privateSessions > 0) {
    valueBuildUp.push({ label: 'Private sessions', quantity: privateSessions, unitValue: rates.private, value: rates.private != null ? Math.round(privateSessions * rates.private) : null });
  }
  if (guestPasses > 0) {
    valueBuildUp.push({ label: 'Guest passes', quantity: guestPasses, unitValue: rates.single, value: rates.single != null ? Math.round(guestPasses * rates.single) : null });
  }
  if (validityDeltaDays > 0) {
    // Deliberately unpriced: the catalogue has no list price for extra redeemable days.
    valueBuildUp.push({ label: 'Additional redeemable days', quantity: validityDeltaDays, unitValue: null, value: null, note: 'Shown but not priced — the catalogue has no list price for extra time.' });
  }

  const priced = valueBuildUp.filter(v => v.value != null);
  const customerValueReceived = priced.length ? priced.reduce((sum, v) => sum + (v.value ?? 0), 0) : null;
  // "Value add" measures the concession the offer carries, not the discount the pack already had.
  // The base package's own composition is valued at the same rate-card prices and used as the
  // baseline, so a plain bundle (8 classes for less than 8 walk-ins) is not reported as a giveaway.
  let baseAccessValue: number | null = null;
  if (baseProduct) {
    if (unlimitedAccess) {
      const baseMonths = baseDays != null ? baseDays / MONTH_DAYS : null;
      const visits = attendanceAssumption?.visitsPerMonth ?? null;
      if (visits != null && baseMonths != null && rates.single != null) {
        baseAccessValue = Math.round(visits * baseMonths * rates.single);
      }
    } else {
      const baseCredits = baseProduct.credits ?? 0;
      const basePrivates = baseProduct.privateSessionCount ?? 0;
      const parts: number[] = [];
      if (baseCredits > 0 && rates.single != null) parts.push(baseCredits * rates.single);
      if (basePrivates > 0 && rates.private != null) parts.push(basePrivates * rates.private);
      if (parts.length) baseAccessValue = Math.round(parts.reduce((sum, v) => sum + v, 0));
    }
  }
  const valueAddPct = baseAccessValue != null && baseAccessValue > 0 && customerValueReceived != null
    ? Math.round(((customerValueReceived - baseAccessValue) / baseAccessValue) * 1000) / 10
    : null;
  if (valueAddPct != null && valueAddPct !== 0) {
    notes.push(`Access value: ${formatINR(baseAccessValue)} in the base package against ${formatINR(customerValueReceived)} in this offer — ${valueAddPct > 0 ? '+' : ''}${valueAddPct}% at the studio's own rate card. Extra redeemable days are not priced here and are checked separately.`);
  }

  const customerSavings = customerValueReceived != null && sellingPrice != null ? customerValueReceived - sellingPrice : null;
  const customerSavingsPct = customerSavings != null && customerValueReceived && customerValueReceived > 0
    ? Math.round((customerSavings / customerValueReceived) * 1000) / 10
    : null;

  // ------------------------------------------------------------ revenue effect
  const revenueDeltaVsReference = sellingPrice != null && listPrice != null ? sellingPrice - listPrice : null;
  const revenueRetentionPct = sellingPrice != null && listPrice != null && listPrice > 0 ? Math.round((sellingPrice / listPrice) * 1000) / 10 : null;
  const breakEvenUnits = sellingPrice != null && sellingPrice > 0 && listPrice != null ? Math.ceil(listPrice / sellingPrice) : null;
  const valuePerRupee = customerValueReceived != null && sellingPrice ? Math.round((customerValueReceived / sellingPrice) * 100) / 100 : null;

  if (revenueDeltaVsReference != null) {
    notes.push(revenueDeltaVsReference < 0
      ? `Each sale brings in ${formatINR(Math.abs(revenueDeltaVsReference))} less than the reference product; break-even is ${breakEvenUnits} sales.`
      : 'Per-sale revenue is at or above the reference product.');
  }

  // ------------------------------------------------------------ cost basis
  let deliveryCostEstimate: number | null = null;
  let contributionMargin: number | null = null;
  let contributionMarginPct: number | null = null;
  let costBasis: string;
  if (costs.source === 'org_configured' && sellingPrice != null) {
    const units = unlimitedAccess ? impliedVisits : totalCredits;
    const classCost = costs.deliveryCostPerStudioClass;
    const privateCost = costs.deliveryCostPerPrivateSession;
    if ((classCost != null && units != null) || (privateCost != null && privateSessions > 0)) {
      deliveryCostEstimate = Math.round((units ?? 0) * (classCost ?? 0) + privateSessions * (privateCost ?? 0));
      const processing = costs.paymentProcessingFeePct != null ? sellingPrice * (costs.paymentProcessingFeePct / 100) : 0;
      contributionMargin = Math.round(sellingPrice - deliveryCostEstimate - processing);
      contributionMarginPct = Math.round((contributionMargin / sellingPrice) * 1000) / 10;
      costBasis = `Delivery ${classCost != null ? `${formatINR(classCost)} per class visit` : 'not set'}${privateCost != null ? `, ${formatINR(privateCost)} per private session` : ''}${costs.paymentProcessingFeePct != null ? `, ${costs.paymentProcessingFeePct}% payment processing` : ''} — configured by the business.`;
      notes.push(`Cost basis: ${costBasis} Contribution after delivery: ${formatINR(contributionMargin)}.`);
    } else {
      costBasis = 'Costs are configured but no delivery cost per class or session has been entered, so contribution stays blank.';
    }
  } else {
    costBasis = 'No cost data has been supplied. Margin is deliberately not stated: revenue in this workspace is not profit.';
  }

  notes.push(reference.basis);

  return {
    listPrice, sellingPrice, discountAmount, discountPct,
    includedCredits, bonusCredits, complimentaryClasses, privateSessions, guestPasses, unlimitedAccess,
    validityDays, validityDeltaDays: Math.max(0, validityDeltaDays),
    effectivePricePerClass, effectivePricePerVisit, attendance: attendanceAssumption, impliedVisits,
    customerValueReceived, baseAccessValue, valueAddPct, customerSavings, customerSavingsPct,
    revenueDeltaVsReference, revenueRetentionPct, breakEvenUnits, valuePerRupee,
    deliveryCostEstimate, contributionMargin, contributionMarginPct, costBasis,
    valueBuildUp, notes,
  };
}

// ---------------------------------------------------------------- defaults
// Every default below is a platform default, not company policy. `source` says so and the
// settings screen asks the business to confirm or replace each one.

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxDiscountPct: 20,
  maxDiscountPctByClass: { standard_retail: 20, promotional: 25, unlimited: 15, private: 15, introductory: 0 },
  minEffectivePricePerClass: 950,
  minEffectivePricePerClassBasis: 'Platform default pending confirmation — the business has not supplied a price floor.',
  maxBonusCreditsPct: 25,
  maxValidityExtensionDays: 30,
  maxPrivateSessionDiscountPct: 15,
  blockDiscountOnIntroProducts: true,
  blockStacking: true,
  maxGuestPasses: 2,
  maxCompClasses: 2,
  requireApprovalAboveDiscountPct: 15,
  requireApprovalAboveValueAddPct: 30,
  reapprovalOnCommercialChange: true,
  maxDiscountOnUnlimitedPct: 15,
  allowDiscountOnUnlimited: true,
  minValidityDays: 14,
  source: 'platform_defaults',
  updatedAt: AS_OF_ISO,
  updatedBy: 'usr_aarav',
};

export const DEFAULT_COSTS: CostAssumptions = {
  deliveryCostPerStudioClass: null,
  deliveryCostPerPrivateSession: null,
  paymentProcessingFeePct: null,
  gstRatePct: null,
  source: 'not_configured',
  notes: 'No cost data has been supplied. Until delivery costs are entered, the platform will not state a margin — it reports revenue and price effects only.',
  updatedAt: AS_OF_ISO,
  updatedBy: 'usr_aarav',
};

export const DEFAULT_ATTENDANCE: AttendanceAssumptions = {
  visitsPerMonthDefault: null,
  visitsPerMonthByLocation: {},
  bySegment: [],
  source: 'not_configured',
  sourceNote: 'No attendance assumption configured. Unlimited memberships cannot be valued per visit until one is set.',
  observedMedianVisitsPerMonth: null,
  updatedAt: AS_OF_ISO,
  updatedBy: 'usr_aarav',
};

export const DEFAULT_SIMULATION: SimulationAssumptions = {
  expectedBuyers: null,
  conversionRatePct: null,
  poolSize: null,
  utilisationPct: null,
  deliveryCostPerClass: null,
  attendancePerMonth: null,
  cannibalisationRatePct: null,
  scenarioMultipliers: { conservative: 0.7, expected: 1, optimistic: 1.4 },
  sourceNote: 'No defaults supplied by the business. Enter your own assumptions; the platform will not guess demand.',
};

/** The twelve collections the offer bank is organised around out of the box. */
export const COLLECTIONS = [
  { id: 'col_winback', name: 'Win-Back', slug: 'win-back', description: 'Reactivation concepts for members who have stopped attending.', accent: 'clay', kind: 'system' as const },
  { id: 'col_lapsed_long', name: 'Long-Lapsed', slug: 'long-lapsed', description: 'Re-introduction concepts for members away more than six months.', accent: 'clay', kind: 'system' as const },
  { id: 'col_renewal', name: 'Renewal & Retention', slug: 'renewal-retention', description: 'Concepts designed to land before a membership expires.', accent: 'teal', kind: 'system' as const },
  { id: 'col_acquisition', name: 'New Client Acquisition', slug: 'acquisition', description: 'First-step offers for people who have never trained at the studio.', accent: 'teal', kind: 'system' as const },
  { id: 'col_trial_conversion', name: 'Trial Conversion', slug: 'trial-conversion', description: 'Bridging offers for trialists and intro-pack graduates.', accent: 'teal', kind: 'system' as const },
  { id: 'col_frequency', name: 'Frequency & Commitment', slug: 'frequency-commitment', description: 'Structure-led concepts that raise visits per member.', accent: 'gold', kind: 'system' as const },
  { id: 'col_offpeak', name: 'Off-Peak Fill', slug: 'off-peak', description: 'Concepts aimed at genuinely under-filled windows.', accent: 'gold', kind: 'system' as const },
  { id: 'col_private', name: 'Private & Hybrid', slug: 'private-hybrid', description: 'Concepts that bundle personal attention with studio access.', accent: 'ink', kind: 'system' as const },
  { id: 'col_highvalue', name: 'High-Value Members', slug: 'high-value', description: 'Recognition concepts for the members who spend most.', accent: 'ink', kind: 'system' as const },
  { id: 'col_referral', name: 'Referral', slug: 'referral', description: 'Guest-pass and two-together concepts.', accent: 'teal', kind: 'system' as const },
  { id: 'col_campaigns', name: 'Calendar Campaigns', slug: 'calendar-campaigns', description: 'Diwali, New Year, anniversary and summer concepts.', accent: 'clay', kind: 'system' as const },
  { id: 'col_experiments', name: 'Ideas to Test', slug: 'ideas-to-test', description: 'Concepts worth arguing about before they are worth running.', accent: 'gold', kind: 'system' as const },
];
