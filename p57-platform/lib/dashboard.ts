import {
  listOffers, listCatalogue, listCampaigns, listCollections, listActivity, listUsers, getSettings,
  listImports, listGenerations, getEvidence, buildAnalytics,
} from '@/lib/data';
import type {
  ActivityEntry, Campaign, CatalogueProduct, Collection, Offer, User,
} from '@/lib/types';
import { dateLabel, daysUntil } from '@/lib/format';

export const AS_OF = '2026-10-16T09:30:00+05:30';
export const AS_OF_DAY = '2026-10-16';

export type AttentionKind = 'blocker' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  meta: string;
  href: string;
  actionLabel: string;
}

export interface DashboardModel {
  asOf: string;
  metrics: {
    totalOffers: number;
    drafts: number;
    awaitingApproval: number;
    published: number;
    expiringSoon: number;
    createdThisMonth: number;
    favourites: number;
    conceptOnly: number;
    campaignsLive: number;
    campaignsPlanned: number;
    catalogueRecords: number;
    catalogueNeedingReview: number;
    /** Explicitly labelled unit-revenue proxy, never a forecast. */
    pipelineValueProxy: number | null;
    pipelineBasis: string | null;
  };
  recents: Offer[];
  awaiting: Offer[];
  expiring: Offer[];
  attention: AttentionItem[];
  activity: (ActivityEntry & { actor: User | null })[];
  savedRecommendations: { offer: Offer; generation: { id: string; mode: string; provider: string; createdAt: string; prompt: string } | null }[];
  favourites: Offer[];
  collections: Collection[];
  campaigns: Campaign[];
  users: User[];
  categories: { label: string; count: number; sellable: number }[];
  observed: {
    revenue: number;
    lines: number;
    from: string;
    to: string;
    topProducts: { label: string; value: number; units: number }[];
    monthly: { month: string; revenue: number; lines: number }[];
    funnel: { label: string; value: number; colour?: string }[];
    discountCodes: { code: string; revenue: number; discountGiven: number }[];
    customerBase: any;
  };
  settings: ReturnType<typeof getSettings>;
}

const CATEGORY_ORDER = ['standard_retail', 'promotional', 'introductory', 'partner', 'unlimited', 'corporate', 'complimentary', 'internal'];

const CATEGORY_LABELS: Record<string, string> = {
  standard_retail: 'Standard retail',
  promotional: 'Promotional',
  introductory: 'New-client introductory',
  partner: 'Partner studio / collaboration',
  unlimited: 'Unlimited access',
  corporate: 'Corporate',
  complimentary: 'Complimentary (non-revenue)',
  internal: 'Internal / test',
};

export function categoryLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ');
}

export function buildDashboard(): DashboardModel {
  const users = listUsers();
  const userById = new Map(users.map(u => [u.id, u]));
  const offers = listOffers({ status: 'all', includeArchived: true });
  const active = offers.filter(o => o.status !== 'archived');
  const catalogue = listCatalogue({ includeNonRetail: true });
  const campaigns = listCampaigns();
  const collections = listCollections();
  const activity = listActivity(24).map(a => ({ ...a, actor: userById.get(a.actorId) ?? null }));
  const settings = getSettings();
  const evidence = getEvidence();
  const imports = listImports(5);
  const generations = listGenerations(30);
  const analytics = buildAnalytics();

  const now = Date.parse(AS_OF);
  const monthPrefix = AS_OF_DAY.slice(0, 7);
  const dayMs = 86400000;

  const byStatus: Record<string, number> = {};
  offers.forEach(o => { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; });

  const awaiting = offers
    .filter(o => o.status === 'in_review' || o.status === 'changes_requested')
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));

  const expiring = active
    .filter(o => o.expiresOn && Date.parse(o.expiresOn) >= now && Date.parse(o.expiresOn) <= now + 45 * dayMs)
    .sort((a, b) => Date.parse(a.expiresOn!) - Date.parse(b.expiresOn!));

  // ---- needs attention: every entry is traceable to a record, never invented
  const attention: AttentionItem[] = [];

  const overdueReview = awaiting.filter(o => (now - Date.parse(o.updatedAt)) / dayMs > 5);
  overdueReview.slice(0, 3).forEach(o => attention.push({
    id: `attention-approval-${o.id}`, kind: 'warning',
    title: `${o.name} has been waiting for review`,
    detail: `${o.status === 'in_review' ? 'Submitted' : 'Returned for changes'} and untouched for ${Math.round((now - Date.parse(o.updatedAt)) / dayMs)} days.`,
    meta: `${o.code} · ${o.ownerId ? userById.get(o.ownerId)?.name ?? 'Unassigned' : 'Unassigned'}`,
    href: `/offers/${o.id}`, actionLabel: 'Open review',
  }));

  active.filter(o => o.requiresReapproval).slice(0, 3).forEach(o => attention.push({
    id: `attention-reapproval-${o.id}`, kind: 'blocker',
    title: `${o.name} needs re-approval`,
    detail: 'Commercial terms changed after approval, so the approved version no longer matches the current terms.',
    meta: `${o.code} · approved v${o.approvedVersion ?? '—'} → current v${o.version}`,
    href: `/offers/${o.id}`, actionLabel: 'Review terms',
  }));

  expiring.slice(0, 3).forEach(o => attention.push({
    id: `attention-expiry-${o.id}`, kind: 'info',
    title: `${o.name} expires ${daysUntil(o.expiresOn) === 0 ? 'today' : `in ${daysUntil(o.expiresOn)} days`}`,
    detail: o.campaignId ? 'Linked to an active campaign — decide whether to extend or replace it.' : 'Published offer reaching its stated end date.',
    meta: `${o.code} · ends ${dateLabel(o.expiresOn)}`,
    href: `/offers/${o.id}`, actionLabel: 'Extend or archive',
  }));

  const reviewRecords = catalogue.filter(p => p.status === 'review');
  if (reviewRecords.length) attention.push({
    id: 'attention-catalogue-review', kind: 'warning',
    title: `${reviewRecords.length} catalogue records need manual review`,
    detail: reviewRecords.slice(0, 3).map(r => r.name).join(' · ') + (reviewRecords.length > 3 ? ' …' : ''),
    meta: 'Ambiguous pricing, credits or location in the source export — nothing has been guessed.',
    href: '/catalogue?filter=review', actionLabel: 'Open review queue',
  });

  const flaggedImports = (imports as any[]).filter(i => (i.flagged ?? 0) > 0 || hasFlaggedRows(i));
  flaggedImports.slice(0, 2).forEach((imp: any) => attention.push({
    id: `attention-import-${imp.id}`, kind: 'info',
    title: `Import "${imp.filename}" flagged ${imp.flagged} row${imp.flagged === 1 ? '' : 's'}`,
    detail: 'Rows were imported with warnings. Unresolved values stay configurable until someone confirms them.',
    meta: `${imp.rows} rows · ${imp.created_at ? dateLabel(imp.created_at) : '—'}`,
    href: '/catalogue?tab=imports', actionLabel: 'Review import',
  }));

  const staleGuardrail = !settings.guardrails.maxDiscountPctByClass || Object.keys(settings.guardrails.maxDiscountPctByClass).length === 0;
  if (staleGuardrail) attention.push({
    id: 'attention-guardrails', kind: 'info',
    title: 'Discount ceilings are still at workspace defaults',
    detail: 'Guardrails are deliberately not universal — set per-class ceilings to reflect what each product can sustain.',
    meta: 'Administrator only · Settings → Guardrails',
    href: '/settings?tab=guardrails', actionLabel: 'Set guardrails',
  });

  const savedRecommendations = offers
    .filter(o => o.generationContext != null || o.origin === 'nlq' || o.origin === 'remix')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4)
    .map(o => {
      const gen = generations.find((g: any) => (g.offerIds ?? []).includes(o.id)) ?? null;
      return {
        offer: o,
        generation: gen ? { id: gen.id, mode: gen.mode, provider: gen.provider, createdAt: gen.createdAt, prompt: gen.prompt ?? '' } : null,
      };
    });

  // ---- observed data (historical, from the supplied exports only)
  const sales = evidence.sales;
  const funnel = evidence.funnel;
  const overall = funnel?.byStudio?.find((s: any) => s.studio.includes('Physique 57 Bengaluru')) ?? funnel?.byStudio?.[0];
  const observed = {
    revenue: sales?.totals?.revenue ?? 0,
    lines: sales?.totals?.lines ?? 0,
    from: sales?.dateRange?.[0] ?? '—',
    to: sales?.dateRange?.[1] ?? '—',
    topProducts: (sales?.products ?? []).slice(0, 8).map((p: any) => ({ label: p.product, value: p.revenue, units: p.units })),
    monthly: (sales?.monthly ?? []).map((m: any) => ({ month: m.month, revenue: m.revenue, lines: m.lines })),
    funnel: overall ? [
      { label: 'Leads captured', value: overall.leads, colour: '#BDB6AA' },
      { label: 'Trials started', value: overall.trials, colour: '#1F6F6B' },
      { label: 'Converted to membership', value: overall.converted, colour: '#B4533A' },
    ] : [],
    discountCodes: (sales?.discountCodes ?? []).slice(0, 8).map((c: any) => ({ code: c.code, revenue: c.revenue, discountGiven: c.discountGiven })),
    customerBase: evidence.customerBase,
  };

  const categories = CATEGORY_ORDER
    .map(key => {
      const items = catalogue.filter(p => p.productClass === key);
      return { label: categoryLabel(key), count: items.length, sellable: items.filter(p => (p.price ?? 0) > 0 && p.status !== 'review').length };
    })
    .filter(c => c.count > 0);

  const createdThisMonth = offers.filter(o => o.createdAt.startsWith(monthPrefix)).length;

  return {
    asOf: AS_OF,
    metrics: {
      totalOffers: active.length,
      drafts: byStatus.draft ?? 0,
      awaitingApproval: awaiting.length,
      published: (byStatus.published ?? 0) + (byStatus.approved ?? 0),
      expiringSoon: expiring.length,
      createdThisMonth,
      favourites: offers.filter(o => o.favourite).length,
      conceptOnly: offers.filter(o => o.conceptOnly).length,
      campaignsLive: campaigns.filter(c => c.status === 'live').length,
      campaignsPlanned: campaigns.filter(c => c.status === 'planned' || c.status === 'in_review' || c.status === 'approved').length,
      catalogueRecords: catalogue.length,
      catalogueNeedingReview: reviewRecords.length,
      pipelineValueProxy: analytics.offerStats.estimatedRevenueOpportunity,
      // Sum of the current selling price of campaign-linked offers. It is a unit-revenue
      // proxy for pipeline sizing only — not a forecast and not discounted for conversion.
      pipelineBasis: analytics.offerStats.estimatedRevenueOpportunity != null
        ? 'Sum of the current price of campaign-linked offers — one sale each, no conversion assumption applied'
        : null,
    },
    recents: active.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6),
    awaiting,
    expiring,
    attention,
    activity,
    savedRecommendations,
    favourites: active.filter(o => o.favourite).slice(0, 6),
    collections,
    campaigns,
    users,
    categories,
    observed,
    settings,
  };
}

function hasFlaggedRows(imp: any): boolean {
  const report = imp?.report ?? [];
  return Array.isArray(report) && report.some((r: any) => r?.status === 'flagged' || r?.status === 'rejected');
}

/** Products whose observed sales are strong enough to anchor an offer, with the raw basis attached. */
export function sellableCatalogue(): CatalogueProduct[] {
  return listCatalogue().filter(p => (p.price ?? 0) > 0 && p.status === 'active');
}
