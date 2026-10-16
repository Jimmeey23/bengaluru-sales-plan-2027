'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Tabs, cn, useToast,
} from '@/components/ui';
import {
  CategoryMix, DiscountCodeChart, FunnelBars, ProductBar, RevenueTrend, UtilisationHeatmap,
} from '@/components/charts';
import { MetricsFootnote } from '@/components/financials';
import { inr, inrCompact, num, pct, relativeTime } from '@/lib/format';

interface AnalyticsProps {
  evidence: { sales: any; funnel: any; customerBase: any; capacity: any };
  catalogueStats: any;
  offerStats: any;
  generations: any[];
  imports: any[];
  offers: any[];
}

const AS_OF_LABEL = '16 October 2026';

export function AnalyticsView({ evidence, catalogueStats, offerStats, generations, imports, offers }: AnalyticsProps) {
  const [tab, setTab] = useState<'revenue' | 'audience' | 'operations' | 'offers'>('revenue');
  const { push } = useToast();

  const sales = evidence.sales ?? {};
  const funnel = evidence.funnel ?? {};
  const base = evidence.customerBase ?? {};
  const capacity = evidence.capacity ?? {};

  const monthly = sales.monthly ?? [];
  const products = sales.products ?? [];
  const codes = sales.discountCodes ?? [];
  const categories = (sales.categoryMix ?? []).map((c: any) => ({ name: c.category ?? c.name, value: c.revenue ?? c.value }));
  const centers = funnel.byCenter ?? funnel.centers ?? [];

  const totals = {
    revenue: sales.totals?.revenue ?? monthly.reduce((s: number, m: any) => s + (m.revenue ?? 0), 0),
    lines: sales.totals?.lines ?? monthly.reduce((s: number, m: any) => s + (m.lines ?? 0), 0),
    discount: sales.totals?.discount ?? codes.reduce((s: number, c: any) => s + (c.discountGiven ?? 0), 0),
  };

  const last12 = monthly.slice(-12);
  const prev12 = monthly.slice(-24, -12);
  const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const growth = prev12.length ? ((sum(last12) - sum(prev12)) / sum(prev12)) * 100 : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Evidence layer</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Analytics</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Everything here is derived from your own exports — the Bengaluru membership catalogue, sales transactions, lead
            funnel, member base and class capacity. Nothing on this page is generated or estimated: where a figure is a proxy,
            it says so.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline">Source: Momence exports, as at {AS_OF_LABEL}</Badge>
          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(window.location.href); push({ title: 'Link copied' }); }}>Share view</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Observed revenue" value={inrCompact(totals.revenue)} hint={`${num(totals.lines)} sales lines`} />
        <Kpi label="Observed discount given" value={inrCompact(totals.discount)} hint={`${pct((totals.discount / (totals.revenue || 1)) * 100)} of revenue`} />
        <Kpi label="Last 12 months vs prior 12" value={growth == null ? '—' : `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`} hint={growth == null ? 'Insufficient history' : `${inrCompact(sum(last12))} vs ${inrCompact(sum(prev12))}`} />
        <Kpi label="Catalogue records" value={num(catalogueStats.total)} hint={`${catalogueStats.sellable} sellable · ${catalogueStats.unlimited} unlimited · ${catalogueStats.review} flagged for review`} />
      </div>

      <Tabs
        tabs={[{ key: 'revenue', label: 'Revenue & products' }, { key: 'audience', label: 'Audience & funnel' }, { key: 'operations', label: 'Operations' }, { key: 'offers', label: 'Offer performance learning' }]}
        value={tab} onChange={k => setTab(k as any)}
      />

      {tab === 'revenue' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Revenue by month" subtitle="Observed sales lines across all locations in the export" action={<Badge tone="outline">{monthly.length} months</Badge>} />
            <div className="p-3"><RevenueTrend data={monthly} height={260} /></div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top products by revenue" subtitle="Historical sales — not current availability" />
              <div className="p-3"><ProductBar data={products.slice(0, 10).map((p: any) => ({ name: p.name, revenue: p.revenue, units: p.units }))} height={300} /></div>
            </Card>
            <Card>
              <CardHeader title="Category mix" subtitle="How the business actually earns, by catalogue category" />
              <div className="p-3"><CategoryMix data={categories} height={300} /></div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Discount codes used" subtitle="Observed usage and value given away per code" />
            <div className="p-3"><DiscountCodeChart data={codes.slice(0, 12)} height={280} /></div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead>
                  <tr className="text-2xs uppercase tracking-[0.08em] text-muted">
                    <th className="px-4 py-2 text-left">Code</th>
                    <th className="px-4 py-2 text-right">Uses</th>
                    <th className="px-4 py-2 text-right">Revenue influenced</th>
                    <th className="px-4 py-2 text-right">Discount given</th>
                    <th className="px-4 py-2 text-right">Effective discount</th>
                    <th className="px-4 py-2 text-left">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.slice(0, 15).map((c: any) => (
                    <tr key={c.code} className="border-t border-line">
                      <td className="px-4 py-2 font-medium text-ink">{c.code}</td>
                      <td className="px-4 py-2 text-right num">{num(c.uses ?? c.count)}</td>
                      <td className="px-4 py-2 text-right num">{inr(c.revenue)}</td>
                      <td className="px-4 py-2 text-right num">{inr(c.discountGiven)}</td>
                      <td className="px-4 py-2 text-right num">
                        {c.discountPct ?? (c.revenue + (c.discountGiven ?? 0) > 0 ? ((c.discountGiven ?? 0) / (c.revenue + (c.discountGiven ?? 0))) * 100 : 0).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-muted">{c.lastSale ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'audience' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Members in member base" value={num(base.totals?.members ?? base.members ?? 0)} hint="Distinct member records, all locations" />
            <Kpi label="Lapsed members" value={num(base.totals?.lapsed ?? base.lapsed ?? 0)} hint="Median days since last visit shown below" />
            <Kpi label="Lead → trial" value={funnel.stages ? pct(funnel.stages[1]?.rate ?? 0) : '—'} hint="Observed in the lead funnel export" />
            <Kpi label="Trial → member" value={funnel.stages ? pct(funnel.stages[2]?.rate ?? 0) : '—'} hint="Observed, not a target" />
          </div>

          <Card>
            <CardHeader title="Lead funnel by studio" subtitle="Leads → first visit → converted membership, as observed" />
            <div className="p-3">
              {centers.length ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {centers.map((c: any) => (
                    <div key={c.center ?? c.name} className="rounded-xl border border-line p-3">
                      <p className="text-[12.5px] font-medium text-ink">{c.center ?? c.name}</p>
                      <div className="mt-2.5">
                        <FunnelBars data={[
                          { label: 'Leads captured', value: c.leads, colour: '#BDB6AA' },
                          { label: 'Trials started', value: c.trials, colour: '#1F6F6B' },
                          { label: 'Converted to membership', value: c.converted, colour: '#B4533A' },
                        ]} />
                      </div>
                      {c.trialToMemberPct != null && (
                        <p className="mt-2 text-2xs text-muted">Trial → member {pct(c.trialToMemberPct)} · observed, all offers combined</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : <p className="p-3 text-[12.5px] text-muted">Funnel export not available.</p>}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Member base composition" subtitle="Status as recorded in the membership export" />
              <div className="p-3"><ProductBar data={(base.segments ?? base.byStatus ?? []).map((s: any) => ({ name: s.label ?? s.status ?? s.name, value: s.count ?? s.members }))} height={260} /></div>
            </Card>
            <Card>
              <CardHeader title="Engagement profile" subtitle="Sessions per month and recency, from the member base" />
              <div className="space-y-2 p-3 text-[12.5px] text-ink-700 dark:text-ink-200">
                {(base.profile ?? []).map((p: any) => (
                  <div key={p.label} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                    <span className="text-muted">{p.label}</span>
                    <span className="num text-ink">{p.value}</span>
                  </div>
                ))}
                {!(base.profile ?? []).length && <p className="text-muted">No engagement aggregates available.</p>}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Lapsed members by product" subtitle="What lapsed members originally bought — the strongest reactivation signal you have" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-[12px]">
                <thead>
                  <tr className="text-2xs uppercase tracking-[0.08em] text-muted">
                    <th className="px-4 py-2 text-left">Membership</th>
                    <th className="px-4 py-2 text-right">Lapsed members</th>
                    <th className="px-4 py-2 text-right">Average paid</th>
                    <th className="px-4 py-2 text-right">Median sessions / month</th>
                  </tr>
                </thead>
                <tbody>
                  {(base.lapsedByProduct ?? []).slice(0, 12).map((r: any) => (
                    <tr key={r.name} className="border-t border-line">
                      <td className="px-4 py-2 text-ink">{r.name}</td>
                      <td className="px-4 py-2 text-right num">{num(r.count)}</td>
                      <td className="px-4 py-2 text-right num">{inr(r.avgPaid)}</td>
                      <td className="px-4 py-2 text-right num">{r.medianSessionsPerMonth ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'operations' && (
        <div className="space-y-4">
          <Alert tone="info" title="What this section tells you">
            Class capacity and fill by weekday and time band — the practical input for off-peak offers. These aggregates cover the
            whole export horizon, so read them as structural patterns rather than this week&rsquo;s occupancy.
          </Alert>
          <Card>
            <CardHeader title="Capacity utilisation heatmap" subtitle="Share of places taken, by weekday and time band" />
            <div className="p-3">
              {capacity.rows?.length ? <UtilisationHeatmap rows={capacity.rows} /> : <EmptyState title="Capacity export not available" description="Add the capacity export to see off-peak patterns here." />}
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Quietest bands" subtitle="Lowest observed utilisation" />
              <div className="space-y-1.5 p-3 text-[12.5px]">
                {(capacity.quietest ?? []).map((r: any) => (
                  <div key={`${r.weekday}-${r.band}`} className="flex items-center justify-between border-b border-line pb-1.5 last:border-0">
                    <span className="text-muted">{r.weekday} · {r.band}</span>
                    <span className="num text-ink">{pct(r.utilisation ?? r.utilisationPct ?? 0)}</span>
                  </div>
                ))}
                {!(capacity.quietest ?? []).length && <p className="text-muted">No capacity rows.</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Busiest bands" subtitle="Where offers would compete with full classes" />
              <div className="space-y-1.5 p-3 text-[12.5px]">
                {(capacity.busiest ?? []).map((r: any) => (
                  <div key={`${r.weekday}-${r.band}`} className="flex items-center justify-between border-b border-line pb-1.5 last:border-0">
                    <span className="text-muted">{r.weekday} · {r.band}</span>
                    <span className="num text-ink">{pct(r.utilisation ?? r.utilisationPct ?? 0)}</span>
                  </div>
                ))}
                {!(capacity.busiest ?? []).length && <p className="text-muted">No capacity rows.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-4">
          <Alert tone="warning" title="Read this before interpreting anything below">
            The offers in this workspace are concepts and plans. They have not been run in market, so no observed redemption,
            conversion or revenue figures exist for them. The panels below are catalogue-based analysis: what the offer is worth
            to a member and what it does to price, computed from your own catalogue — explicitly <em>not</em> a prediction of how
            it will sell.
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Offers in workspace" value={num(offerStats.total)} hint={`${offerStats.byStatus?.draft ?? 0} draft · ${offerStats.byStatus?.published ?? 0} published`} />
            <Kpi label="Average discount" value={offerStats.avgDiscountPct == null ? '—' : pct(offerStats.avgDiscountPct)} hint="Across offers carrying a cash discount" />
            <Kpi label="Average member saving" value={offerStats.avgSavingsPct == null ? '—' : pct(offerStats.avgSavingsPct)} hint="Versus buying the same access piecemeal" />
            <Kpi label="Unit-revenue proxy" value={offerStats.estimatedRevenueOpportunity == null ? '—' : inrCompact(offerStats.estimatedRevenueOpportunity)} hint="One sale per campaign-linked offer — a proxy, not a forecast" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Where offer value comes from" subtitle="Composition of the workspace's offers" />
              <div className="p-3">
                <ul className="space-y-2">
                  {[
                    { label: 'Cash discount', n: offers.filter(o => (o.metricsSnapshot?.discountPct ?? 0) > 0).length },
                    { label: 'Extra credits', n: offers.filter(o => (o.metricsSnapshot?.bonusCredits ?? 0) > 0).length },
                    { label: 'Extra validity', n: offers.filter(o => (o.metricsSnapshot?.validityDeltaDays ?? 0) > 0).length },
                    { label: 'Private sessions', n: offers.filter(o => (o.metricsSnapshot?.privateSessions ?? 0) > 0).length },
                    { label: 'Guest passes', n: offers.filter(o => (o.metricsSnapshot?.guestPasses ?? 0) > 0).length },
                    { label: 'Complimentary classes', n: offers.filter(o => (o.metricsSnapshot?.complimentaryClasses ?? 0) > 0).length },
                  ].map(row => {
                    const share = offerStats.total ? (row.n / offerStats.total) * 100 : 0;
                    return (
                      <li key={row.label}>
                        <div className="flex items-baseline justify-between text-[12.5px]">
                          <span className="text-muted">{row.label}</span>
                          <span className="num text-ink">{row.n} <span className="text-2xs text-muted">of {offerStats.total}</span></span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                          <div className="h-full rounded-full bg-teal-600/70" style={{ width: `${share}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
            <Card>
              <CardHeader title="Audience spread" subtitle="Which segments the workspace is currently aimed at" />
              <div className="p-3"><ProductBar data={Object.entries(offerStats.byAudience ?? {}).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v as number }))} height={240} /></div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Guardrail pressure" subtitle="Offers whose composition pushes against your configured limits" />
            <div className="divide-y divide-line">
              {offers.filter(o => (o.metricsSnapshot?.guardrails ?? []).some((g: any) => !g.passed)).slice(0, 12).map(o => {
                const failed = (o.metricsSnapshot?.guardrails ?? []).filter((g: any) => !g.passed);
                return (
                  <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Link href={`/offers/${o.id}`} className="min-w-0 flex-1 truncate text-[12.5px] text-ink hover:text-clay-600 dark:hover:text-clay-400">{o.name}</Link>
                    <Badge tone={failed.some((f: any) => f.severity === 'blocker') ? 'danger' : 'warning'}>
                      {failed.length} finding{failed.length === 1 ? '' : 's'}
                    </Badge>
                    <span className="w-full text-2xs text-muted sm:w-auto">{failed[0]?.message}</span>
                  </div>
                );
              })}
              {offers.filter(o => (o.metricsSnapshot?.guardrails ?? []).some((g: any) => !g.passed)).length === 0 && (
                <EmptyState title="Every offer is within the configured limits" description="Guardrail findings appear here as soon as an offer's composition drifts past a limit you set in Settings." />
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="AI generation history" subtitle="Every generation attempt is logged with the provider that produced it" />
              <div className="divide-y divide-line">
                {generations.slice(0, 8).map(g => (
                  <div key={g.id} className="px-4 py-2.5">
                    <p className="text-[12.5px] text-ink">{g.outputSummary}</p>
                    <p className="mt-0.5 text-2xs text-muted">
                      {g.mode} · {g.provider} · {g.engineVersion}{g.fallbackReason ? ` · fell back: ${g.fallbackReason}` : ''} · {relativeTime(g.createdAt)}
                    </p>
                  </div>
                ))}
                {generations.length === 0 && <EmptyState title="No generations yet" description="Generate an offer to start building the history." />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Catalogue imports" subtitle="Each import is recorded with its per-row outcome" />
              <div className="divide-y divide-line">
                {imports.slice(0, 8).map(i => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{i.filename}</span>
                    <span className="num text-2xs text-muted">{i.inserted} new · {i.updated} updated · {i.flagged ?? 0} flagged</span>
                    <span className="text-2xs text-muted">{relativeTime(i.createdAt)}</span>
                  </div>
                ))}
                {imports.length === 0 && <EmptyState title="No imports recorded" description="Imports from the catalogue page appear here with their outcome." />}
              </div>
            </Card>
          </div>

          {offers[0]?.metricsSnapshot ? (
            <MetricsFootnote metrics={offers[0].metricsSnapshot} />
          ) : (
            <p className="text-2xs leading-relaxed text-muted">No offer has been priced yet, so there is no engine snapshot to reference.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="num mt-1.5 font-display text-[24px] leading-none tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-2xs leading-relaxed text-muted">{hint}</p>}
    </Card>
  );
}
