/**
 * Display formatting. Kept dependency-free so it can be used on the server and in the browser.
 * The platform's "today" is pinned to the seeded demo date so relative labels stay stable.
 */
import type { AudienceSegment, CommercialObjective, LocationId, OfferStatus, ProductStatus } from './types';

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN');

export function inr(value: number | null | undefined, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (opts.compact) return inrCompact(value);
  if (opts.decimals) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR',
      minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals,
    }).format(value);
  }
  return inrFmt.format(Math.round(value));
}

export function inrCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return inrFmt.format(Math.round(value));
}

export function num(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return numFmt.format(value);
}

export function pct(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return `${rounded}%`;
}

export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value.length <= 10 ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dateTimeLabel(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
}

export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const diff = now.getTime() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function daysUntil(value: string | null | undefined, from: Date = new Date()): number | null {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000);
}

export function durationLabel(days: number | null | undefined): string {
  if (days == null) return '—';
  if (days % 365 === 0 && days >= 365) return `${days / 365} year${days / 365 > 1 ? 's' : ''}`;
  if (days % 30 === 0 && days >= 60) return `${days / 30} months`;
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return `${days} days`;
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------- labels

export const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  published: 'Published',
  expired: 'Expired',
  archived: 'Archived',
};

export const STATUS_TONES: Record<OfferStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'outline' | 'clay'> = {
  draft: 'outline',
  in_review: 'info',
  changes_requested: 'warning',
  approved: 'success',
  published: 'clay',
  expired: 'neutral',
  archived: 'neutral',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: 'Active',
  review: 'Needs review',
  historical: 'Historical',
  archived: 'Not retail',
};

export const AUDIENCE_LABELS: Record<AudienceSegment, string> = {
  first_time_customers: 'First-time customers',
  existing_active_members: 'Existing active members',
  recently_expired_members: 'Recently expired members',
  long_lapsed_members: 'Long-lapsed members',
  high_value_clients: 'High-value clients',
  low_frequency_members: 'Low-frequency members',
  previous_trial_customers: 'Previous trial customers',
  referral_customers: 'Referral customers',
  corporate_clients: 'Corporate clients',
  private_training_clients: 'Private training clients',
  custom: 'Custom audience',
};

export const OBJECTIVE_LABELS: Record<CommercialObjective, string> = {
  acquire_new_members: 'Acquire new members',
  increase_renewals: 'Increase renewals',
  reactivate_lapsed: 'Reactivate lapsed customers',
  increase_atv: 'Increase average transaction value',
  longer_commitment: 'Encourage longer commitments',
  improve_frequency: 'Improve class frequency',
  upsell_private_training: 'Upsell private training',
  introduce_formats: 'Introduce new formats',
  drive_offpeak: 'Drive off-peak attendance',
  encourage_referrals: 'Encourage referrals',
  reward_loyalty: 'Reward loyalty',
  convert_after_trial: 'Improve conversion after a trial',
};

export const LOCATION_LABELS: Record<LocationId, string> = {
  'p57-blr-vmr': 'Physique 57 Bengaluru (Vittal Mallya Road)',
  'studio-cnc-indiranagar': 'Studio by Copper + Cloves, Indiranagar',
  'plash-pilates-sadashivnagar': 'Plash Pilates, Sadashivnagar',
  'virtual-online': 'Virtual / Online',
  'hosted-offsite': 'Hosted / off-site',
};

export const LOCATION_SHORT: Record<LocationId, string> = {
  'p57-blr-vmr': 'Kenkere House',
  'studio-cnc-indiranagar': 'Copper + Cloves',
  'plash-pilates-sadashivnagar': 'Plash Pilates',
  'virtual-online': 'Virtual',
  'hosted-offsite': 'Off-site',
};

export const FEATURE_LABELS = {
  'cap:reapproval': 'Reapproval on commercial change',
  'cap:guardrails': 'Guardrail override',
} as const;

export function audienceLabel(id: string): string {
  return AUDIENCE_LABELS[id as AudienceSegment] ?? titleCase(id);
}

export function objectiveLabel(id: string): string {
  return OBJECTIVE_LABELS[id as CommercialObjective] ?? titleCase(id);
}

export function locationLabel(id: string): string {
  return LOCATION_LABELS[id as LocationId] ?? id;
}

export function locationShort(id: string): string {
  return LOCATION_SHORT[id as LocationId] ?? id;
}

export function labelsFor<T extends string>(map: Record<string, string>, ids: T[] | null | undefined, fallback = 'Not set', joiner = ' · '): string {
  if (!ids || ids.length === 0) return fallback;
  return ids.map(id => map[id] ?? id).join(joiner);
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
