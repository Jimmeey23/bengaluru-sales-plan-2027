import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { buildDashboard } from '@/lib/dashboard';
import { Badge, Card, CardHeader, EmptyState, StatTile } from '@/components/ui';
import { FunnelBars, RevenueTrend, ScoreRadial, TinySpark } from '@/components/charts';
import { dateLabel, inr, LOCATION_LABELS, num, pct, relativeTime, STATUS_LABELS, STATUS_TONES } from '@/lib/format';

export const dynamic = 'force-dynamic';

const QUICK_ACTIONS = [
  { href: '/generate?mode=guided', label: 'Generate an offer', hint: 'Guided builder', primary: true },
  { href: '/generate?mode=random', label: 'Surprise me', hint: 'Presets + sliders' },
  { href: '/generate?mode=existing', label: 'From a package', hint: 'Start in the catalogue' },
  { href: '/strategist', label: 'Ask the strategist', hint: 'Plain-English brief' },
  { href: '/compare', label: 'Compare & simulate', hint: 'Side-by-side economics' },
  { href: '/offers', label: 'Offer bank', hint: 'Collections, search, filters' },
];

export default async function CommandCentre() {
  const user = await currentUser();
  const d = buildDashboard();
  const m = d.metrics;
  const aiConnected = d.settings.ai.provider !== 'local_strategist' && d.settings.ai.keyConfigured;

  return (
    <div className="mx-auto max-w-[1320px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Bengaluru studios · {dateLabel(d.asOf)}</p>
          <h1 className="mt-1 font-display text-[30px] leading-tight tracking-tight text-ink">
            {user ? `Good morning, ${user.name.split(' ')[0]}` : 'Command centre'}
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-muted">
            Everything in flight, plus what is waiting on a decision. Figures marked <span className="text-ink">observed</span> come
            from your own exports; anything projected carries its assumption next to it.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge tone={aiConnected ? 'teal' : 'neutral'}>
            {aiConnected ? `${d.settings.ai.provider} · ${d.settings.ai.model}` : 'Local strategist engine — no external model connected'}
          </Badge>
          <p className="max-w-xs text-right text-2xs leading-relaxed text-muted">
            {aiConnected
              ? 'The model drafts language; the pricing engine still produces every number.'
              : 'Offer intelligence runs on the deterministic engine and your catalogue. Connect a model in Settings if you want richer phrasing.'}
          </p>
        </div>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {QUICK_ACTIONS.map(a => (
          <Link key={a.href} href={a.href}
            className={`group flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:shadow-lift ${
              a.primary ? 'border-clay-300 bg-clay-50/70 dark:border-clay-800 dark:bg-clay-950/40' : 'border-line surface'}`}>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{a.label}</span>
              <span className="block truncate text-2xs text-muted">{a.hint}</span>
            </span>
            <span className="text-muted transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Offers in workspace" value={num(m.totalOffers)} hint={`${m.conceptOnly} concept-only (never run)`} />
        <StatTile label="Drafts" value={num(m.drafts)} hint="Not yet submitted" />
        <StatTile label="Awaiting approval" value={num(m.awaitingApproval)} hint="Includes changes requested" tone={m.awaitingApproval ? 'warning' : 'default'} />
        <StatTile label="Approved & published" value={num(m.published)} hint="Live commercial terms" tone="teal" />
        <StatTile label="Expiring ≤ 45 days" value={num(m.expiringSoon)} hint="Decision window" tone={m.expiringSoon ? 'clay' : 'default'} />
        <StatTile label="Created this month" value={num(m.createdThisMonth)} hint="October 2026" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Observed revenue — Bengaluru studios"
              subtitle={`${d.observed.from} → ${d.observed.to} · ${num(d.observed.lines)} sales lines from the supplied payments export`}
              action={<Badge tone="teal">Observed</Badge>}
            />
            <div className="px-2 pt-2">
              <RevenueTrend data={d.observed.monthly} />
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-line px-4 py-3 sm:grid-cols-4">
              {[
                { label: 'Total revenue', value: inr(d.observed.revenue, { compact: true }) },
                { label: 'Sales lines', value: num(d.observed.lines) },
                { label: 'Members tracked', value: num(d.observed.customerBase?.uniqueMembers) },
                { label: 'Median visits / month', value: String(d.observed.customerBase?.behaviour?.avgSessionsPerMonth?.median ?? '—') },
              ].map(k => (
                <div key={k.label}>
                  <p className="text-2xs uppercase tracking-[0.08em] text-muted">{k.label}</p>
                  <p className="num mt-1 text-[15px] text-ink">{k.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="What the team is working on"
              subtitle="Most recently updated offers across every status"
              action={<Link href="/offers"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">Open offer bank →</span></Link>}
            />
            <div className="divide-y divide-line">
              {d.recents.length === 0 && (
                <EmptyState
                  title="No offers yet"
                  description="Start with the guided builder, or let the generator propose alternatives from the parsed catalogue."
                  action={<Link href="/generate"><span className="text-[13px] text-clay-600 hover:underline dark:text-clay-400">Generate the first offer</span></Link>}
                />
              )}
              {d.recents.map(o => (
                <Link key={o.id} href={`/offers/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13.5px] font-medium text-ink">{o.name}</p>
                      {o.favourite && <span className="text-clay-500">★</span>}
                      {o.conceptOnly && <Badge tone="outline">Concept only</Badge>}
                      {o.requiresReapproval && <Badge tone="danger">Needs re-approval</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-muted">
                      {o.code} · {o.baseProductName ?? 'No base package'} · {o.locationIds.map(l => LOCATION_LABELS[l] ?? l).join(', ')}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="num text-[13px] text-ink">{inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</p>
                    <p className="text-2xs text-muted">
                      {o.metricsSnapshot?.discountPct ? `${pct(o.metricsSnapshot.discountPct)} off list` : 'No cash discount'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  <span className="hidden text-2xs text-muted lg:block lg:w-20 lg:text-right">{relativeTime(o.updatedAt)}</span>
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <CardHeader title="New-client funnel" subtitle="Leads → trials → memberships, Bengaluru CRM export" action={<Badge tone="teal">Observed</Badge>} />
              <div className="px-4 pb-4 pt-3">
                <FunnelBars data={d.observed.funnel} />
                <p className="mt-3 text-2xs leading-relaxed text-muted">
                  Cumulative across the export window, all offers combined. A newly designed offer has no observed
                  conversion — the simulator will not invent one for it.
                </p>
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Catalogue at a glance"
                subtitle={`${num(m.catalogueRecords)} parsed records`}
                action={<Link href="/catalogue"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">Open →</span></Link>}
              />
              <div className="space-y-2 px-4 pb-4 pt-3">
                {d.categories.map(c => (
                  <div key={c.label} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{c.label}</span>
                    <span className="num text-[12.5px] text-ink">{c.count}</span>
                    <span className="num w-20 text-right text-2xs text-muted">{c.sellable} sellable</span>
                  </div>
                ))}
                {m.catalogueNeedingReview > 0 && (
                  <Link href="/catalogue?status=review" className="mt-1 flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 text-2xs text-muted transition-colors hover:border-clay-300 hover:text-ink">
                    <span>{m.catalogueNeedingReview} record{m.catalogueNeedingReview === 1 ? '' : 's'} flagged for manual review — nothing guessed</span>
                    <span>Review →</span>
                  </Link>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Needs attention"
              subtitle="Derived from record state — approvals, re-approvals, expiries, review queue"
              action={<Badge tone={d.attention.some(a => a.kind === 'blocker') ? 'danger' : d.attention.length ? 'warning' : 'success'}>{d.attention.length}</Badge>}
            />
            <div className="divide-y divide-line">
              {d.attention.length === 0 && <EmptyState title="Nothing needs your attention" description="No overdue reviews, nothing expiring and the catalogue review queue is clear." compact />}
              {d.attention.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.kind === 'blocker' ? 'bg-clay-500' : item.kind === 'warning' ? 'bg-gold-500' : 'bg-teal-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug text-ink">{item.title}</p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-muted">{item.detail}</p>
                      <p className="mt-1 text-2xs text-muted/80">{item.meta}</p>
                      <Link href={item.href} className="mt-1.5 inline-block text-2xs font-medium text-clay-600 hover:underline dark:text-clay-400">{item.actionLabel} →</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Awaiting a decision"
              subtitle="Draft → submitted → changes requested → approved"
              action={<Link href="/approvals"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">Queue →</span></Link>}
            />
            <div className="divide-y divide-line">
              {d.awaiting.length === 0 && <EmptyState title="Approval queue is clear" description="Nothing is waiting on a reviewer." compact />}
              {d.awaiting.slice(0, 5).map(o => (
                <Link key={o.id} href={`/offers/${o.id}`} className="block px-4 py-2.5 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-ink">{o.name}</p>
                    <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted">
                    {d.users.find(u => u.id === o.ownerId)?.name ?? 'Unassigned'} · updated {relativeTime(o.updatedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Saved recommendations" subtitle="Generator concepts kept in the bank — none are approved campaigns" />
            <div className="divide-y divide-line">
              {d.savedRecommendations.length === 0 && (
                <EmptyState title="No saved recommendations yet" description="Run the generator or the strategist and keep what is worth developing." compact
                  action={<Link href="/generate"><span className="text-[13px] text-clay-600 hover:underline dark:text-clay-400">Open the generator</span></Link>} />
              )}
              {d.savedRecommendations.map(({ offer, generation }) => (
                <Link key={offer.id} href={`/offers/${offer.id}`} className="block px-4 py-2.5 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-ink">{offer.name}</p>
                    <Badge tone="outline">{generation?.mode ?? offer.origin}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-muted">
                    {generation?.prompt ? generation.prompt.slice(0, 160) : offer.description.slice(0, 160)}
                  </p>
                  <p className="mt-1 text-2xs text-muted/80">
                    {generation?.provider === 'local_strategist' || !generation ? 'Local strategist engine' : generation.provider} · saved {relativeTime(offer.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Favourites & pinned" subtitle="Offers you keep returning to" />
            <div className="divide-y divide-line">
              {d.favourites.length === 0 && <EmptyState title="No favourites yet" description="Star an offer in the bank and it will appear here." compact />}
              {d.favourites.map(o => (
                <Link key={o.id} href={`/offers/${o.id}`} className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                  <span className="text-clay-500">★</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{o.name}</span>
                  <span className="num text-2xs text-muted">{inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Campaigns in flight" subtitle="Seasonal, referral and partnership campaigns with linked offers"
            action={<Link href="/campaigns"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">Planner →</span></Link>} />
          <div className="grid gap-3 px-4 pb-4 pt-3 sm:grid-cols-2">
            {d.campaigns.length === 0 && <EmptyState title="No campaigns yet" description="Group offers into a campaign to plan messaging and read a window." compact />}
            {d.campaigns.slice(0, 6).map(c => (
              <Link key={c.id} href={`/campaigns?campaign=${c.id}`} className="rounded-xl border border-line p-3 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={c.status === 'live' ? 'success' : c.status === 'completed' ? 'outline' : c.status === 'planned' ? 'neutral' : 'gold'}>{c.status}</Badge>
                  <span className="text-2xs text-muted">{dateLabel(c.startDate)}</span>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-snug text-ink">{c.name}</p>
                <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-muted">{c.description}</p>
                <p className="mt-2 text-2xs text-muted/80">{c.offerIds.length} linked offer{c.offerIds.length === 1 ? '' : 's'}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Collections" subtitle="System and team collections in the offer bank"
            action={<Link href="/offers"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">All →</span></Link>} />
          <div className="grid gap-1.5 px-4 pb-4 pt-3 sm:grid-cols-2">
            {d.collections.map(c => (
              <Link key={c.id} href={`/offers?collection=${c.id}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-50/70 dark:hover:bg-ink-800/40">
                <span className={`h-5 w-1 rounded-full ${c.accent || 'bg-ink-300'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-2xs text-muted">{c.description}</span>
                </span>
                <span className="num text-2xs text-muted">{c.offerIds.length}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader title="Top observed products" subtitle="Bengaluru revenue by product, from the sales export" />
          <div className="space-y-2.5 px-4 pb-4 pt-3">
            {d.observed.topProducts.slice(0, 6).map(p => (
              <div key={p.label}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="truncate text-ink">{p.label}</span>
                  <span className="num shrink-0 text-muted">{inr(p.value, { compact: true })} · {p.units} units</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${(p.value / (d.observed.topProducts[0]?.value || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Team activity" subtitle="Every change attributed and timestamped"
            action={<Link href="/activity"><span className="text-[12.5px] text-clay-600 hover:underline dark:text-clay-400">Full log →</span></Link>} />
          <ol className="px-4 pb-4 pt-3">
            {d.activity.length === 0 && <EmptyState title="No activity yet" description="Actions across offers, campaigns and settings appear here." compact />}
            {d.activity.slice(0, 8).map((a, i) => (
              <li key={a.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                {i < 7 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" />}
                <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-paper bg-ink-300 dark:border-ink-900" />
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-snug text-ink">
                    <span className="font-medium">{a.actor?.name ?? 'System'}</span> {a.action.replace(/_/g, ' ')}
                    {a.entityLabel ? <span className="text-muted"> · {a.entityLabel}</span> : null}
                  </p>
                  {a.detail && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{a.detail}</p>}
                  <p className="mt-0.5 text-2xs text-muted/70">{relativeTime(a.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <CardHeader title="How to read the numbers here" subtitle="Provenance, stated once so it never has to be guessed" />
        <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-3">
          <div>
            <p className="text-[12.5px] font-medium text-ink">Observed — from your exports</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">
              Revenue, product mix, discount-code performance, funnel counts, member lifecycle and capacity utilisation,
              computed from the supplied Bengaluru exports. Historical, and labelled as such everywhere it appears.
            </p>
          </div>
          <div>
            <p className="text-[12.5px] font-medium text-ink">Calculated — deterministic engine</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">
              Discounts, effective price per class or per visit, member savings, revenue delta, validity impact,
              guardrail findings and the scorecard. Same inputs, same output, every time.
            </p>
          </div>
          <div>
            <p className="text-[12.5px] font-medium text-ink">Projected — your assumptions, shown</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">
              Buyer counts, conversion, displacement and delivery cost in the simulator are inputs you set. Margin is only
              shown once costs are configured; revenue is never presented as profit.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
