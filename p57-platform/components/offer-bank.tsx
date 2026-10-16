'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Input, Select, Table, Td, Th, cn, useToast } from '@/components/ui';
import { AUDIENCE_LABELS, LOCATION_LABELS, OBJECTIVE_LABELS, STATUS_LABELS, STATUS_TONES, dateLabel, inr, pct, relativeTime } from '@/lib/format';
import type { Campaign, Collection, Offer } from '@/lib/types';

type View = 'gallery' | 'list' | 'table';

export function OfferBank({ offers, collections, campaigns, users, canCreate }: {
  offers: Offer[]; collections: Collection[]; campaigns: Campaign[];
  users: { id: string; name: string }[]; canCreate: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { push } = useToast();
  const [view, setView] = useState<View>('gallery');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? 'all');
  const [collection, setCollection] = useState(sp.get('collection') ?? 'all');
  const [campaign, setCampaign] = useState('all');
  const [audience, setAudience] = useState('all');
  const [owner, setOwner] = useState('all');
  const [tag, setTag] = useState('all');
  const [conceptOnly, setConceptOnly] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  const allTags = useMemo(() => Array.from(new Set(offers.flatMap(o => o.tags))).sort(), [offers]);
  const allAudiences = useMemo(() => Array.from(new Set(offers.flatMap(o => o.audienceSegments))), [offers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return offers.filter(o => {
      if (status !== 'all' && o.status !== status) return false;
      if (collection !== 'all' && !o.collectionIds.includes(collection)) return false;
      if (campaign !== 'all' && o.campaignId !== campaign) return false;
      if (audience !== 'all' && !o.audienceSegments.includes(audience as any)) return false;
      if (owner !== 'all' && o.ownerId !== owner) return false;
      if (tag !== 'all' && !o.tags.includes(tag)) return false;
      if (conceptOnly === 'concept' && !o.conceptOnly) return false;
      if (conceptOnly === 'executed' && o.conceptOnly) return false;
      if (term && !(`${o.name} ${o.code} ${o.description} ${o.tags.join(' ')} ${o.baseProductName ?? ''}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [offers, q, status, collection, campaign, audience, owner, tag, conceptOnly]);

  const duplicates = useMemo(() => {
    const seen = new Map<string, Offer[]>();
    for (const o of filtered) {
      const key = `${o.baseProductId ?? 'none'}|${Math.round((o.metricsSnapshot?.sellingPrice ?? 0) / 500)}`;
      seen.set(key, [...(seen.get(key) ?? []), o]);
    }
    return Array.from(seen.values()).filter(group => group.length > 1);
  }, [filtered]);

  async function mutate(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id + action);
    try {
      const res = action === 'duplicate'
        ? await fetch(`/api/offers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...offers.find(o => o.id === id), id: undefined, name: `${offers.find(o => o.id === id)?.name} (copy)` }) })
        : await fetch(`/api/offers/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Action failed', description: json.error, tone: 'danger' }); return; }
      push({ title: action === 'duplicate' ? 'Offer duplicated' : action === 'convert_to_template' ? 'Saved as template' : 'Updated', description: json.offer?.name });
      router.refresh();
    } finally { setBusy(null); }
  }

  async function toggleFavourite(o: Offer) {
    await fetch(`/api/offers/${o.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: o.version, favourite: !o.favourite }),
    });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module H</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Offer bank</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Every offer the team has built, drafted, approved or retired. Concepts saved from the generator are marked
            <span className="text-ink"> concept only</span> because they have never run in market — that flag only clears when
            the offer is published and results are recorded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {(['gallery', 'list', 'table'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-1.5 text-[12px] capitalize transition-colors', view === v ? 'bg-ink-100 text-ink dark:bg-ink-800' : 'text-muted hover:text-ink')}>{v}</button>
            ))}
          </div>
          {canCreate && <Link href="/generate"><Button variant="primary" size="sm">New offer</Button></Link>}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[232px_1fr]">
        <aside className="space-y-3">
          <Card className="p-2.5">
            <p className="px-1.5 pb-1.5 text-2xs uppercase tracking-[0.1em] text-muted">Collections</p>
            <button onClick={() => setCollection('all')}
              className={cn('w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors', collection === 'all' ? 'bg-ink-100 font-medium text-ink dark:bg-ink-800' : 'text-muted hover:text-ink')}>
              All offers <span className="num float-right">{offers.length}</span>
            </button>
            {collections.map(c => (
              <button key={c.id} onClick={() => setCollection(c.id)}
                className={cn('w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors', collection === c.id ? 'bg-ink-100 font-medium text-ink dark:bg-ink-800' : 'text-muted hover:text-ink')}>
                <span className="flex items-center gap-2">
                  <span className={cn('h-3.5 w-1 rounded-full', c.accent || 'bg-ink-300')} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="num">{c.offerIds.length}</span>
                </span>
              </button>
            ))}
          </Card>

          <Card className="p-2.5">
            <p className="px-1.5 pb-1.5 text-2xs uppercase tracking-[0.1em] text-muted">Smart filters</p>
            {[
              { id: 'drafts', label: 'Drafts needing work', apply: () => { setStatus('draft'); setCollection('all'); } },
              { id: 'review', label: 'Awaiting approval', apply: () => { setStatus('in_review'); setCollection('all'); } },
              { id: 'changes', label: 'Changes requested', apply: () => { setStatus('changes_requested'); setCollection('all'); } },
              { id: 'reapproval', label: 'Needs re-approval', apply: () => { setStatus('all'); setCollection('all'); setTag('all'); } },
              { id: 'concepts', label: 'Concept only (never run)', apply: () => { setConceptOnly('concept'); setStatus('all'); } },
              { id: 'executed', label: 'Executed in market', apply: () => { setConceptOnly('executed'); setStatus('all'); } },
              { id: 'dupes', label: 'Possible duplicates', apply: () => { setStatus('all'); setCollection('all'); } },
            ].map(f => (
              <button key={f.id} onClick={f.apply} className="w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:text-ink">{f.label}</button>
            ))}
          </Card>
        </aside>

        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <Input placeholder="Search name, code, tag, base product…" value={q} onChange={e => setQ(e.target.value)} className="h-8 w-full sm:w-60" />
            <Select value={status} onChange={e => setStatus(e.target.value)} className="h-8 w-auto">
              <option value="all">Any status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={audience} onChange={e => setAudience(e.target.value)} className="h-8 w-auto">
              <option value="all">Any audience</option>
              {allAudiences.map(a => <option key={a} value={a}>{AUDIENCE_LABELS[a] ?? a}</option>)}
            </Select>
            <Select value={owner} onChange={e => setOwner(e.target.value)} className="h-8 w-auto">
              <option value="all">Any owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select value={campaign} onChange={e => setCampaign(e.target.value)} className="h-8 w-auto">
              <option value="all">Any campaign</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={tag} onChange={e => setTag(e.target.value)} className="h-8 w-auto">
              <option value="all">Any tag</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={conceptOnly} onChange={e => setConceptOnly(e.target.value)} className="h-8 w-auto">
              <option value="all">Concept + executed</option>
              <option value="concept">Concept only</option>
              <option value="executed">Executed only</option>
            </Select>
            <span className="ml-auto text-2xs text-muted">{filtered.length} of {offers.length}</span>
          </Card>

          {duplicates.length > 0 && (
            <Card className="border-gold-200 bg-gold-50/50 p-3 dark:border-gold-900 dark:bg-gold-950/20">
              <p className="text-[12.5px] font-medium text-ink">Duplicate detection</p>
              <p className="mt-1 text-2xs leading-relaxed text-muted">
                {duplicates.map(g => g.map(o => o.name).join(' / ')).slice(0, 3).join(' · ')} — same base package and a price
                within ₹500 of each other. Consolidate before one of them reaches market.
              </p>
            </Card>
          )}

          {filtered.length === 0 && (
            <Card>
              <EmptyState
                title="Nothing matches those filters"
                description="Clear a filter, or start something new — the generator can propose five distinct angles in one pass."
                action={<Link href="/generate"><Button variant="primary" size="sm">Open the generator</Button></Link>}
              />
            </Card>
          )}

          {view === 'gallery' && filtered.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(o => (
                <Card key={o.id} className="group flex flex-col p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                        {o.conceptOnly && <Badge tone="outline">Concept only</Badge>}
                        {o.requiresReapproval && <Badge tone="danger">Re-approval</Badge>}
                        {o.pinned && <Badge tone="clay">Pinned</Badge>}
                      </div>
                      <Link href={`/offers/${o.id}`} className="mt-2 block font-display text-[16px] leading-snug text-ink hover:text-clay-600 dark:hover:text-clay-400">{o.name}</Link>
                      <p className="mt-0.5 text-2xs text-muted">{o.code} · {o.baseProductName ?? 'No base package'}</p>
                    </div>
                    <button onClick={() => toggleFavourite(o)} className={cn('shrink-0 text-[15px] transition-colors', o.favourite ? 'text-clay-500' : 'text-ink-300 hover:text-clay-400')} title="Favourite">
                      ★
                    </button>
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{o.description}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
                    <div>
                      <p className="text-2xs text-muted">Price</p>
                      <p className="num text-[13px] text-ink">{inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-muted">Discount</p>
                      <p className="num text-[13px] text-ink">{o.metricsSnapshot?.discountPct ? pct(o.metricsSnapshot.discountPct, 0) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-muted">Score</p>
                      <p className="num text-[13px] text-ink">{o.metricsSnapshot?.scorecard.overall.toFixed(1) ?? '—'}</p>
                    </div>
                  </div>

                  <p className="mt-2 text-2xs text-muted">
                    {o.audienceSegments.map(a => AUDIENCE_LABELS[a] ?? a).slice(0, 2).join(', ') || 'Audience not set'} · {o.locationIds.map(l => (LOCATION_LABELS[l] ?? l).split('—')[0].trim())[0]}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                    <Link href={`/offers/${o.id}`}><Button size="sm" variant="secondary">Open</Button></Link>
                    <Link href={`/offers/${o.id}?tab=simulate`}><Button size="sm" variant="ghost">Simulate</Button></Link>
                    <button onClick={() => mutate(o.id, 'duplicate')} disabled={busy === o.id + 'duplicate'}
                      className="rounded-md px-2 py-1 text-[12px] text-muted hover:text-ink">Duplicate</button>
                    {o.tags.includes('template') ? <Badge tone="teal">Template</Badge> : (
                      <button onClick={() => mutate(o.id, 'convert_to_template')} className="rounded-md px-2 py-1 text-[12px] text-muted hover:text-ink">Make template</button>
                    )}
                    <span className="ml-auto text-2xs text-muted">{relativeTime(o.updatedAt)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {view === 'list' && (
            <Card>
              <div className="divide-y divide-line">
                {filtered.map(o => (
                  <Link key={o.id} href={`/offers/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                    <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">{o.name} {o.favourite && <span className="text-clay-500">★</span>}</p>
                      <p className="truncate text-2xs text-muted">{o.code} · {o.objectives.map(x => OBJECTIVE_LABELS[x] ?? x).join(', ') || 'No objective set'}</p>
                    </div>
                    <span className="num hidden text-[13px] text-ink sm:block">{inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</span>
                    <span className="hidden text-2xs text-muted lg:block">{dateLabel(o.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {view === 'table' && (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Offer</Th><Th>Status</Th><Th>Base package</Th><Th align="right">Price</Th><Th align="right">Discount</Th>
                      <Th align="right">Per class</Th><Th align="right">Score</Th><Th>Owner</Th><Th>Campaign</Th><Th>Updated</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => (
                      <tr key={o.id} className="transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                        <Td><Link href={`/offers/${o.id}`} className="font-medium text-ink hover:text-clay-600 dark:hover:text-clay-400">{o.name}</Link>
                          <p className="text-2xs text-muted">{o.code}{o.conceptOnly ? ' · concept only' : ''}</p></Td>
                        <Td><Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge></Td>
                        <Td><span className="text-[12.5px] text-muted">{o.baseProductName ?? '—'}</span></Td>
                        <Td align="right"><span className="num">{inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</span></Td>
                        <Td align="right"><span className="num">{o.metricsSnapshot?.discountPct ? pct(o.metricsSnapshot.discountPct, 0) : '—'}</span></Td>
                        <Td align="right"><span className="num">{inr(o.metricsSnapshot?.effectivePricePerClass ?? o.metricsSnapshot?.effectivePricePerVisit ?? null)}</span></Td>
                        <Td align="right"><span className="num">{o.metricsSnapshot?.scorecard.overall.toFixed(1) ?? '—'}</span></Td>
                        <Td><span className="text-[12.5px] text-muted">{users.find(u => u.id === o.ownerId)?.name ?? '—'}</span></Td>
                        <Td><span className="text-[12.5px] text-muted">{campaigns.find(c => c.id === o.campaignId)?.name ?? '—'}</span></Td>
                        <Td><span className="text-2xs text-muted">{dateLabel(o.updatedAt)}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
