/**
 * Domain types.
 *
 * Two rules shape this file:
 *  1. Anything a business person reads as a fact must be traceable — so catalogue records carry
 *     their source block, parse confidence and warnings; offers carry their metrics snapshot.
 *  2. Assumptions are labelled as assumptions. `source` fields exist so the UI can say where a
 *     number came from (observed export, business configuration, platform default, or the user).
 */

export type Role = 'admin' | 'manager' | 'sales' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  avatarColor: string;
  createdAt: string;
}

export type LocationId = 'p57-blr-vmr' | 'studio-cnc-indiranagar' | 'plash-pilates-sadashivnagar' | 'virtual-online' | 'hosted-offsite';

export interface LocationRecord {
  id: LocationId;
  name: string;
  shortName: string;
  city: string;
  kind: 'studio' | 'partner_studio' | 'virtual' | 'offsite';
  notes: string | null;
}

export type ProductClass =
  | 'standard_retail'
  | 'introductory'
  | 'promotional'
  | 'complimentary'
  | 'operational'
  | 'partner'
  | 'internal';

export type ProductStatus = 'active' | 'review' | 'historical' | 'archived';

export interface CatalogueEligibility {
  newClientsOnly: boolean;
  firstPurchaseOnly: boolean;
  /** Memberships bought at one studio are never assumed redeemable at another. */
  locationRestricted: boolean;
  allowedLocationIds: LocationId[];
  exclusiveAudience: string | null;
}

export interface CatalogueObserved {
  product: string;
  units: number;
  revenue: number;
  avgRealisedPrice: number | null;
  discountGiven: number;
  unitsLast90d: number;
  revenueLast90d: number;
  firstSale: string | null;
  lastSale: string | null;
}

export interface CatalogueProduct {
  id: string;
  sourceId: string;
  sourceIdTail: string | null;
  sourceFile: string;
  sourceIndex: number | null;
  rawBlockHash: string;
  name: string;
  productClass: ProductClass;
  /** Why a record was excluded from retail comparisons, if it was. */
  exclusionReason: string | null;
  status: ProductStatus;
  /** Plain-language reason for the status — shown next to the record. */
  statusBasis: string;
  locationId: LocationId;
  locationName: string;
  price: number | null;
  priceType: 'listed' | 'observed_average' | 'zero' | 'unknown';
  duration: number | null;
  durationUnit: 'days' | 'weeks' | 'months' | 'years' | null;
  credits: number | null;
  complimentaryCredits: number | null;
  creditSource: string;
  unlimitedAccess: boolean;
  privateSessionCount: number | null;
  isIntroOffer: boolean;
  audienceRestriction: string | null;
  description: string;
  benefits: string[];
  policies: Record<string, any>;
  eligibility: CatalogueEligibility;
  createdAt: string | null;
  modifiedAt: string | null;
  softDeletedInSource: boolean;
  parseConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  manualReviewNote: string | null;
  tags: string[];
  observed: CatalogueObserved | null;
}

export interface CatalogueVersion {
  id: string;
  productId: string;
  version: number;
  changedFields: string[];
  note: string | null;
  authorId: string;
  createdAt: string;
  snapshot: CatalogueProduct | null;
}

export type ComponentKind =
  | 'discount_pct'
  | 'discount_amount'
  | 'bonus_credits'
  | 'validity_extension'
  | 'complimentary_classes'
  | 'private_sessions'
  | 'guest_passes'
  | 'bundle_item'
  | 'tier_benefit'
  | 'referral_credit';

export type ComponentUnit = 'pct' | 'inr' | 'credits' | 'days' | 'sessions' | 'passes' | 'items' | 'level';

export interface OfferComponent {
  id: string;
  kind: ComponentKind;
  value: number;
  unit?: ComponentUnit | string;
  label: string;
  note?: string;
  /** Locked attributes are held constant when the user asks for alternatives. */
  locked?: boolean;
  derived?: boolean;
}

export type AudienceSegment =
  | 'first_time_customers'
  | 'existing_active_members'
  | 'recently_expired_members'
  | 'long_lapsed_members'
  | 'high_value_clients'
  | 'low_frequency_members'
  | 'previous_trial_customers'
  | 'referral_customers'
  | 'corporate_clients'
  | 'private_training_clients'
  | 'custom';

export type CommercialObjective =
  | 'acquire_new_members'
  | 'increase_renewals'
  | 'reactivate_lapsed'
  | 'increase_atv'
  | 'longer_commitment'
  | 'improve_frequency'
  | 'upsell_private_training'
  | 'introduce_formats'
  | 'drive_offpeak'
  | 'encourage_referrals'
  | 'reward_loyalty'
  | 'convert_after_trial';

export type OfferStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published' | 'expired' | 'archived';

export type OfferOrigin = 'guided' | 'random' | 'nlq' | 'manual' | 'remix' | 'seeded_concept' | 'template';

export interface OfferTerms {
  pricingMode: 'discount_pct' | 'discount_amount' | 'fixed_price' | 'value_add';
  discountPct: number | null;
  discountAmount: number | null;
  sellingPrice: number | null;
  validityDays: number | null;
  creditsIncluded: number | null;
  bonusCredits: number | null;
  complimentaryClasses: number | null;
  privateSessions: number | null;
  guestPasses: number | null;
  validityExtensionDays: number;
  purchaseDeadline: string | null;
  redeemableFrom: string | null;
  redeemableTo: string | null;
}

export interface OfferEligibility {
  audienceSegments: AudienceSegment[];
  customAudience?: string;
  newClientsOnly: boolean;
  existingMembersOnly: boolean;
  lapsedOnly: boolean;
  minLapsedDays?: number | null;
  locationIds: LocationId[];
  purchaseLimitPerMember: number | null;
  requiresCode: boolean;
  code?: string | null;
  stackableWithOtherOffers: boolean;
  exclusions: string[];
}

export interface GenerationContext {
  engine: string;
  engineVersion: string;
  mode: 'guided' | 'random' | 'nlq' | 'remix' | 'seed' | 'manual';
  provider: string;
  providerLabel: string;
  prompt?: string | null;
  presetId?: string | null;
  presetLabel?: string | null;
  controls?: Record<string, number | string | null> | null;
  catalogueSnapshot?: string | null;
  evidenceUsed?: string[];
  notes?: string[];
  generatedAt: string;
}

export interface Offer {
  id: string;
  code: string;
  name: string;
  internalTitle: string | null;
  description: string;
  promoCopy: string;
  status: OfferStatus;
  origin: OfferOrigin;
  /** true when this concept has never run in market — surfaced everywhere it appears. */
  conceptOnly: boolean;
  baseProductId: string | null;
  baseProductName: string | null;
  baseProductPrice?: number | null;
  locationIds: LocationId[];
  components: OfferComponent[];
  audienceSegments: AudienceSegment[];
  objectives: CommercialObjective[];
  eligibility: OfferEligibility;
  terms: OfferTerms;
  tags: string[];
  collectionIds: string[];
  campaignId: string | null;
  ownerId: string;
  collaboratorIds: string[];
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  expiresOn: string | null;
  version: number;
  approvedVersion: number | null;
  requiresReapproval: boolean;
  favourite: boolean;
  pinned: boolean;
  archivedAt: string | null;
  metricsSnapshot: ComputedMetrics | null;
  generationContext: GenerationContext | null;
}

export interface OfferVersion {
  id: string;
  offerId: string;
  version: number;
  snapshot: Offer;
  changeSummary: string;
  changedFields: string[];
  authorId: string;
  createdAt: string;
  approvalState: OfferStatus;
}

export interface GuardrailFinding {
  ruleId: string;
  label: string;
  severity: 'blocker' | 'warning' | 'info';
  detail: string;
  passed: boolean;
  /** true when the threshold behind this rule is editable in Settings. */
  configurable: boolean;
}

export interface CannibalisationFinding {
  severity: 'high' | 'medium' | 'low';
  productId: string;
  productName: string;
  /** The comparison itself, e.g. "₹1,041 vs ₹1,350 per class". */
  metric: string;
  detail: string;
}

export interface ScorecardDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  weight?: number;
  /** 'calculated' where the score reads the engine's own figures, 'heuristic' where it is a judgement. */
  basis?: 'calculated' | 'heuristic';
  reasoning: string;
}

export interface ScorecardResult {
  overall: number;
  dimensions: ScorecardDimension[];
  /** Editorial assessment of the offer's own design. Never a conversion prediction. */
  disclaimer: string;
}

/** Kept as an alias so panels can describe the same shape under either name. */
export type Scorecard = ScorecardResult;

export interface ValueBuildUpItem {
  label: string;
  quantity: number;
  unitValue: number | null;
  value: number | null;
  note?: string;
}

export interface ComputedMetrics {
  computedAt: string;
  engineVersion: string;
  listPrice: number | null;
  sellingPrice: number | null;
  discountAmount: number | null;
  discountPct: number | null;
  includedCredits: number | null;
  totalCreditsValue: number;
  bonusCredits?: number;
  complimentaryClasses?: number;
  privateSessions?: number;
  guestPasses?: number;
  unlimitedAccess?: boolean;
  effectivePricePerClass: number | null;
  effectivePricePerVisit: number | null;
  attendanceAssumption: { visitsPerMonth: number; source: string } | null;
  customerValueReceived: number | null;
  /** Extra access over the base package, valued at the studio's own rate card. */
  valueAddPct?: number | null;
  customerSavings: number | null;
  customerSavingsPct: number | null;
  revenueDeltaVsReference: number | null;
  revenueRetentionPct: number | null;
  breakEvenUnits: number | null;
  validityDays: number | null;
  validityDeltaDays: number | null;
  valuePerRupee: number | null;
  deliveryCostEstimate: number | null;
  contributionMargin: number | null;
  contributionMarginPct: number | null;
  costBasis: string | null;
  cannibalisation: CannibalisationFinding[];
  guardrails: GuardrailFinding[];
  scorecard: ScorecardResult;
  /** Every line here explains how a number was derived; shown in the economics tab. */
  notes: string[];
}

export interface SimulationAssumptions {
  expectedBuyers: number | null;
  conversionRatePct: number | null;
  poolSize: number | null;
  utilisationPct: number | null;
  deliveryCostPerClass: number | null;
  attendancePerMonth: number | null;
  cannibalisationRatePct: number | null;
  scenarioMultipliers: { conservative: number; expected: number; optimistic: number };
  /** Provenance of any pre-filled figure, e.g. "observed median across the Bengaluru member base". */
  sourceNote?: string | null;
}

export interface SimulationScenario {
  scenario: 'conservative' | 'expected' | 'optimistic';
  multiplier?: number;
  buyers: number;
  grossRevenue: number;
  displacedRevenue: number;
  incrementalRevenue: number;
  totalVisits: number;
  deliveryCost: number | null;
  contribution: number | null;
  assumptionTrace: string[];
}

export interface SimulationResult {
  ready: boolean;
  blockers: string[];
  scenarios: SimulationScenario[];
  recommendation: string;
  assumptionTrace: string[];
  disclaimer: string;
  observedReference?: { pct: number | null; label: string; source: string } | null;
}

export type ApprovalAction = 'submit' | 'approve' | 'request_changes' | 'reject' | 'publish' | 'expire' | 'archive' | 'reopen';

export interface ApprovalEvent {
  id: string;
  offerId: string;
  version: number;
  action: ApprovalAction;
  actorId: string;
  note: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  offerId: string;
  authorId: string;
  body: string;
  mentions: string[];
  parentId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ActivityEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: 'offer' | 'campaign' | 'catalogue' | 'settings' | 'approval' | 'comment' | 'import' | 'ai';
  entityId: string;
  entityLabel: string;
  detail: string | null;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface Campaign {
  id: string;
  name: string;
  slug: string;
  objective: string;
  description: string;
  audienceSegments: AudienceSegment[];
  locationIds: LocationId[];
  startDate: string;
  endDate: string;
  status: 'planned' | 'in_review' | 'approved' | 'live' | 'completed' | 'cancelled';
  offerIds: string[];
  ownerId: string;
  memberIds: string[];
  messaging: string;
  /** Every expected figure carries the basis it came from; unsupplied numbers stay blank. */
  expectedOutcomes: { label: string; value: string; basis: string }[];
  actuals: { label: string; value: string; basis: string }[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string;
  accent: string;
  kind: 'system' | 'user';
  offerIds: string[];
}

export interface GuardrailConfig {
  /** Ceiling applied to any cash discount. Set by the business, not by the platform. */
  maxDiscountPct: number;
  maxDiscountPctByClass: Record<string, number>;
  minEffectivePricePerClass: number;
  minEffectivePricePerClassBasis: string;
  maxBonusCreditsPct: number;
  maxValidityExtensionDays: number;
  maxPrivateSessionDiscountPct: number;
  /** Blockers below become warnings when an approver overrides with a note. */
  blockDiscountOnIntroProducts: boolean;
  blockStacking: boolean;
  maxGuestPasses: number;
  maxCompClasses: number;
  requireApprovalAboveDiscountPct: number;
  requireApprovalAboveValueAddPct: number;
  reapprovalOnCommercialChange: boolean;
  maxDiscountOnUnlimitedPct: number;
  allowDiscountOnUnlimited: boolean;
  minValidityDays: number;
  source: 'platform_defaults' | 'org_configured';
  updatedAt: string;
  updatedBy: string;
}

export interface CostAssumptions {
  /** Null until the business supplies real cost data. Margin is withheld while these are null. */
  deliveryCostPerStudioClass: number | null;
  deliveryCostPerPrivateSession: number | null;
  paymentProcessingFeePct: number | null;
  gstRatePct: number | null;
  source: 'not_configured' | 'org_configured';
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AttendanceAssumptions {
  /** Unlimited memberships are valued on attendance, never on a fixed credit count. */
  visitsPerMonthDefault: number | null;
  visitsPerMonthByLocation: Record<string, number>;
  bySegment: { segment: AudienceSegment | 'all'; visitsPerMonth: number; basis: string }[];
  /** Where the assumption came from — displayed wherever it is used. */
  source: 'observed_export' | 'org_configured' | 'not_configured';
  sourceNote: string;
  observedMedianVisitsPerMonth: number | null;
  updatedAt: string;
  updatedBy: string;
}

export interface AIProviderConfig {
  provider: 'local_strategist' | 'anthropic' | 'openai' | 'gemini';
  model: string | null;
  keyConfigured: boolean;
  keyHint: string | null;
  baseUrl: string | null;
  /** The line the UI shows so nobody believes a model is connected when it is not. */
  label: string;
  updatedAt: string;
  updatedBy: string;
}

export interface IntegrationConfig {
  key: string;
  label: string;
  /**
   * not_connected — nothing is wired up.
   * demo          — a file supplied by the business is analysed locally; nothing syncs anywhere.
   * connected     — a credential and endpoint exist AND a person verified it works. Never claimed
   *                 automatically: the workspace does not ping third-party systems to prove itself.
   */
  status: 'not_connected' | 'demo' | 'connected';
  detail: string;
  /** What the business has to provide before a live connection could exist. */
  needs?: string;
  /** Endpoint or webhook target. Null until someone actually has one. */
  endpoint?: string | null;
  /** When a human last confirmed the connection works. Null means never verified. */
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface SettingsBundle {
  guardrails: GuardrailConfig;
  costs: CostAssumptions;
  attendance: AttendanceAssumptions;
  simulation: SimulationAssumptions;
  ai: AIProviderConfig;
  integrations: IntegrationConfig[];
}

export interface ImportRecord {
  id: string;
  filename: string;
  kind: 'csv' | 'xlsx' | 'manual';
  rows: number;
  created: number;
  updated: number;
  flagged: number;
  rejected: number;
  status: 'applied' | 'dry_run' | 'failed';
  report: ImportRowReport[];
  createdAt: string;
  createdBy: string;
}

export interface ImportRowReport {
  row: number;
  sourceId: string | null;
  name: string | null;
  outcome: 'created' | 'updated' | 'flagged' | 'rejected' | 'unchanged';
  notes: string[];
}

export interface AIGenerationRecord {
  id: string;
  mode: 'guided' | 'random' | 'nlq' | 'remix' | 'names' | 'messages' | 'pitch' | 'strategize';
  provider: string;
  engineVersion: string;
  prompt: string | null;
  inputs: Record<string, unknown>;
  outputSummary: string;
  offerIds: string[];
  durationMs: number;
  fallbackReason: string | null;
  createdAt: string;
  createdBy: string;
}

export interface PerformanceRecord {
  id: string;
  offerId: string;
  metric: string;
  kind: 'expected' | 'observed' | 'hypothetical';
  value: string;
  basis: string;
  source: string;
  createdAt: string;
  createdBy: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: 'mention' | 'approval_requested' | 'approval_decided' | 'assignment' | 'comment' | 'system';
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Every block the strategist writes, with the evidence split out by kind. */
export interface OfferStrategy {
  offerName: string;
  concept: string;
  whyItWorks: string;
  customerAppeal: string;
  commercialImpact: string;
  risks: string[];
  recommendedAudience: string;
  salesPitch: string;
  alternativeApproach: string;
  facts: string[];
  estimates: string[];
  assumptions: string[];
  recommendations: string[];
}

export interface MessageBundle {
  headline: string;
  whatsappShort: string;
  whatsappDetailed: string;
  emailSubject: string;
  emailBody: string;
  verbalScript: string;
  campaignDescription: string;
  socialCaption: string;
  factsUsed: string[];
}

export type GeneratedMessages = MessageBundle;

export interface AnalyticsBundle {
  sales: Record<string, unknown> | null;
  funnel: Record<string, unknown> | null;
  customerBase: Record<string, unknown> | null;
  capacity: Record<string, unknown> | null;
  catalogueStats: {
    total: number;
    sellable: number;
    unlimited: number;
    review: number;
    withWarnings: number;
    nonRetail: number;
    historical: number;
    byClass: Record<string, number>;
    byLocation: Record<string, number>;
  };
  offerStats: {
    total: number;
    byStatus: Record<string, number>;
    byCollection: Record<string, number>;
    byAudience: Record<string, number>;
    byOrigin?: Record<string, number>;
    avgDiscountPct: number | null;
    avgSavingsPct: number | null;
    estimatedRevenueOpportunity: number | null;
    expiringSoon: Offer[];
    awaitingApproval: Offer[];
    conceptOnly?: number;
    published?: number;
    draft?: number;
    inReview?: number;
  };
  campaigns?: {
    total: number;
    byStatus: Record<string, number>;
    live: number;
    planned: number;
    nextStart: string | null;
  };
}

export interface AssumptionTrace {
  label: string;
  value: string;
  source: 'catalogue' | 'setting' | 'observed_export' | 'user_input' | 'platform_default';
  note?: string;
}
