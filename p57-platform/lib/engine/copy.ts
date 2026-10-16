/**
 * Commercial copy generation: premium offer naming, promotional messaging and sales scripts.
 * Deterministic templates that always state the offer's real numbers — never invented claims.
 */
import type { AudienceSegment, CommercialObjective, Offer } from '@/lib/types';
import type { ResolvedEconomics } from './pricing';
import { formatINR } from './pricing';
import { NAME_POOLS } from './templates';

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export type AngleKey = 'access' | 'experience' | 'term' | 'frequency' | 'price' | 'social' | 'capacity' | 'bundle';

export const ANGLES: { key: AngleKey; label: string; thesis: string }[] = [
  { key: 'access', label: 'Access-led', thesis: 'Give more of the same thing rather than a lower price.' },
  { key: 'experience', label: 'Experience-led', thesis: 'Raise the service level; nothing about it reads as a sale.' },
  { key: 'term', label: 'Term-led', thesis: 'Trade commitment for value; lengthen the relationship.' },
  { key: 'frequency', label: 'Frequency-led', thesis: 'Change cadence and accountability, not price.' },
  { key: 'price', label: 'Price-led', thesis: 'A direct price reduction — the clearest but most dilutive lever.' },
  { key: 'social', label: 'Social-led', thesis: 'Use access for a friend as the reward.' },
  { key: 'capacity', label: 'Capacity-led', thesis: 'Sell under-used windows at a better rate.' },
  { key: 'bundle', label: 'Bundle-led', thesis: 'Combine products so the total is worth more than the parts.' },
];

export function anglePoolForObjectives(objectives: CommercialObjective[], audience: AudienceSegment[]): AngleKey[] {
  const pool: AngleKey[] = [];
  const add = (k: AngleKey) => { if (!pool.includes(k)) pool.push(k); };
  for (const o of objectives) {
    switch (o) {
      case 'reactivate_lapsed': add('access'); add('price'); add('capacity'); add('frequency'); break;
      case 'increase_renewals': add('access'); add('term'); add('experience'); add('social'); break;
      case 'acquire_new_members': add('price'); add('bundle'); add('capacity'); add('access'); break;
      case 'convert_after_trial': add('bundle'); add('access'); add('price'); add('frequency'); break;
      case 'increase_atv': add('bundle'); add('experience'); add('term'); break;
      case 'longer_commitment': add('term'); add('access'); add('experience'); break;
      case 'improve_frequency': add('frequency'); add('access'); add('social'); break;
      case 'upsell_private_training': add('experience'); add('bundle'); add('term'); break;
      case 'introduce_formats': add('bundle'); add('frequency'); add('price'); break;
      case 'drive_offpeak': add('capacity'); add('price'); add('frequency'); break;
      case 'encourage_referrals': add('social'); add('bundle'); break;
      case 'reward_loyalty': add('experience'); add('access'); add('term'); break;
    }
  }
  if (audience.includes('first_time_customers')) add('price');
  if (audience.includes('high_value_clients')) add('experience');
  if (audience.includes('long_lapsed_members')) add('access');
  if (!pool.length) pool.push('access', 'price', 'experience', 'term', 'bundle', 'frequency', 'social', 'capacity');
  return pool;
}

export interface SuggestedName { name: string; rationale: string }

export function suggestOfferNames(args: {
  angle: AngleKey; audience: AudienceSegment[]; objectives: CommercialObjective[]; baseName?: string | null; seed?: number;
}): SuggestedName[] {
  const { angle, audience, objectives } = args;
  const seed = args.seed ?? 7;
  const key =
    objectives.includes('reactivate_lapsed') ? 'winback'
      : objectives.includes('increase_renewals') ? 'renewal'
      : objectives.includes('encourage_referrals') ? 'referral'
      : objectives.includes('drive_offpeak') ? 'offpeak'
      : objectives.includes('reward_loyalty') ? 'loyalty'
      : objectives.includes('improve_frequency') ? 'frequency'
      : angle === 'experience' || audience.includes('high_value_clients') ? 'premium'
      : angle === 'capacity' ? 'offpeak'
      : angle === 'bundle' && audience.includes('private_training_clients') ? 'private'
      : 'acquisition';
  const pool = NAME_POOLS[key] ?? NAME_POOLS.acquisition;
  const rotate = <T,>(arr: T[], n: number) => [...arr.slice(n % arr.length), ...arr.slice(0, n % arr.length)];
  const ordered = rotate(pool, seed);
  const prefixPool = key === 'premium' ? ['Physique 57', 'Signature', 'The'] : key === 'winback' ? ['The', 'Return', 'Studio'] : ['Physique 57', 'The', 'Studio'];
  const out: SuggestedName[] = [];
  for (let i = 0; i < Math.min(6, ordered.length); i++) {
    const style = i % 3;
    const name = style === 0
      ? ordered[i]
      : style === 1
        ? `${pick(prefixPool, seed + i)} ${ordered[i]}`
        : `${ordered[i]} — ${pick(['Barre', 'Studio', 'Method', 'Membership'], seed + i * 3)}`;
    out.push({
      name: name.replace(/\s+/g, ' ').trim(),
      rationale: style === 0
        ? 'Short, ownable and reads as a programme rather than a promotion.'
        : style === 1
          ? 'Carries the studio name so it still feels premium on a price list.'
          : 'Descriptive tail keeps the proposition obvious at the front desk.',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sales & marketing messaging
// ---------------------------------------------------------------------------

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

export interface CopyInput {
  name: string;
  description?: string;
  locationLabel: string;
  economics: ResolvedEconomics;
  audienceSegments: AudienceSegment[];
  objectives?: CommercialObjective[];
  deadlines?: { purchaseDeadline?: string | null; redeemableTo?: string | null };
  freezeAllowance?: number | null;
  baseProductName?: string | null;
  audienceLabels?: string[];
}

export function generateMessages(input: CopyInput): MessageBundle {
  const { economics: e } = input;
  const price = e.sellingPrice != null ? formatINR(e.sellingPrice) : 'price on request';
  const credits = (e.includedCredits ?? 0) + e.bonusCredits + e.complimentaryClasses;
  const validity = e.validityDays ? `${e.validityDays} days` : null;
  const deadline = input.deadlines?.purchaseDeadline ? `Offer closes ${input.deadlines.purchaseDeadline}.` : null;
  const savings = e.customerSavings ? `${formatINR(e.customerSavings)} of value` : null;
  const facts: string[] = [];
  if (e.sellingPrice != null) facts.push(`Price ${price}`);
  if (e.listPrice != null) facts.push(`Reference product price ${formatINR(e.listPrice)}`);
  if (credits) facts.push(`${credits} classes in total`);
  if (e.privateSessions) facts.push(`${e.privateSessions} private session(s)`);
  if (e.guestPasses) facts.push(`${e.guestPasses} guest pass(es)`);
  if (validity) facts.push(`Valid ${validity}`);
  if (e.discountPct) facts.push(`Discount ${e.discountPct.toFixed(1)}%`);

  const what = [
    credits ? `${credits} classes` : e.unlimitedAccess ? 'unlimited studio access' : null,
    e.privateSessions ? `${e.privateSessions} private session${e.privateSessions > 1 ? 's' : ''}` : null,
    e.guestPasses ? `${e.guestPasses} guest pass${e.guestPasses > 1 ? 'es' : ''}` : null,
    validity ? `validity of ${validity}` : null,
  ].filter(Boolean).join(', ');

  const freeze = input.freezeAllowance != null ? freezeLine(e, input.freezeAllowance) : null;
  const audienceWord = input.audienceSegments.includes('long_lapsed_members') ? 'we have not seen you in a while'
    : input.audienceSegments.includes('recently_expired_members') ? 'your membership has just come to a close'
    : input.audienceSegments.includes('first_time_customers') ? 'this is the easiest way to begin'
    : input.audienceSegments.includes('high_value_clients') ? 'this is made for the way you already train'
    : 'this is for you';

  return {
    headline: e.customerSavingsPct && e.customerSavingsPct > 8 ? `${input.name}: ${savings} more in every visit` : `${input.name} at ${input.locationLabel}`,
    whatsappShort:
`${input.name} — ${input.locationLabel}

${what ? `${what}, at ${price}.` : `At ${price}.`}${deadline ? ` ${deadline}` : ''}

Reply here and we will hold a place for you.`,
    whatsappDetailed:
`${input.name}
${input.locationLabel}

Some context: ${audienceWord}, and this is built around it.

What you receive
• ${what || 'Studio access'}
${e.privateSessions ? `• One-to-one coaching time built in\n` : ''}${e.guestPasses ? `• Bring someone along — no charge for them\n` : ''}• Full access to the studio timetable within your validity

The detail
• ${price}${e.listPrice && e.listPrice !== e.sellingPrice ? `, against the standard ${formatINR(e.listPrice)}` : ''}
${credits ? `• ${credits} classes to use\n` : ''}${validity ? `• Your window: ${validity}\n` : ''}${freeze ? `• ${freeze}\n` : ''}${deadline ? `• ${deadline}\n` : ''}
${input.description || 'Booked in minutes through your member portal, or reply here and we will set it up for you.'}

Would you like me to reserve it?`,
    emailSubject: `${input.name} — ${input.locationLabel}`,
    emailBody:
`Hello,

${input.description || `${input.name} is now open at ${input.locationLabel}.`}

Inside the offer
${what ? `· ${what}` : '· Studio access'}
· Price: ${price}${e.listPrice && e.listPrice !== e.sellingPrice ? ` (standard ${formatINR(e.listPrice)})` : ''}
${validity ? `· Validity: ${validity}\n` : ''}${deadline ? `· ${deadline}\n` : ''}
Classes are limited by design so the room stays a room, not a crowd.

You can add this to your membership in a few taps, or reply to this email and one of the team will take care of it.

Warmly,
${input.locationLabel}
Physique 57 India`,
    verbalScript:
`Open by naming the person's pattern, not the promotion.
"${input.audienceSegments.includes('long_lapsed_members') ? 'You used to be in twice a week — I checked, and the last class was a while ago.' : input.audienceSegments.includes('high_value_clients') ? 'You are one of our most consistent members, so I wanted you to hear this first.' : 'I have something I think fits your schedule.'}"

Then the proposition, in one breath:
"We are running ${input.name} — ${what || 'studio access'} for ${price}${e.discountPct ? `, which is ${e.discountPct.toFixed(1)}% off the standard price` : ''}. ${validity ? `It is valid for ${validity}.` : ''}"

Then the reason it is limited:
"${deadline ? deadline : 'It runs as a short window rather than a permanent price change.'}"

Then stop and ask:
"Shall I hold one for you?"`,
    campaignDescription: `${input.name} is a ${validity ? `${validity} ` : ''}${e.discountPct && e.discountPct > 0 ? `${e.discountPct.toFixed(1)}%-discount` : 'value-add'} proposition for ${input.audienceLabels?.join(', ') || 'a defined audience'} at ${input.locationLabel}${credits ? `, giving ${credits} classes` : ''}. Priced at ${price}${e.listPrice && e.listPrice !== e.sellingPrice ? ` against a standard ${formatINR(e.listPrice)}` : ''}.`,
    socialCaption: `${input.name}. ${what ? `${what[0].toUpperCase()}${what.slice(1)}` : 'Studio access'} at ${input.locationLabel}${deadline ? ` — closes ${input.deadlines?.purchaseDeadline}` : ''}.`,
    factsUsed: facts,
  };
}

/** Small helper so copy can mention freeze terms when the base product has them. */
export function freezeLine(e: ResolvedEconomics, freezeAllowance?: number | null): string | null {
  if (freezeAllowance == null) return null;
  return freezeAllowance === 0
    ? 'This pack cannot be frozen or extended'
    : `${freezeAllowance} freeze${freezeAllowance > 1 ? 's' : ''} available on request`;
}

export function offerOneLiner(offer: Pick<Offer, 'name'>, e: ResolvedEconomics): string {
  const bits = [
    e.sellingPrice != null ? formatINR(e.sellingPrice) : null,
    e.discountPct ? `${e.discountPct.toFixed(0)}% off` : null,
    e.bonusCredits + e.complimentaryClasses ? `+${e.bonusCredits + e.complimentaryClasses} classes` : null,
    e.privateSessions ? `${e.privateSessions} private` : null,
    e.validityDays ? `${e.validityDays}d` : null,
  ].filter(Boolean);
  return `${offer.name} — ${bits.join(' · ')}`;
}
