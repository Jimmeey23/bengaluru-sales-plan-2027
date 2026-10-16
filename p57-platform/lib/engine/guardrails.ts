/**
 * Guardrail evaluation.
 *
 * Every threshold lives in settings, and each finding carries `configurable: true` so the UI can
 * say "this limit is yours to change". Nothing here is a platform-wide policy on pricing.
 *
 * Format-awareness is structural: a private session is never compared with a group class, and a
 * per-class floor is never applied to an unlimited membership that has no class count.
 */

import type { CatalogueProduct, GuardrailConfig, GuardrailFinding, Offer, OfferComponent } from '@/lib/types';
import { formatINR, type ResolvedEconomics } from './pricing';

export type FormatFamily = 'group_credits' | 'unlimited' | 'private' | 'intro' | 'other';

export function formatFamily(product: CatalogueProduct | null | undefined): FormatFamily {
  if (!product) return 'other';
  if (product.isIntroOffer) return 'intro';
  if (product.unlimitedAccess) return 'unlimited';
  if (product.privateSessionCount != null && product.privateSessionCount > 0) return 'private';
  if (product.credits != null && product.credits > 0) return 'group_credits';
  return 'other';
}

export interface DuplicateHint { id: string; name: string; similarity: number }

/** Only the parts of an offer the rules actually read — so partially-built drafts can be checked. */
export type GuardrailOffer = Pick<Offer, 'components' | 'eligibility' | 'terms' | 'locationIds'> & Partial<Offer>;

export interface GuardrailInput {
  offer: GuardrailOffer;
  baseProduct: CatalogueProduct | null;
  economics: ResolvedEconomics;
  guardrails: GuardrailConfig;
  duplicates?: DuplicateHint[];
  catalogue: CatalogueProduct[];
  locationLabel?: string;
}

function finding(
  ruleId: string, label: string, severity: GuardrailFinding['severity'], passed: boolean,
  detail: string, configurable = true,
): GuardrailFinding {
  return { ruleId, label, severity, passed, detail, configurable };
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailFinding[] {
  const { offer, baseProduct, economics, guardrails: g, duplicates = [], catalogue } = input;
  const findings: GuardrailFinding[] = [];
  const family = formatFamily(baseProduct);
  // A ceiling set for a product class replaces the general one for that class; the general ceiling
  // governs everything that has not been given its own. Nothing is capped by a hidden universal
  // limit — the generator reads the same rule, so a proposal can never be born in breach of it.
  const classCeiling = g.maxDiscountPctByClass?.[baseProduct?.productClass ?? ''];
  const formatCeiling = classCeiling ?? (family === 'unlimited' ? g.maxDiscountOnUnlimitedPct : g.maxDiscountPct);

  // ---------------------------------------------------------------- cash discount
  if ((economics.discountPct ?? 0) > 0) {
    const pct = economics.discountPct ?? 0;
    const ceiling = family === 'intro' && g.blockDiscountOnIntroProducts ? 0 : formatCeiling;
    findings.push(finding(
      'discount_ceiling', 'Discount ceiling', pct > ceiling ? 'blocker' : 'info', pct <= ceiling,
      pct > ceiling
        ? `This offer discounts ${pct}% — ${(pct - ceiling).toFixed(1)} points past the configured ceiling of ${ceiling}%${family === 'intro' ? ' for an introductory product' : ` for ${family.replace(/_/g, ' ')} products`}. Introductory prices are the acquisition hook; discounting them again undercuts the funnel that feeds everything else.`
        : `Discount of ${pct}% sits inside the configured ceiling of ${ceiling}%${family !== 'other' ? ` for ${family.replace(/_/g, ' ')} products` : ''}.`,
    ));
  }

  // ---------------------------------------------------------------- price floor (never applied to unlimited)
  if (!economics.unlimitedAccess && economics.effectivePricePerClass != null && g.minEffectivePricePerClass > 0) {
    const perClass = economics.effectivePricePerClass;
    findings.push(finding(
      'price_floor', 'Minimum effective price per class', perClass < g.minEffectivePricePerClass ? 'warning' : 'info',
      perClass >= g.minEffectivePricePerClass,
      perClass >= g.minEffectivePricePerClass
        ? `Effective price per class is ${formatINR(perClass)}, at or above the configured floor of ${formatINR(g.minEffectivePricePerClass)}. ${g.minEffectivePricePerClassBasis}`
        : `Effective price per class is ${formatINR(perClass)}, below the configured floor of ${formatINR(g.minEffectivePricePerClass)}. ${g.minEffectivePricePerClassBasis}`,
    ));
  } else if (economics.unlimitedAccess) {
    findings.push(finding(
      'price_floor_unlimited', 'Minimum effective price per class', 'info', true,
      economics.attendance
        ? `Unlimited membership — not measured against a per-class floor. At the ${economics.attendance.visitsPerMonth} visits/month assumption it is ${formatINR(economics.effectivePricePerVisit)} per visit.`
        : 'Unlimited membership — not measured against a per-class floor, and no attendance assumption is configured, so a per-visit figure cannot be stated either.',
      false,
    ));
  }

  // ---------------------------------------------------------------- value-add volume
  if (baseProduct?.credits && economics.bonusCredits > 0) {
    const bonusPct = (economics.bonusCredits / baseProduct.credits) * 100;
    findings.push(finding(
      'bonus_credit_cap', 'Bonus classes as a share of the base package', bonusPct > g.maxBonusCreditsPct ? 'warning' : 'info',
      bonusPct <= g.maxBonusCreditsPct,
      `${economics.bonusCredits} bonus classes on a ${baseProduct.credits}-class package is ${bonusPct.toFixed(1)}% of the package (ceiling ${g.maxBonusCreditsPct}%).`,
    ));
  }
  if (economics.complimentaryClasses > g.maxCompClasses) {
    findings.push(finding(
      'comp_cap', 'Complimentary classes', 'warning', false,
      `${economics.complimentaryClasses} complimentary classes exceeds the configured maximum of ${g.maxCompClasses}. Each one is a delivered class with no revenue attached.`,
    ));
  }
  if (economics.guestPasses > g.maxGuestPasses) {
    findings.push(finding(
      'guest_pass_cap', 'Guest passes', 'warning', false,
      `${economics.guestPasses} guest passes exceeds the configured maximum of ${g.maxGuestPasses}. Passes are a referral engine, but they are also free capacity.`,
    ));
  }
  if (economics.validityDeltaDays > g.maxValidityExtensionDays) {
    findings.push(finding(
      'validity_cap', 'Validity extension', 'blocker', false,
      `Adds ${economics.validityDeltaDays} days beyond the reference product, past the configured maximum of ${g.maxValidityExtensionDays} days. Extra time defers revenue and extends the window in which classes must still be delivered.`,
    ));
  }

  // ---------------------------------------------------------------- private formats
  if (family === 'private' && (economics.discountPct ?? 0) > g.maxPrivateSessionDiscountPct) {
    findings.push(finding(
      'private_discount_cap', 'Private session discount ceiling', 'blocker', false,
      `Private sessions discounted ${economics.discountPct}%, beyond the configured ${g.maxPrivateSessionDiscountPct}% ceiling for private formats. Private capacity is the scarcest resource in the studio.`,
    ));
  }

  // ---------------------------------------------------------------- unlimited specifics
  if (economics.unlimitedAccess) {
    if (!g.allowDiscountOnUnlimited && (economics.discountPct ?? 0) > 0) {
      findings.push(finding(
        'unlimited_discount', 'Discounting unlimited memberships', 'blocker', false,
        'Configuration blocks discounting unlimited memberships. Unlimited access is already the strongest value proposition in the catalogue, and the annual and six-month lines are among the highest-volume products in the observed sales export — a discount here removes revenue from the line the studio depends on most.',
      ));
    }
    const assumption = economics.attendance;
    findings.push(finding(
      'unlimited_attendance', 'Attendance assumption', assumption ? 'info' : 'blocker', Boolean(assumption),
      assumption
        ? `Unlimited value is calculated on ${assumption.visitsPerMonth} visits per month — ${assumption.source.toLowerCase()}. Change the assumption in Settings and every figure here moves with it.`
        : 'No attendance assumption is configured, so this unlimited offer cannot be valued per visit, costed or simulated. Unlimited memberships are never treated as a fixed credit count.',
    ));
  }

  // ---------------------------------------------------------------- stacking
  const components: OfferComponent[] = offer.components ?? [];
  const discountComponents = components.filter(c => c.kind === 'discount_pct' || c.kind === 'discount_amount');
  if (discountComponents.length > 1) {
    findings.push(finding(
      'stacking', 'Stacked discounts', g.blockStacking ? 'blocker' : 'warning', false,
      `${discountComponents.length} discount mechanics are stacked. Combined effect is ${(economics.discountPct ?? 0).toFixed(1)}%${g.blockStacking ? ', and configuration blocks stacking because multiplied discounts are hard to explain at the desk and almost impossible to unwind once members have seen them.' : '.'}`,
    ));
  }

  // Distinct kinds of concession given away at once. Not a cash discount rule: every one of these
  // costs delivery capacity even when the price never moves, so it is surfaced as a warning the
  // approver has to read rather than as a hard block.
  const CONCESSION_KINDS: OfferComponent['kind'][] = [
    'discount_pct', 'discount_amount', 'bonus_credits', 'complimentary_classes',
    'validity_extension', 'private_sessions', 'guest_passes', 'referral_credit', 'tier_benefit',
  ];
  const concessionKinds = CONCESSION_KINDS.filter(k => components.some(c => c.kind === k));
  if (concessionKinds.length >= 3) {
    findings.push(finding(
      'concession_stack', 'Multiple concessions at once', 'warning', false,
      `${concessionKinds.length} different kinds of concession are stacked on one offer (${concessionKinds.map(k => k.replace(/_/g, ' ')).join(', ')}). Nothing here is blocked, but each extra mechanism makes the proposition harder to explain and the delivery load harder to predict.`,
    ));
  }

  // ---------------------------------------------------------------- approval thresholds
  if ((economics.discountPct ?? 0) > g.requireApprovalAboveDiscountPct) {
    findings.push(finding(
      'approval_discount', 'Manager approval required', 'warning', false,
      `A ${economics.discountPct}% discount is above the ${g.requireApprovalAboveDiscountPct}% threshold, so this offer cannot be published without approval.`,
    ));
  }
  // Measured against the base package's own rate-card value, so a plain multi-class pack is not
  // mistaken for a giveaway. Priced add-ons only: extra redeemable days are checked by their own rule.
  const valueAddPct = economics.valueAddPct;
  if (valueAddPct != null && valueAddPct > g.requireApprovalAboveValueAddPct) {
    findings.push(finding(
      'approval_value_add', 'Manager approval required (value add)', 'warning', false,
      `This offer carries ${valueAddPct.toFixed(0)}% more access than the base package already includes, valued at the studio's own rate card — above the ${g.requireApprovalAboveValueAddPct}% threshold. Cash is untouched but delivery load is not.`,
    ));
  }

  // ---------------------------------------------------------------- duplicate detection
  if (duplicates.length) {
    const worst = duplicates[0];
    findings.push(finding(
      'duplicate_offer', 'Similar offer already exists', 'warning', false,
      `"${worst.name}" is ${Math.round(worst.similarity * 100)}% similar to this offer${duplicates.length > 1 ? ` (and ${duplicates.length - 1} other close match${duplicates.length > 2 ? 'es' : ''})` : ''}. Two live versions of the same idea split the story the desk tells and make results impossible to attribute.`,
      false,
    ));
  }

  // ---------------------------------------------------------------- structural checks
  if (economics.sellingPrice == null || economics.sellingPrice <= 0) {
    findings.push(finding('price_missing', 'Price', 'blocker', false, 'No selling price can be calculated — attach a base package or set a fixed price.', false));
  }
  if (offer.eligibility.newClientsOnly && offer.eligibility.existingMembersOnly) {
    findings.push(finding('eligibility_conflict', 'Eligibility conflict', 'blocker', false, 'The offer is limited to new clients and to existing members at the same time, so nobody can redeem it.', false));
  }
  if (offer.eligibility.lapsedOnly && offer.eligibility.minLapsedDays != null && offer.eligibility.minLapsedDays <= 0) {
    findings.push(finding('lapsed_window', 'Lapsed window', 'warning', false, 'A lapsed-members offer with a minimum lapse of zero days will include members who never really left.', false));
  }
  if (offer.eligibility.locationIds.length > 1) {
    findings.push(finding(
      'location_scope', 'Redeemable locations', 'warning', false,
      `This offer spans ${offer.eligibility.locationIds.length} locations. Memberships bought at one studio are not assumed redeemable at another, so the offer needs location-specific wording before it is sold.`,
      false,
    ));
  }
  if (offer.terms.purchaseDeadline && offer.terms.purchaseDeadline.slice(0, 10) < '2026-10-16') {
    findings.push(finding('purchase_deadline_past', 'Purchase deadline', 'blocker', false, 'The purchase deadline has already passed.', false));
  }
  if (offer.terms.redeemableFrom && offer.terms.redeemableTo && offer.terms.redeemableFrom > offer.terms.redeemableTo) {
    findings.push(finding('redemption_window', 'Redemption window', 'blocker', false, 'The redemption window ends before it begins.', false));
  }
  if (baseProduct && ['complimentary', 'operational', 'internal'].includes(baseProduct.productClass)) {
    findings.push(finding(
      'non_retail_base', 'Non-retail base product', 'blocker', false,
      `"${baseProduct.name}" is recorded in the export as ${baseProduct.productClass.replace(/_/g, ' ')}, not a retail product. Offers must be built on something the studio actually sells.`,
      false,
    ));
  }
  if (baseProduct?.warnings?.length) {
    findings.push(finding(
      'base_warnings', 'Base product has parse warnings', 'info', false,
      `The catalogue record for "${baseProduct.name}" carries ${baseProduct.warnings.length} parse warning(s): ${baseProduct.warnings.slice(0, 2).join('; ')}${baseProduct.warnings.length > 2 ? '…' : ''}. Confirm the record before relying on its numbers.`,
      false,
    ));
  }

  void catalogue;
  return findings;
}

/** Cheap, explainable similarity used for duplicate detection and near-miss warnings. */
export function similarity(a: Offer, b: Offer): number {
  let score = 0;
  let weight = 0;

  const add = (value: number, w: number) => { score += value * w; weight += w; };

  add(a.baseProductId && a.baseProductId === b.baseProductId ? 1 : 0, 3);
  add(a.name.trim().toLowerCase() === b.name.trim().toLowerCase() ? 1 : 0, 2);

  const tokensA = new Set(a.name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3));
  const tokensB = new Set(b.name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3));
  const overlap = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size || 1;
  add(overlap / union, 2);

  const kindsA = new Set(a.components.map(c => c.kind));
  const kindsB = new Set(b.components.map(c => c.kind));
  const kindOverlap = [...kindsA].filter(k => kindsB.has(k)).length;
  add(kindOverlap / Math.max(1, Math.max(kindsA.size, kindsB.size)), 2);

  const audA = new Set(a.audienceSegments); const audB = new Set(b.audienceSegments);
  const audOverlap = [...audA].filter(x => audB.has(x)).length;
  add(audOverlap / Math.max(1, Math.max(audA.size, audB.size)), 1.5);

  const pctA = a.terms.discountPct ?? 0; const pctB = b.terms.discountPct ?? 0;
  add(1 - Math.min(1, Math.abs(pctA - pctB) / 25), 1.5);

  add(a.locationIds.some(l => b.locationIds.includes(l)) ? 1 : 0, 1);

  return weight ? Math.round((score / weight) * 100) / 100 : 0;
}

export function worstSeverity(findings: GuardrailFinding[]): 'blocker' | 'warning' | 'info' | null {
  const failed = findings.filter(f => !f.passed);
  if (failed.some(f => f.severity === 'blocker')) return 'blocker';
  if (failed.some(f => f.severity === 'warning')) return 'warning';
  if (failed.length) return 'info';
  return null;
}

export function failingFindings(findings: GuardrailFinding[]) {
  return findings.filter(f => !f.passed);
}
