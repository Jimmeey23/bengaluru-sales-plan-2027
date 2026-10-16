import { z } from 'zod';

export const audienceSegment = z.enum([
  'first_time_customers', 'existing_active_members', 'recently_expired_members', 'long_lapsed_members',
  'high_value_clients', 'low_frequency_members', 'previous_trial_customers', 'referral_customers',
  'corporate_clients', 'private_training_clients', 'custom',
]);

export const commercialObjective = z.enum([
  'acquire_new_members', 'increase_renewals', 'reactivate_lapsed', 'increase_atv', 'longer_commitment',
  'improve_frequency', 'upsell_private_training', 'introduce_formats', 'drive_offpeak',
  'encourage_referrals', 'reward_loyalty', 'convert_after_trial',
]);

export const componentKind = z.enum([
  'discount_pct', 'discount_amount', 'bonus_credits', 'validity_extension', 'complimentary_classes',
  'private_sessions', 'guest_passes', 'bundle_item', 'tier_benefit', 'referral_credit',
]);

export const locationId = z.enum(['p57-blr-vmr', 'studio-cnc-indiranagar', 'plash-pilates-sadashivnagar', 'virtual-online', 'hosted-offsite']);

export const offerComponentSchema = z.object({
  id: z.string(),
  kind: componentKind,
  value: z.number().finite(),
  unit: z.string().optional(),
  label: z.string(),
  note: z.string().optional(),
  locked: z.boolean().optional(),
  derived: z.boolean().optional(),
});

export const offerTermsSchema = z.object({
  pricingMode: z.enum(['discount_pct', 'discount_amount', 'fixed_price', 'value_add']),
  discountPct: z.number().min(0).max(100).nullable(),
  discountAmount: z.number().min(0).nullable(),
  sellingPrice: z.number().min(0).nullable(),
  validityDays: z.number().int().min(1).max(1095).nullable(),
  creditsIncluded: z.number().int().min(0).max(2000).nullable(),
  bonusCredits: z.number().int().min(0).max(500).nullable(),
  complimentaryClasses: z.number().int().min(0).max(100).nullable(),
  privateSessions: z.number().int().min(0).max(100).nullable(),
  guestPasses: z.number().int().min(0).max(50).nullable(),
  validityExtensionDays: z.number().int().min(0).max(365),
  purchaseDeadline: z.string().nullable(),
  redeemableFrom: z.string().nullable(),
  redeemableTo: z.string().nullable(),
});

export const eligibilitySchema = z.object({
  audienceSegments: z.array(audienceSegment).default([]),
  customAudience: z.string().optional(),
  newClientsOnly: z.boolean(),
  existingMembersOnly: z.boolean(),
  lapsedOnly: z.boolean(),
  minLapsedDays: z.number().int().min(0).max(3650).nullable().optional(),
  locationIds: z.array(locationId).min(1, 'Select at least one studio.'),
  purchaseLimitPerMember: z.number().int().min(1).max(100).nullable(),
  requiresCode: z.boolean(),
  code: z.string().nullable().optional(),
  stackableWithOtherOffers: z.boolean(),
  exclusions: z.array(z.string()).default([]),
});

export const offerUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, 'Give the offer a name of at least 3 characters.').max(120),
  internalTitle: z.string().max(160).nullable().optional(),
  description: z.string().max(4000).default(''),
  promoCopy: z.string().max(4000).default(''),
  status: z.enum(['draft', 'in_review', 'changes_requested', 'approved', 'published', 'expired', 'archived']).default('draft'),
  origin: z.enum(['guided', 'random', 'nlq', 'manual', 'remix', 'seeded_concept', 'template']).default('manual'),
  baseProductId: z.string().nullable(),
  locationIds: z.array(locationId).min(1, 'Select at least one studio.'),
  components: z.array(offerComponentSchema).default([]),
  audienceSegments: z.array(audienceSegment).min(1, 'Choose at least one audience segment.'),
  objectives: z.array(commercialObjective).min(1, 'Choose at least one commercial objective.'),
  eligibility: eligibilitySchema,
  terms: offerTermsSchema,
  tags: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  campaignId: z.string().nullable().default(null),
  collaboratorIds: z.array(z.string()).default([]),
  internalNotes: z.string().max(6000).default(''),
  favourite: z.boolean().default(false),
  pinned: z.boolean().default(false),
  expiresOn: z.string().nullable().default(null),
  generationContext: z.any().optional(),
  conceptOnly: z.boolean().default(true),
  expectedVersion: z.number().int().optional(),
});

export const workflowSchema = z.object({
  action: z.enum(['submit', 'approve', 'request_changes', 'reject', 'publish', 'expire', 'archive', 'reopen']),
  note: z.string().max(1000).optional(),
  version: z.number().int().optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1, 'Write something first.').max(4000),
  mentions: z.array(z.string()).default([]),
  parentId: z.string().nullable().optional(),
});

export const generateSchema = z.object({
  mode: z.enum(['guided', 'random', 'nlq', 'strategize', 'remix', 'names', 'pitch']),
  prompt: z.string().max(2000).optional(),
  audience: z.array(audienceSegment).default([]),
  objectives: z.array(commercialObjective).default([]),
  locationIds: z.array(locationId).default([]),
  presetId: z.string().optional(),
  controls: z.object({
    creativity: z.number().min(0).max(100),
    discountAggressiveness: z.number().min(0).max(100),
    customerAttractiveness: z.number().min(0).max(100),
    revenueProtection: z.number().min(0).max(100),
    complexity: z.number().min(0).max(100),
    durationBias: z.enum(['shorter', 'same', 'longer']).optional(),
  }),
  constraints: z.object({
    maxDiscountPct: z.number().min(0).max(100).optional(),
    priceTarget: z.number().min(100).max(500000).optional(),
    preferValueAdd: z.boolean().optional(),
    festive: z.boolean().optional(),
    includePrivate: z.boolean().optional(),
  }).optional(),
  count: z.number().int().min(1).max(6).default(3),
  seed: z.number().optional(),
  locked: z.object({
    baseProductId: z.string().nullable().optional(),
    audience: z.boolean().optional(),
    objectives: z.boolean().optional(),
    discount: z.number().nullable().optional(),
    validityDays: z.number().nullable().optional(),
    structure: z.array(componentKind).optional(),
    naming: z.string().nullable().optional(),
  }).optional(),
  offerId: z.string().optional(),
});

export const simulateSchema = z.object({
  offerIds: z.array(z.string()).min(1).max(4),
  assumptions: z.object({
    expectedBuyers: z.number().min(0).max(1000000).nullable(),
    conversionRatePct: z.number().min(0).max(100).nullable(),
    poolSize: z.number().min(0).max(1000000).nullable(),
    utilisationPct: z.number().min(0).max(100).nullable(),
    deliveryCostPerClass: z.number().min(0).max(100000).nullable(),
    attendancePerMonth: z.number().min(0).max(60).nullable(),
    cannibalisationRatePct: z.number().min(0).max(100).nullable(),
    scenarioMultipliers: z.object({ conservative: z.number().min(0.05).max(2), expected: z.number().min(0.05).max(2), optimistic: z.number().min(0.05).max(2) }),
  }),
  referenceComparison: z.object({
    mechanism: z.enum(['extra_class', 'discount_pct']),
    value: z.number().min(0).max(100).optional(),
  }).optional(),
});

export const campaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3).max(120),
  objective: z.string().max(500).default(''),
  description: z.string().max(4000).default(''),
  audienceSegments: z.array(audienceSegment).default([]),
  locationIds: z.array(locationId).min(1),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['planned', 'in_review', 'approved', 'live', 'completed', 'cancelled']),
  offerIds: z.array(z.string()).default([]),
  memberIds: z.array(z.string()).default([]),
  messaging: z.string().max(4000).default(''),
  expectedOutcomes: z.array(z.object({ label: z.string(), value: z.string(), basis: z.string() })).default([]),
  actuals: z.array(z.object({ label: z.string(), value: z.string(), basis: z.string() })).nullable().default(null),
});

export const catalogueEditSchema = z.object({
  price: z.number().min(0).max(1000000).optional(),
  status: z.enum(['active', 'review', 'historical', 'archived']).optional(),
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(6000).optional(),
  credits: z.number().int().min(0).max(2000).nullable().optional(),
  duration: z.number().min(0).max(2000).nullable().optional(),
  durationUnit: z.enum(['days', 'weeks', 'months', 'years']).nullable().optional(),
  isIntroOffer: z.boolean().optional(),
  unlimitedAccess: z.boolean().optional(),
  complimentaryCredits: z.number().int().min(0).max(200).nullable().optional(),
  privateSessionCount: z.number().int().min(0).max(200).nullable().optional(),
  audienceRestriction: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().max(500).optional(),
  manualReviewNote: z.string().max(1000).nullable().optional(),
});

export const settingsSchema = z.object({
  key: z.enum(['guardrails', 'costs', 'attendance', 'simulation', 'ai', 'integrations']),
  value: z.any(),
  unlockWithPassword: z.string().optional(),
});
