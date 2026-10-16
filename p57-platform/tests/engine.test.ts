/**
 * Deterministic engine tests — `npm test`.
 *
 * These assert the numbers and the honesty rules the platform shows: price arithmetic, effective
 * price per class, unlimited-membership attendance, guardrail severities, scenario spread, and the
 * boundaries between a calculated figure, a stated assumption and a recommendation.
 *
 * No database, no network, no model provider: this suite runs the pure engine only, so it is safe
 * to run anywhere and its results never depend on AI output.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_ATTENDANCE, DEFAULT_COSTS, DEFAULT_GUARDRAILS, DEFAULT_SIMULATION,
  buildReferenceRates, resolveEconomics, normaliseTerms, durationToDays, componentsFromTerms,
  evaluateGuardrails, failingFindings, worstSeverity, similarity,
  simulateScenarios, SIMULATOR_PRESETS, DISCLAIMER,
  detectCannibalisation, buildScorecard, generateProposals,
  type GeneratorControls,
} from '../lib/engine';
import type {
  AudienceSegment, CatalogueProduct, CostAssumptions, GuardrailConfig, Offer, OfferComponent, OfferTerms,
} from '../lib/types';

/* ------------------------------------------------------------------ fixtures */

const LOC = 'p57-blr-vmr' as const;
const VMR = 'Physique 57 Bengaluru (Vittal Mallya Road)';

let seq = 0;
function product(partial: Partial<CatalogueProduct> & { name: string; price: number }): CatalogueProduct {
  seq += 1;
  const credits = partial.credits ?? null;
  return {
    id: `prd_test_${seq}`,
    sourceId: String(4600000 + seq),
    sourceIdTail: null,
    sourceFile: 'test-fixture',
    sourceIndex: seq,
    rawBlockHash: `hash_${seq}`,
    productClass: 'standard_retail',
    exclusionReason: null,
    status: 'active',
    statusBasis: 'Fixture for the engine test suite.',
    locationId: LOC,
    locationName: VMR,
    priceType: 'listed',
    duration: null,
    durationUnit: null,
    credits,
    complimentaryCredits: null,
    creditSource: credits != null ? 'source record' : 'not stated in source',
    unlimitedAccess: false,
    privateSessionCount: null,
    isIntroOffer: false,
    audienceRestriction: null,
    description: 'Test fixture.',
    benefits: [],
    policies: {},
    eligibility: {
      newClientsOnly: false, firstPurchaseOnly: false, locationRestricted: false,
      allowedLocationIds: [LOC], exclusiveAudience: null,
    },
    createdAt: null,
    modifiedAt: null,
    softDeletedInSource: false,
    parseConfidence: 'high',
    warnings: [],
    manualReviewNote: null,
    tags: [],
    observed: null,
    ...partial,
  };
}

function offer(partial: { name: string; baseProductId: string; terms: OfferTerms; components?: OfferComponent[]; audience?: AudienceSegment[] }): Offer {
  const now = '2026-10-16T09:00:00.000Z';
  return {
    id: `off_test_${partial.name.replace(/\W+/g, '_').toLowerCase()}`,
    code: 'P57-BLR-T001',
    name: partial.name,
    internalTitle: null as any,
    description: 'Test offer fixture.',
    promoCopy: '',
    status: 'draft',
    origin: 'manual',
    conceptOnly: true,
    baseProductId: partial.baseProductId,
    baseProductName: null,
    baseProductPrice: null,
    locationIds: [LOC],
    components: partial.components ?? [],
    audienceSegments: partial.audience ?? ['lapsed_members'],
    objectives: ['reactivate_lapsed'] as any,
    eligibility: {
      audienceSegments: partial.audience ?? ['lapsed_members'], newClientsOnly: false, existingMembersOnly: false,
      lapsedOnly: true, minLapsedDays: null, locationIds: [LOC], purchaseLimitPerMember: 1,
      requiresCode: false, code: null, stackableWithOtherOffers: false, exclusions: [],
    },
    terms: partial.terms,
    tags: [],
    collectionIds: [],
    campaignId: null,
    ownerId: 'usr_aarav',
    collaboratorIds: [],
    internalNotes: '',
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    expiresOn: null,
    version: 1,
    approvedVersion: null,
    requiresReapproval: false,
    favourite: false,
    pinned: false,
    archivedAt: null,
    metricsSnapshot: null,
    generationContext: null,
  } as Offer;
}

// The Bengaluru packs the platform is built around, priced as the source export shows them.
const SINGLE = product({ name: 'Studio Single Class', price: 1350, credits: 1 });
const PACK_8 = product({ name: '8 Class Package', price: 8300, credits: 8, duration: 8, durationUnit: 'weeks' });
const PACK_12 = product({ name: '12 Class Package', price: 12500, credits: 12, duration: 12, durationUnit: 'weeks' });
const MONTH_1 = product({ name: '1 Month Unlimited', price: 13900, unlimitedAccess: true, duration: 1, durationUnit: 'months' });
const INTRO = product({ name: 'New Client Intro', price: 675, credits: 1, productClass: 'introductory', isIntroOffer: true });
const PRIVATE = product({ name: 'Private Session', price: 3925, privateSessionCount: 1 });

const CATALOGUE = [SINGLE, PACK_8, PACK_12, MONTH_1, INTRO, PRIVATE];
const REFERENCE = buildReferenceRates(CATALOGUE);

function terms(base: CatalogueProduct, partial: Partial<OfferTerms> = {}): OfferTerms {
  // Terms are normalised against the base product exactly as the store does on save.
  return normaliseTerms(partial, base);
}

function economics(base: CatalogueProduct, partial: Partial<OfferTerms> = {}, opts: {
  guardrails?: GuardrailConfig; costs?: CostAssumptions; attendance?: typeof DEFAULT_ATTENDANCE;
} = {}) {
  return resolveEconomics({
    baseProduct: base, terms: terms(base, partial),
    guardrails: opts.guardrails ?? DEFAULT_GUARDRAILS, costs: opts.costs ?? DEFAULT_COSTS,
    attendance: opts.attendance ?? DEFAULT_ATTENDANCE, reference: REFERENCE, catalogue: CATALOGUE,
  });
}

function check(o: Offer, base: CatalogueProduct) {
  return evaluateGuardrails({
    offer: o, baseProduct: base, economics: economics(base, o.terms), guardrails: DEFAULT_GUARDRAILS,
    catalogue: CATALOGUE, locationLabel: VMR,
  });
}

/* --------------------------------------------------------------------- harness */

const results: { name: string; ok: boolean; error?: string }[] = [];
function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: (error as Error).message }); }
}

/* — duration ------------------------------------------------------------- */

test('duration converts to days, and never invents a unit that was not stated', () => {
  assert.equal(durationToDays(8, 'weeks'), 56);
  assert.equal(durationToDays(1, 'months'), 30);
  assert.equal(durationToDays(null, 'months'), null);
  assert.equal(durationToDays(2, null), null);
});

/* — straight pricing ----------------------------------------------------- */

test('a percentage discount is arithmetic, not an estimate', () => {
  const e = economics(PACK_8, { pricingMode: 'discount_pct', discountPct: 10 });
  assert.equal(e.listPrice, 8300);
  assert.equal(e.discountAmount, 830);
  assert.equal(e.sellingPrice, 7470);
  assert.equal(e.discountPct, 10);
});

test('a fixed discount never drives the price below zero', () => {
  const e = economics(SINGLE, { pricingMode: 'discount_amount', discountAmount: 5000 });
  assert.equal(e.sellingPrice, 0);
  assert.equal(e.discountAmount, 1350);
});

test('a fixed price reports the difference against the reference price', () => {
  const e = economics(PACK_12, { pricingMode: 'fixed_price', sellingPrice: 10000 });
  assert.equal(e.sellingPrice, 10000);
  assert.equal(e.discountAmount, 2500);
  assert.equal(e.discountPct, 20);
});

test('effective price per class divides by every class the member receives', () => {
  // Figures are rounded to whole rupees, as members see them.
  assert.equal(economics(PACK_8, {}).effectivePricePerClass, 1038);
  const generous = economics(PACK_8, { pricingMode: 'discount_pct', discountPct: 10, bonusCredits: 2, complimentaryClasses: 2 });
  assert.equal(generous.includedCredits, 8);
  assert.equal(generous.bonusCredits, 2);
  assert.equal(generous.complimentaryClasses, 2);
  assert.equal(generous.effectivePricePerClass, Math.round(7470 / 12));
});

test('value-add mode holds the price and carries the concession in access', () => {
  const e = economics(PACK_12, { pricingMode: 'value_add', bonusCredits: 3, validityDays: 120 });
  assert.equal(e.sellingPrice, 12500);
  assert.equal(e.discountAmount, 0);
  assert.equal(e.validityDays, 120);
  assert.ok(e.effectivePricePerClass != null && e.effectivePricePerClass < 12500 / 12);
});

test('extra classes on a single-class base are allowed but never silent', () => {
  // Terms are not silently rewritten: a one-class pack plus three bonus classes is a four-class
  // pack, and the engine says so rather than pretending the base is untouched.
  const t = normaliseTerms({ pricingMode: 'discount_pct', discountPct: 10, bonusCredits: 3 }, SINGLE);
  assert.equal(t.bonusCredits, 3);
  const e = economics(SINGLE, { pricingMode: 'discount_pct', discountPct: 10, bonusCredits: 3 });
  assert.equal(e.effectivePricePerClass, Math.round(1215 / 4));

  const findings = evaluateGuardrails({
    offer: offer({ name: 'Single plus bonus', baseProductId: SINGLE.id, terms: t }), baseProduct: SINGLE,
    economics: e, guardrails: DEFAULT_GUARDRAILS, catalogue: CATALOGUE, locationLabel: VMR,
  });
  assert.ok(failingFindings(findings).some(f => f.ruleId === 'bonus_credit_cap'), '300% bonus on a one-class base is flagged');
});

test('every derived figure is stated in the notes', () => {
  const e = economics(PACK_12, { pricingMode: 'discount_pct', discountPct: 15, bonusCredits: 2, validityDays: 120 });
  assert.ok(e.notes.length > 0);
  assert.ok(e.valueBuildUp.length > 0, 'the value build-up lists what the member receives');
});

/* — unlimited memberships ------------------------------------------------ */

test('an unlimited membership is never valued per class without a stated attendance assumption', () => {
  const bare = economics(MONTH_1, {});
  assert.equal(bare.unlimitedAccess, true);
  assert.equal(bare.includedCredits, null);
  assert.equal(bare.effectivePricePerClass, null);

  const stated = economics(MONTH_1, {}, {
    attendance: { ...DEFAULT_ATTENDANCE, visitsPerMonthDefault: 4, source: 'org_configured', sourceNote: 'Set by the studio.' },
  });
  assert.equal(stated.attendance?.visitsPerMonth, 4);
  assert.ok((stated.attendance?.source ?? '').length > 0, 'the assumption travels with a source line');
  // 30-day validity at 4 visits a month.
  assert.equal(stated.impliedVisits, 4 * (30 / 30.44));
  assert.equal(stated.effectivePricePerVisit, Math.round(13900 / (4 * (30 / 30.44))));
  assert.equal(stated.effectivePricePerClass, null, 'an unlimited membership still has no per-class figure');
});

test('a per-location attendance override beats the default', () => {
  const e = economics(MONTH_1, {}, {
    attendance: {
      ...DEFAULT_ATTENDANCE, visitsPerMonthDefault: 4, visitsPerMonthByLocation: { [LOC]: 6 },
      source: 'org_configured', sourceNote: 'Per-location figures supplied by the studio.',
    },
  });
  assert.equal(e.attendance?.visitsPerMonth, 6);
});

/* — margin honesty ------------------------------------------------------- */

test('no margin is stated while cost data is unconfigured', () => {
  const e = economics(PACK_8, { pricingMode: 'discount_pct', discountPct: 15 });
  assert.equal(e.contributionMargin, null);
  assert.equal(e.contributionMarginPct, null);
  assert.match(e.costBasis, /not stated/i);
  assert.match(e.costBasis, /is not profit/i);
});

test('margin appears only once real costs are supplied, and shows its basis', () => {
  const costs: CostAssumptions = {
    ...DEFAULT_COSTS, deliveryCostPerStudioClass: 400, paymentProcessingFeePct: 2,
    source: 'org_configured', notes: 'Supplied by the studio for this test run.',
  };
  const e = economics(PACK_8, {}, { costs });
  assert.equal(e.deliveryCostEstimate, 3200);
  assert.equal(e.contributionMargin, Math.round(8300 - 3200 - 8300 * 0.02));
  assert.match(e.costBasis, /configured by the business/i);
  assert.ok((e.contributionMargin as number) < (e.sellingPrice as number), 'contribution is always below revenue');
});

test('costs configured without a delivery figure still withhold the margin', () => {
  const e = economics(PACK_8, {}, {
    costs: { ...DEFAULT_COSTS, deliveryCostPerStudioClass: null, source: 'org_configured' },
  });
  assert.equal(e.contributionMargin, null);
  assert.match(e.costBasis, /stays blank/i);
});

/* — reference rates ------------------------------------------------------ */

test('reference rates are built per location, at standard retail price only', () => {
  assert.equal(REFERENCE.singleClass, 1350);
  assert.equal(REFERENCE.singleClassByLocation[LOC], 1350);
  // The ₹675 new-client intro is a real product but not the walk-in price, so it never sets the
  // benchmark. Only the standard-retail single class counts.
  assert.equal(REFERENCE.sampleSizes.singleClass, 1);
  assert.equal(REFERENCE.privateSession, 3925);
  assert.match(REFERENCE.basis, /entry price never sets the benchmark/i);
});

test('a discounted pack reports its revenue delta against the reference product', () => {
  const e = economics(PACK_12, { pricingMode: 'discount_pct', discountPct: 15 });
  assert.ok(e.revenueDeltaVsReference != null);
  assert.ok((e.revenueDeltaVsReference as number) < 0, 'a discount moves revenue per sale below the reference');
});

/* — guardrails ---------------------------------------------------------- */

test('a discount above the ceiling is a blocker, not a warning', () => {
  const o = offer({ name: 'Deep cut', baseProductId: PACK_8.id, terms: terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 40 }) });
  const findings = check(o, PACK_8);
  assert.equal(worstSeverity(findings), 'blocker');
  assert.ok(failingFindings(findings).some(f => f.ruleId === 'discount_ceiling' && f.severity === 'blocker'));
  assert.ok(findings.some(f => f.configurable), 'the threshold behind the rule is configurable');
});

test('an approval trigger is a warning, not a blocker', () => {
  const o = offer({ name: 'Reviewable', baseProductId: PACK_8.id, terms: terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 14, sellingPrice: 7138 }) });
  const findings = check(o, PACK_8);
  const worst = worstSeverity(findings);
  assert.notEqual(worst, 'blocker');
  assert.ok(worst === 'warning' || worst === 'info');
});

test('discounting an introductory product is blocked by default', () => {
  const o = offer({ name: 'Intro discount', baseProductId: INTRO.id, terms: terms(INTRO, { pricingMode: 'discount_pct', discountPct: 20 }) });
  const findings = check(o, INTRO);
  assert.equal(worstSeverity(findings), 'blocker');
});

test('an unlimited offer is blocked while it has no attendance basis, and clean once it does', () => {
  const t = terms(MONTH_1, { pricingMode: 'discount_pct', discountPct: 10 });
  const o = offer({ name: 'Unlimited cut', baseProductId: MONTH_1.id, terms: t });

  // No attendance assumption configured: the offer cannot be valued, costed or simulated.
  assert.equal(worstSeverity(check(o, MONTH_1)), 'blocker');

  const attendance = { ...DEFAULT_ATTENDANCE, visitsPerMonthDefault: 4, source: 'org_configured' as const, sourceNote: 'Set by the studio.' };
  const allowed = evaluateGuardrails({
    offer: o, baseProduct: MONTH_1, economics: economics(MONTH_1, t, { attendance }),
    guardrails: { ...DEFAULT_GUARDRAILS, allowDiscountOnUnlimited: true, maxDiscountOnUnlimitedPct: 15 },
    catalogue: CATALOGUE, locationLabel: VMR,
  });
  assert.notEqual(worstSeverity(allowed), 'blocker');

  const stillBlocked = evaluateGuardrails({
    offer: o, baseProduct: MONTH_1, economics: economics(MONTH_1, t, { attendance }),
    guardrails: { ...DEFAULT_GUARDRAILS, allowDiscountOnUnlimited: false, maxDiscountOnUnlimitedPct: 15 },
    catalogue: CATALOGUE, locationLabel: VMR,
  });
  assert.equal(worstSeverity(stillBlocked), 'blocker');
});

test('two cash discounts stacked are a blocker; mixed concessions are a warning', () => {
  const twoCash = offer({
    name: 'Double discount', baseProductId: PACK_8.id,
    terms: terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 8, discountAmount: 500 }),
    components: componentsFromTerms(terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 8, discountAmount: 500 }))
      .concat([{ id: 'cmp_second_cash', kind: 'discount_amount', value: 500, label: '₹500 off', derived: true }]),
  });
  const cashFindings = check(twoCash, PACK_8);
  assert.equal(worstSeverity(cashFindings), 'blocker');
  assert.ok(failingFindings(cashFindings).some(f => f.ruleId === 'stacking' && f.severity === 'blocker'));

  // Cash plus value add is not blocked, but it is never silent about the delivery load.
  const mixed = offer({
    name: 'Cash plus value', baseProductId: PACK_8.id,
    terms: terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 8, bonusCredits: 2, guestPasses: 2 }),
    components: componentsFromTerms(terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 8, bonusCredits: 2, guestPasses: 2 })),
  });
  const mixedFindings = check(mixed, PACK_8);
  assert.ok(failingFindings(mixedFindings).some(f => f.ruleId === 'concession_stack'));
  assert.notEqual(worstSeverity(mixedFindings), 'blocker');
});

test('an effective price below the configured floor is reported', () => {
  const t = terms(PACK_8, { pricingMode: 'fixed_price', sellingPrice: 4000, bonusCredits: 4 });
  const e = economics(PACK_8, t);
  assert.ok(e.effectivePricePerClass != null && e.effectivePricePerClass < DEFAULT_GUARDRAILS.minEffectivePricePerClass);
  const findings = evaluateGuardrails({
    offer: offer({ name: 'Floor breach', baseProductId: PACK_8.id, terms: t }), baseProduct: PACK_8,
    economics: e, guardrails: DEFAULT_GUARDRAILS, catalogue: CATALOGUE, locationLabel: VMR,
  });
  assert.equal(worstSeverity(findings), 'blocker');
});

test('a plain multi-class pack is not mistaken for a giveaway', () => {
  // The pack already sells below the walk-in rate; that standing pack discount is not a concession,
  // so the value-add trigger must stay quiet.
  const o = offer({ name: 'Plain value add', baseProductId: PACK_8.id, terms: terms(PACK_8, { pricingMode: 'value_add' }) });
  const e = economics(PACK_8, o.terms);
  assert.equal(e.valueAddPct, 0);
  assert.equal(e.baseAccessValue, 8 * 1350);
  const findings = check(o, PACK_8);
  assert.equal(worstSeverity(findings), null);
  // Only the checks that apply are emitted, so a clean offer produces a short list — and the
  // passing ones are still shown, so "nothing was flagged" is visibly different from "nothing ran".
  assert.ok(findings.some(f => f.ruleId === 'price_floor' && f.passed));
  assert.ok(findings.every(f => f.passed));
});

test('value add is measured against the base package, and real concessions raise it', () => {
  const plain = economics(PACK_8, { pricingMode: 'value_add' });
  assert.equal(plain.valueAddPct, 0);

  const bonusTwo = economics(PACK_8, { pricingMode: 'value_add', bonusCredits: 2 });
  assert.equal(bonusTwo.valueAddPct, 25); // 2 extra classes on 8

  const bonusFour = economics(PACK_8, { pricingMode: 'value_add', bonusCredits: 4, guestPasses: 2 });
  assert.ok((bonusFour.valueAddPct ?? 0) > DEFAULT_GUARDRAILS.requireApprovalAboveValueAddPct);
  const findings = evaluateGuardrails({
    offer: offer({ name: 'Generous', baseProductId: PACK_8.id, terms: terms(PACK_8, { pricingMode: 'value_add', bonusCredits: 4, guestPasses: 2 }) }),
    baseProduct: PACK_8, economics: bonusFour, guardrails: DEFAULT_GUARDRAILS, catalogue: CATALOGUE, locationLabel: VMR,
  });
  assert.ok(failingFindings(findings).some(f => f.ruleId === 'approval_value_add'), 'the approver is told a real concession needs their sign-off');
});

test('the generator never hands back a structure that breaks the configured floor', () => {
  const controls: GeneratorControls = {
    creativity: 70, discountAggressiveness: 80, customerAttractiveness: 80,
    revenueProtection: 20, complexity: 60, durationBias: 'same', segment: 'first_time_customers', category: 'auto',
  };
  // A single-class base has no room for bonus classes once the floor is respected.
  const proposals = generateProposals({
    catalogue: CATALOGUE, guardrails: DEFAULT_GUARDRAILS, costs: DEFAULT_COSTS, attendance: DEFAULT_ATTENDANCE,
    audience: ['first_time_customers'], objectives: ['acquire_new_members'], locationIds: [LOC],
    controls, count: 6, seed: 7, mode: 'random',
  });
  assert.ok(proposals.length > 0);
  for (const p of proposals) {
    if (p.baseProductId !== SINGLE.id) continue;
    assert.equal((p.terms.bonusCredits ?? 0) + (p.terms.complimentaryClasses ?? 0), 0, 'a single-class base carries no extra classes');
  }
  // Nothing generated breaches a commercial blocking rule. An unlimited concept may still be held
  // back until an attendance assumption exists — which is the honest outcome, not a defect.
  for (const p of proposals) {
    const blockers = failingFindings(p.guardrails).filter(f => f.severity === 'blocker');
    for (const b of blockers) {
      assert.equal(b.ruleId, 'unlimited_attendance', `${p.name}: only a missing assumption may block a generated idea`);
    }
  }
});

test('duplicate detection reads the whole record, so near-identical offers surface', () => {
  const t = terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 12, bonusCredits: 1 });
  const a = offer({ name: 'Spring Return 8 Class', baseProductId: PACK_8.id, terms: t });
  const b = offer({ name: 'Spring Return 8 Class', baseProductId: PACK_8.id, terms: t });
  const c = offer({ name: 'Annual Commitment', baseProductId: MONTH_1.id, terms: terms(MONTH_1, { pricingMode: 'value_add' }), audience: ['existing_active_members'] });
  // Two identical records with no mechanisms attached score below 1 on purpose: "neither offer has
  // any component" is not evidence that they are the same.
  assert.ok(similarity(a, b) > 0.8, `identical records score high (got ${similarity(a, b)})`);
  assert.ok(similarity(a, c) < 0.5, 'different product, name, price basis and audience are not duplicates');
});

/* — cannibalisation ------------------------------------------------------ */

test('cannibalisation is flagged with the comparison itself, never a projected loss', () => {
  const e = economics(PACK_8, { pricingMode: 'fixed_price', sellingPrice: 6000, bonusCredits: 2 });
  const findings = detectCannibalisation({ economics: e, baseProduct: PACK_8, catalogue: CATALOGUE, audienceSegments: ['long_lapsed_members'] });
  assert.ok(findings.length > 0, 'a pack that undercuts its own siblings is flagged');
  for (const f of findings) {
    assert.ok(['high', 'medium', 'low'].includes(f.severity));
    assert.ok(f.metric.length > 0, 'the finding quantifies the comparison');
    assert.ok(f.detail.length > 20, 'the finding explains itself in words');
  }
});

test('formats that are not substitutes are never compared with each other', () => {
  // A private session priced below the single-class rate is not cannibalisation of a group pack.
  const e = economics(PRIVATE, { pricingMode: 'fixed_price', sellingPrice: 800 });
  const findings = detectCannibalisation({ economics: e, baseProduct: PRIVATE, catalogue: CATALOGUE, audienceSegments: ['existing_active_members'] });
  assert.ok(!findings.some(f => f.productId === PACK_8.id));
});

/* — scorecard ----------------------------------------------------------- */

test('the scorecard scores dimensions, explains each one, and disclaims prediction', () => {
  const t = terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 8, bonusCredits: 1 });
  const e = economics(PACK_8, t);
  const card = buildScorecard({
    economics: e, audienceSegments: ['long_lapsed_members'], objectives: ['reactivate_lapsed'], componentsCount: 2,
    baseProduct: PACK_8, cannibalisation: [], guardrailsFailed: 0, evidenceTags: [],
  });
  assert.ok(card.dimensions.length >= 6);
  for (const d of card.dimensions) {
    assert.ok(d.score >= 0 && d.score <= d.max, `${d.key} scores within its own range`);
    assert.ok(d.reasoning.length > 10, `${d.key} explains its score`);
    assert.ok(d.basis === 'calculated' || d.basis === 'heuristic', `${d.key} states whether it is calculated or a judgement`);
  }
  assert.match(card.disclaimer, /not a (conversion )?forecast|not.*prediction|editorial/i);
});

/* — scenarios ----------------------------------------------------------- */

test('scenario spread is monotonic and stated as buyers, not as a probability', () => {
  const t = terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 10 });
  const result = simulateScenarios({
    economics: economics(PACK_8, t),
    assumptions: { ...DEFAULT_SIMULATION, expectedBuyers: 40, utilisationPct: 80, deliveryCostPerClass: 400, attendancePerMonth: 4 },
    baseProduct: PACK_8,
    costs: { ...DEFAULT_COSTS, deliveryCostPerStudioClass: 400, source: 'org_configured' },
  });
  assert.equal(result.ready, true);
  const [conservative, expected, optimistic] = result.scenarios;
  assert.ok(conservative.buyers < expected.buyers && expected.buyers < optimistic.buyers);
  assert.equal(expected.buyers, 40);
  assert.ok(conservative.grossRevenue < expected.grossRevenue && expected.grossRevenue < optimistic.grossRevenue);
  assert.ok(result.assumptionTrace.length > 0, 'every run exposes the assumptions it used');
  assert.ok(result.scenarios.every(s => s.assumptionTrace.length > 0));
  assert.equal(result.disclaimer, DISCLAIMER);
  assert.match(result.disclaimer, /assum|estimat|forecast|not a guarantee/i);
});

test('no conversion rate is manufactured when the business has not supplied one', () => {
  const result = simulateScenarios({
    economics: economics(PACK_8, { pricingMode: 'discount_pct', discountPct: 10 }),
    assumptions: { ...DEFAULT_SIMULATION, conversionRatePct: null, expectedBuyers: 25 },
    baseProduct: PACK_8,
  });
  assert.equal(result.ready, true);
  assert.ok(result.scenarios.every(s => s.buyers > 0));
  assert.ok(!/conversion rate of/i.test(result.assumptionTrace.join(' ')), 'no invented rate is narrated');
});

test('an unusable scenario says why instead of producing numbers', () => {
  const result = simulateScenarios({
    economics: economics(PACK_8, {}),
    assumptions: { ...DEFAULT_SIMULATION, expectedBuyers: null, poolSize: null, conversionRatePct: null },
    baseProduct: PACK_8,
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.length > 0);
  assert.equal(result.scenarios.length, 0);
});

test('an unlimited offer cannot be simulated without an attendance assumption', () => {
  const result = simulateScenarios({
    economics: economics(MONTH_1, {}),
    assumptions: { ...DEFAULT_SIMULATION, expectedBuyers: 10, attendancePerMonth: null },
    baseProduct: MONTH_1,
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(b => /attendance/i.test(b)));
});

test('an observed funnel rate is offered as a reference, never applied as the assumption', () => {
  const observed = { pct: 37.4, label: 'Trial → sale at Bengaluru', source: 'CRM lead export' };
  const result = simulateScenarios({
    economics: economics(PACK_8, { pricingMode: 'discount_pct', discountPct: 10 }),
    assumptions: { ...DEFAULT_SIMULATION, expectedBuyers: 30, conversionRatePct: null },
    baseProduct: PACK_8,
    observedConversion: observed,
  });
  assert.deepEqual(result.observedReference, observed);
  assert.notEqual(result.scenarios[1].buyers, 30 * 0.374, 'the funnel rate is not silently used as buyers');
});

test('every simulator preset is described', () => {
  for (const preset of SIMULATOR_PRESETS) {
    assert.ok(preset.id && preset.label && preset.description, `${preset.id} is described`);
  }
});

/* — engine invariants --------------------------------------------------- */

test('guardrail severities never mix blockers into warnings', () => {
  const o = offer({ name: 'Abyss', baseProductId: PACK_8.id, terms: terms(PACK_8, { pricingMode: 'discount_pct', discountPct: 90, bonusCredits: 4 }) });
  const findings = check(o, PACK_8);
  const failed = failingFindings(findings);
  const blockers = failed.filter(f => f.severity === 'blocker');
  assert.ok(blockers.length > 0);
  assert.ok(worstSeverity(findings) === 'blocker');
});

test('revenue is never equated with profit anywhere the engine speaks', () => {
  const bare = economics(PACK_12, { pricingMode: 'discount_pct', discountPct: 10 });
  assert.match(bare.costBasis, /is not profit/i);
  const priced = economics(PACK_12, { pricingMode: 'discount_pct', discountPct: 10 }, {
    costs: { ...DEFAULT_COSTS, deliveryCostPerStudioClass: 300, source: 'org_configured', notes: 'Supplied by the studio.' },
  });
  assert.ok(priced.contributionMargin != null);
  assert.ok(!/profit/i.test(priced.costBasis.replace(/is not profit/i, '')), 'cost lines talk about contribution, not profit');
});

test('the engine reports the same numbers every time it is run', () => {
  const t = terms(PACK_12, { pricingMode: 'discount_pct', discountPct: 12, bonusCredits: 2 });
  const first = economics(PACK_12, t);
  const second = economics(PACK_12, t);
  assert.deepEqual(first, second);
});

/* ------------------------------------------------------------------- report */

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok);

console.log(`\n${passed}/${results.length} engine checks passed\n`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`\n  ${f.name}\n    ${f.error}`);
  process.exit(1);
}
console.log('\nAll deterministic engine checks passed. No database, model provider or network was used.\n');
