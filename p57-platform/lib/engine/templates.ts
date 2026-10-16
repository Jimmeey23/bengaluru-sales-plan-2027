/**
 * Commercial playbooks: audience → candidate products, objective → mechanism preferences,
 * and the presets used by the random generator. All of this is catalogue-driven and editable;
 * nothing here is presented as a rule supplied by Physique 57.
 */
import type { AudienceSegment, CommercialObjective, ComponentKind, LocationId } from '@/lib/types';

export interface GenerationPreset {
  id: string;
  label: string;
  blurb: string;
  controls: {
    creativity: number;            // 0 restrained → 100 unexpected
    discountAggressiveness: number; // 0 protect price → 100 aggressive
    customerAttractiveness: number; // 0 modest → 100 irresistible
    revenueProtection: number;      // 0 volume-first → 100 revenue-first
    complexity: number;             // 0 single mechanic → 100 layered
  };
  preferObjectives: CommercialObjective[];
  preferSegments: AudienceSegment[];
  mechanismBias: ComponentKind[];
  durationBias: 'shorter' | 'same' | 'longer';
}

export const GENERATION_PRESETS: GenerationPreset[] = [
  {
    id: 'safe-sensible', label: 'Safe & Sensible', blurb: 'Value-add led, minimal cash discount, easy to explain at the desk.',
    controls: { creativity: 25, discountAggressiveness: 15, customerAttractiveness: 55, revenueProtection: 85, complexity: 25 },
    preferObjectives: ['increase_renewals', 'reward_loyalty', 'improve_frequency'], preferSegments: ['existing_active_members', 'recently_expired_members'],
    mechanismBias: ['bonus_credits', 'validity_extension', 'guest_passes'], durationBias: 'same',
  },
  {
    id: 'conversion-booster', label: 'Conversion Booster', blurb: 'Built to convert trialists and warm enquiries quickly.',
    controls: { creativity: 45, discountAggressiveness: 55, customerAttractiveness: 85, revenueProtection: 45, complexity: 40 },
    preferObjectives: ['acquire_new_members', 'convert_after_trial'], preferSegments: ['first_time_customers', 'previous_trial_customers'],
    mechanismBias: ['complimentary_classes', 'discount_pct', 'bundle_item'], durationBias: 'shorter',
  },
  {
    id: 'high-value-upgrade', label: 'High-Value Upgrade', blurb: 'Moves strong members up a tier without repricing the flagship.',
    controls: { creativity: 45, discountAggressiveness: 25, customerAttractiveness: 70, revenueProtection: 80, complexity: 55 },
    preferObjectives: ['increase_atv', 'longer_commitment', 'upsell_private_training'], preferSegments: ['high_value_clients', 'existing_active_members'],
    mechanismBias: ['private_sessions', 'validity_extension', 'tier_benefit'], durationBias: 'longer',
  },
  {
    id: 'revenue-protector', label: 'Revenue Protector', blurb: 'Deliberately avoids cash discounting; trades access and service instead.',
    controls: { creativity: 35, discountAggressiveness: 5, customerAttractiveness: 60, revenueProtection: 100, complexity: 40 },
    preferObjectives: ['increase_renewals', 'encourage_referrals', 'reward_loyalty'], preferSegments: ['existing_active_members', 'high_value_clients'],
    mechanismBias: ['validity_extension', 'guest_passes', 'tier_benefit'], durationBias: 'same',
  },
  {
    id: 'creative-wildcard', label: 'Creative Wildcard', blurb: 'Unusual structures that still price sensibly against the catalogue.',
    controls: { creativity: 95, discountAggressiveness: 40, customerAttractiveness: 80, revenueProtection: 60, complexity: 80 },
    preferObjectives: ['introduce_formats', 'improve_frequency', 'drive_offpeak'], preferSegments: ['low_frequency_members', 'long_lapsed_members'],
    mechanismBias: ['bundle_item', 'referral_credit', 'guest_passes'], durationBias: 'same',
  },
  {
    id: 'festive-special', label: 'Festive Special', blurb: 'Seasonal framing with a deadline, built around gifting and celebration.',
    controls: { creativity: 60, discountAggressiveness: 45, customerAttractiveness: 80, revenueProtection: 60, complexity: 50 },
    preferObjectives: ['acquire_new_members', 'increase_atv'], preferSegments: ['first_time_customers', 'existing_active_members'],
    mechanismBias: ['discount_pct', 'guest_passes', 'bundle_item'], durationBias: 'same',
  },
  {
    id: 'win-back-special', label: 'Win-Back Special', blurb: 'Low-risk re-entry for dormant members; a ramp, not an upsell.',
    controls: { creativity: 50, discountAggressiveness: 50, customerAttractiveness: 85, revenueProtection: 50, complexity: 30 },
    preferObjectives: ['reactivate_lapsed'], preferSegments: ['long_lapsed_members', 'recently_expired_members'],
    mechanismBias: ['complimentary_classes', 'validity_extension', 'discount_pct'], durationBias: 'shorter',
  },
  {
    id: 'private-upsell', label: 'Private Training Upsell', blurb: 'Bundles one-to-one attention with studio access, gated by trainer capacity.',
    controls: { creativity: 40, discountAggressiveness: 20, customerAttractiveness: 75, revenueProtection: 85, complexity: 60 },
    preferObjectives: ['upsell_private_training', 'increase_atv'], preferSegments: ['private_training_clients', 'high_value_clients'],
    mechanismBias: ['private_sessions', 'bonus_credits', 'tier_benefit'], durationBias: 'same',
  },
  {
    id: 'premium-experience', label: 'Premium Experience', blurb: 'High-ticket, low-discount, experience-led. Nothing that reads as a sale.',
    controls: { creativity: 65, discountAggressiveness: 10, customerAttractiveness: 70, revenueProtection: 90, complexity: 70 },
    preferObjectives: ['increase_atv', 'reward_loyalty'], preferSegments: ['high_value_clients'],
    mechanismBias: ['private_sessions', 'tier_benefit', 'bundle_item'], durationBias: 'longer',
  },
  {
    id: 'completely-unexpected', label: 'Completely Unexpected', blurb: 'Deliberately strange combinations, priced so they can still be approved.',
    controls: { creativity: 100, discountAggressiveness: 60, customerAttractiveness: 90, revenueProtection: 40, complexity: 95 },
    preferObjectives: ['introduce_formats', 'drive_offpeak', 'encourage_referrals'], preferSegments: ['low_frequency_members', 'referral_customers'],
    mechanismBias: ['bundle_item', 'referral_credit', 'guest_passes', 'complimentary_classes'], durationBias: 'shorter',
  },
];

/** Which catalogue products are commercially sensible bases for each audience. */
export const AUDIENCE_PLAYS: Record<AudienceSegment, {
  label: string; match: (name: string, ctx: { credits: number | null; unlimited: boolean; intro: boolean; privateProducts: boolean; durationDays: number | null }) => number;
  rationale: string; typicalMechanics: ComponentKind[];
}> = {
  first_time_customers: {
    label: 'First-time customers',
    match: (n, c) => (c.intro ? 5 : 0) + (/single class/i.test(n) ? 3 : 0) + (/newcomer|kickstarter|2 for 1/i.test(n) ? 4 : 0) + (c.credits && c.credits <= 4 ? 2 : 0),
    rationale: 'Entry risk has to be low and the first step obvious; intro and small-credit products carry that risk for the studio.',
    typicalMechanics: ['complimentary_classes', 'discount_pct', 'bonus_credits'],
  },
  existing_active_members: {
    label: 'Existing active members',
    match: (n, c) => (c.unlimited ? 4 : 0) + (c.credits && c.credits >= 8 ? 2 : 0) + (/month|annual|hybrid/i.test(n) ? 3 : 0),
    rationale: 'Already converting; the lever is commitment length and progression, not entry price.',
    typicalMechanics: ['validity_extension', 'bonus_credits', 'tier_benefit'],
  },
  recently_expired_members: {
    label: 'Recently expired members',
    match: (n, c) => (/month|12 class|8 class|4 class/i.test(n) ? 4 : 0) + (c.unlimited && !c.intro ? 1 : 0),
    rationale: 'They know the product. The barrier is re-committing after a break, so the first month back must feel low risk.',
    typicalMechanics: ['bonus_credits', 'complimentary_classes', 'validity_extension'],
  },
  long_lapsed_members: {
    label: 'Long-lapsed members',
    match: (n, c) => (/2 week|4 class|single class|kickstarter|weekend/i.test(n) ? 5 : 0) + (c.durationDays ? (c.durationDays <= 21 ? 1 : 0) : 0),
    rationale: 'Re-entry needs a short, finite commitment — a re-introduction to the method rather than a re-subscription.',
    typicalMechanics: ['complimentary_classes', 'validity_extension', 'discount_pct'],
  },
  high_value_clients: {
    label: 'High-value clients',
    match: (n, c) => (/annual|6 month|hybrid|private/i.test(n) ? 5 : 0) + (c.unlimited ? 2 : 0),
    rationale: 'Protect the price point, differentiate the experience, and use access rather than discounts.',
    typicalMechanics: ['private_sessions', 'tier_benefit', 'validity_extension'],
  },
  low_frequency_members: {
    label: 'Low-frequency members',
    match: (n, c) => (c.credits && c.credits >= 8 && c.credits <= 30 ? 4 : 0) + (/10|12|20/i.test(n) ? 2 : 0),
    rationale: 'Frequency responds to structure (window, cadence, accountability) more than to price.',
    typicalMechanics: ['bonus_credits', 'validity_extension', 'bundle_item'],
  },
  previous_trial_customers: {
    label: 'Previous trial customers',
    match: (n, c) => (c.intro ? 5 : 0) + (/newcomer|kickstarter|2 for 1|intro/i.test(n) ? 4 : 0),
    rationale: 'The objection is almost always the second step; bridge the trial into a small paid commitment.',
    typicalMechanics: ['complimentary_classes', 'bonus_credits', 'discount_amount'],
  },
  referral_customers: {
    label: 'Referral customers',
    match: (n, c) => (c.credits && c.credits >= 4 && c.credits <= 12 ? 4 : 0) + (/guest|referral/i.test(n) ? 3 : 0),
    rationale: 'Warm intent already exists; reward the social proof without hollowing out price.',
    typicalMechanics: ['guest_passes', 'referral_credit', 'bonus_credits'],
  },
  corporate_clients: {
    label: 'Corporate clients',
    match: (n, c) => (c.credits && c.credits >= 4 && c.credits <= 12 ? 4 : 0) + (/private/i.test(n) ? 1 : 0),
    rationale: 'Purchased by an employer: predictable, invoiced and volume-shaped rather than urgency-led.',
    typicalMechanics: ['bonus_credits', 'bundle_item', 'tier_benefit'],
  },
  private_training_clients: {
    label: 'Private training clients',
    match: (n, c) => (/private/i.test(n) ? 6 : 0) + (/hybrid/i.test(n) ? 4 : 0),
    rationale: 'Capacity-constrained and high-margin; bundle attention with studio access rather than cutting rates.',
    typicalMechanics: ['private_sessions', 'bonus_credits', 'tier_benefit'],
  },
  custom: {
    label: 'Custom audience',
    match: (n, c) => 1,
    rationale: 'Custom segment — document the definition so the offer stays reproducible.',
    typicalMechanics: ['bonus_credits', 'validity_extension'],
  },
};

export const OBJECTIVE_PLAYS: Record<CommercialObjective, {
  label: string; metric: string; mechanismWeights: Partial<Record<ComponentKind, number>>; guard: string;
}> = {
  acquire_new_members: { label: 'Acquire new members', metric: 'new clients acquired', mechanismWeights: { complimentary_classes: 3, bonus_credits: 2, discount_pct: 1.5, bundle_item: 1 }, guard: 'New-client offers are the one place a lower entry price is structurally justified — but they must not bleed into the standing catalogue.' },
  increase_renewals: { label: 'Increase renewals', metric: 'renewal rate', mechanismWeights: { bonus_credits: 3, validity_extension: 2.5, tier_benefit: 1.5, discount_pct: 0.8 }, guard: 'Members at renewal are already loyal; a cash discount here mostly gives away margin that would have been earned anyway.' },
  reactivate_lapsed: { label: 'Reactivate lapsed customers', metric: 'reactivations', mechanismWeights: { complimentary_classes: 3, validity_extension: 2, discount_pct: 1.5 }, guard: 'The first purchase after a long gap should be small and finite so the decision is easy.' },
  increase_atv: { label: 'Increase average transaction value', metric: 'ATV', mechanismWeights: { private_sessions: 3, bundle_item: 2.5, tier_benefit: 1, discount_pct: 0.5 }, guard: 'Raise value by adding something worth paying for, not by reducing the price of the core product.' },
  longer_commitment: { label: 'Encourage longer commitments', metric: 'average commitment length', mechanismWeights: { validity_extension: 2.5, bonus_credits: 2.5, private_sessions: 1.5, tier_benefit: 1 }, guard: 'The monthly price of the longer term must stay clearly better than the shorter term, or the step-up will not happen.' },
  improve_frequency: { label: 'Improve class frequency', metric: 'visits per member per month', mechanismWeights: { bonus_credits: 3, validity_extension: 1, guest_passes: 1, bundle_item: 1 }, guard: 'Frequency responds to cadence and accountability; ensure the structure creates a reason to visit more often this month, not a longer window to visit the same amount.' },
  upsell_private_training: { label: 'Upsell private training', metric: 'private sessions sold', mechanismWeights: { private_sessions: 3.5, bonus_credits: 1.5, tier_benefit: 1 }, guard: 'Trainer capacity is the constraint — cap the number of sessions bundled so the studio can deliver them.' },
  introduce_formats: { label: 'Introduce new formats', metric: 'format trials', mechanismWeights: { complimentary_classes: 2.5, bundle_item: 2, guest_passes: 1.5 }, guard: 'Give a reason to try the format without discounting the format itself.' },
  drive_offpeak: { label: 'Drive off-peak attendance', metric: 'off-peak fill rate', mechanismWeights: { discount_pct: 2, bonus_credits: 1.5, bundle_item: 1.5 }, guard: 'Restrict to genuinely under-filled windows; check the utilisation map before committing capacity.' },
  encourage_referrals: { label: 'Encourage referrals', metric: 'referral-sourced sales', mechanismWeights: { guest_passes: 3, referral_credit: 2.5, bonus_credits: 1 }, guard: 'Pay referral value on the second purchase so the incentive rewards real customers, not free trials.' },
  reward_loyalty: { label: 'Reward loyalty', metric: 'repeat purchase rate', mechanismWeights: { tier_benefit: 3, private_sessions: 1.5, validity_extension: 1.5, guest_passes: 1 }, guard: 'Loyalty rewards should be visible and consistent; ad-hoc gifts train entitlement rather than loyalty.' },
  convert_after_trial: { label: 'Improve conversion after a trial', metric: 'trial → membership conversion', mechanismWeights: { complimentary_classes: 2.5, bonus_credits: 2, discount_amount: 1.5, bundle_item: 1 }, guard: 'Convert within the first days after the trial; the offer must have a real purchase deadline.' },
};

export const NAME_POOLS: Record<string, string[]> = {
  winback: ['Second Chapter', 'Encore', 'Comeback Ritual', 'Return to Form', 'The Reset', 'Reignite'],
  renewal: ['Continuity', 'Momentum', 'Momentum Plus', 'Steady Series', 'Long Line', 'The Keystone'],
  acquisition: ['First Barre', 'Introduction', 'The Opening', 'Newcomer Series', 'Signature Start', 'Foundation'],
  private: ['One to One', 'Atelier', 'Private Practice', 'Personal Method', 'Studio Confidential'],
  premium: ['Founders Circle', 'The Atelier', 'Signature Annual', 'Prime Membership', 'Reserve'],
  festive: ['Festive Season', 'Season Edition', 'Celebration Pack', 'Festive Ritual'],
  referral: ['Bring a Friend', 'Two Together', 'Duet', 'Circle of Two'],
  frequency: ['Thirty Day Method', 'Cadence', 'Twice Weekly', 'Rhythm Membership'],
  offpeak: ['Daylight Hours', 'Morning Method', 'Off-Peak Access', 'Quiet Hours'],
  loyalty: ['Recognition', 'Milestone', 'The Long Game', 'In Good Company'],
};

export const LOCATION_LABELS: Record<LocationId, string> = {
  'p57-blr-vmr': 'Physique 57 Bengaluru (Vittal Mallya Road)',
  'studio-cnc-indiranagar': 'Studio by Copper + Cloves, Indiranagar',
  'plash-pilates-sadashivnagar': 'Plash Pilates, Sadashivnagar',
  'virtual-online': 'Virtual / Online',
  'hosted-offsite': 'Hosted / off-site',
};

export const TAG_LIBRARY = [
  'no-cash-discount', 'value-add', 'urgency', 'first-purchase', 'referral', 'off-peak',
  'high-ticket', 'capacity-constrained', 'seasonal', 'test-idea', 'requires-trainer', 'renewal-window',
];

/** Natural-language prompt → structured intent. Deterministic keyword mapping, clearly labelled. */
export interface ParsedIntent {
  audience: AudienceSegment[];
  objectives: CommercialObjective[];
  constraints: {
    maxDiscountPct?: number;
    avoidDiscountOn?: string[];
    priceTarget?: number;
    preferValueAdd?: boolean;
    count: number;
    festive?: boolean;
    includePrivate?: boolean;
    locationHint?: LocationId;
  };
  matchedTerms: string[];
  unmatchedTerms: string[];
}

const SEGMENT_TERMS: [RegExp, AudienceSegment][] = [
  [/first[- ]time|new client|never (?:been|tried)|prospect|lead/i, 'first_time_customers'],
  [/active member|current member|existing member|members who (?:are|attend)/i, 'existing_active_members'],
  [/just expired|recently expired|expired (?:last|this)|lapsed \d+ days|about to expire|renewal/i, 'recently_expired_members'],
  [/lapsed|inactive|dormant|hasn'?t (?:visited|been|come)|not visited|three month|3 month|six month|6 month|win.?back/i, 'long_lapsed_members'],
  [/high[- ]value|vip|top (?:members|clients)|big spender|premium member/i, 'high_value_clients'],
  [/low frequency|once a week|twice a (?:week|month)|infrequent|not attending often/i, 'low_frequency_members'],
  [/trial|intro(?:ductory)? (?:class|customer)|tried (?:us|the studio)/i, 'previous_trial_customers'],
  [/referral|referred|friend|member.get.member|bring a friend/i, 'referral_customers'],
  [/corporate|company|employer|office|b2b/i, 'corporate_clients'],
  [/private|one.to.one|personal training|pt\b/i, 'private_training_clients'],
];

const OBJECTIVE_TERMS: [RegExp, CommercialObjective][] = [
  [/acquir|new member|new client|convert (?:leads|enquiries)|grow the base|fill the studio/i, 'acquire_new_members'],
  [/renew|renewal|continu|extend (?:their|the) membership/i, 'increase_renewals'],
  [/win.?back|reactivat|re-?engage|come back|re-?activate|dormant/i, 'reactivate_lapsed'],
  [/average (?:transaction|order)|atv|spend more|higher value|upsell|upgrade/i, 'increase_atv'],
  [/longer (?:term|commitment)|annual|12 month|six month|commitment/i, 'longer_commitment'],
  [/frequency|attend more|more classes|visits per|twice a week/i, 'improve_frequency'],
  [/private|one.to.one|pt\b|personal training/i, 'upsell_private_training'],
  [/new format|introduce|try .*(?:barre|mat|reformer|powercycle)|launch/i, 'introduce_formats'],
  [/off.?peak|morning|weekday|midday|quiet hours|fill (?:the|our) (?:quiet|off)/i, 'drive_offpeak'],
  [/referral|refer a friend|member.get.member|bring a friend/i, 'encourage_referrals'],
  [/loyal|reward|thank|appreciat|milestone/i, 'reward_loyalty'],
  [/after (?:a |the )?trial|trial (?:to|into)|didn'?t (?:buy|convert) after/i, 'convert_after_trial'],
];

export function parseIntent(prompt: string): ParsedIntent {
  const text = prompt || '';
  const matched: string[] = [];
  const matchedTerms: string[] = [];
  const unmatched: string[] = [];

  const audience: AudienceSegment[] = [];
  for (const [re, seg] of SEGMENT_TERMS) {
    const m = text.match(re);
    if (m) { audience.push(seg); matchedTerms.push(m[0]); }
  }
  const objectives: CommercialObjective[] = [];
  for (const [re, obj] of OBJECTIVE_TERMS) {
    const m = text.match(re);
    if (m) { objectives.push(obj); matchedTerms.push(m[0]); }
  }

  const constraints: ParsedIntent['constraints'] = { count: 3 };
  const countMatch = text.match(/\b(one|two|three|four|five|1|2|3|4|5)\b\s*(?:offers?|options?|ideas?|packages?|alternatives?)/i);
  if (countMatch) {
    const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    constraints.count = map[countMatch[1].toLowerCase()] ?? parseInt(countMatch[1], 10) ?? 3;
  }
  const pct = text.match(/(\d{1,2})\s*%/);
  if (pct) constraints.maxDiscountPct = parseInt(pct[1], 10);
  if (/without (?:heavily )?discount|no discount|avoid discount|don'?t discount|hold price|protect (?:price|revenue)/i.test(text)) {
    constraints.preferValueAdd = true;
    constraints.maxDiscountPct = Math.min(constraints.maxDiscountPct ?? 100, 10);
    matchedTerms.push('discount restraint');
  }
  const price = text.match(/(?:around|about|near|at|approx(?:imately)?)\s*₹?\s*([\d,]{4,9})/i) || text.match(/₹\s*([\d,]{4,9})/);
  if (price) constraints.priceTarget = parseInt(price[1].replace(/,/g, ''), 10);
  if (/diwali|festive|christmas|new year|navratri|pongal|onam|eid/i.test(text)) { constraints.festive = true; matchedTerms.push('festive framing'); }
  if (/private|one.to.one|personal training/i.test(text)) constraints.includePrivate = true;
  if (/copper|indiranagar/i.test(text)) constraints.locationHint = 'studio-cnc-indiranagar';
  else if (/plash|sadashiv/i.test(text)) constraints.locationHint = 'plash-pilates-sadashivnagar';
  else if (/bengaluru|vittal mallya|main studio|kenkere/i.test(text)) constraints.locationHint = 'p57-blr-vmr';

  // Anything we could not map is reported back rather than silently ignored.
  const informative = text.split(/[.;\n]/).map(s => s.trim()).filter(s => s.length > 12);
  for (const sentence of informative) {
    const covered = matchedTerms.some(t => sentence.toLowerCase().includes(t.toLowerCase()));
    if (!covered) unmatched.push(sentence);
  }

  const festiveObjectives = text.match(/festive|diwali|celebration/i) ? ['increase_atv' as CommercialObjective] : [];
  return {
    audience: audience.length ? Array.from(new Set(audience)) : ['existing_active_members'],
    objectives: Array.from(new Set(objectives.length ? [...objectives, ...festiveObjectives] : ['increase_renewals'])),
    constraints,
    matchedTerms,
    unmatchedTerms: unmatched.slice(0, 4),
  };
}
