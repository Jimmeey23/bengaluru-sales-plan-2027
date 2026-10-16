'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Select, Tabs, Textarea, cn, useToast,
} from '@/components/ui';
import { GuardrailList } from '@/components/financials';
import {
  AUDIENCE_LABELS, LOCATION_LABELS, OBJECTIVE_LABELS, STATUS_LABELS, STATUS_TONES, dateLabel, inr, pct, relativeTime,
} from '@/lib/format';
import type { Offer } from '@/lib/types';

export interface ApprovalItem {
  offer: Offer;
  transitions: { action: string; to: string; label: string }[];
  waitingSince: string | null;
  waitingDays: number | null;
  lastNote: string | null;
  commentCount: number;
}

const ACTION_COPY: Record<string, { title: string; tone: 'success' | 'warning' | 'danger' | 'info'; verb: string }> = {
  approve: { title: 'Approve', tone: 'success', verb: 'Approved' },
  request_changes: { title: 'Request changes', tone: 'warning', verb: 'Changes requested' },
  reject: { title: 'Reject', tone: 'danger', verb: 'Rejected' },
  publish: { title: 'Publish', tone: 'success', verb: 'Published' },
  submit: { title: 'Submit for review', tone: 'info', verb: 'Submitted' },
  archive: { title: 'Archive', tone: 'warning', verb: 'Archived' },
  reopen: { title: 'Reopen', tone: 'info', verb: 'Reopened' },
  expire: { title: 'Expire', tone: 'warning', verb: 'Expired' },
};

export function Approvals({
  items, users, canApprove, canPublish, currentUserId,
}: {
  items: ApprovalItem[]; users: { id: string; name: string; role: string; avatarColor: string }[];
  canApprove: boolean; canPublish: boolean; currentUserId: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [view, setView] = useState<'queue' | 'mine' | 'decided'>('queue');
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [open, setOpen] = useState<ApprovalItem | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [override, setOverride] = useState(false);

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const buckets = useMemo(() => {
    const awaiting = items.filter(i => i.offer.status === 'in_review');
    const changes = items.filter(i => i.offer.status === 'changes_requested');
    const publish = items.filter(i => i.offer.status === 'approved');
    const live = items.filter(i => i.offer.status === 'published' || i.offer.status === 'expired');
    return { awaiting, changes, publish, live };
  }, [items]);

  const filtered = useMemo(() => {
    const src = view === 'queue' ? [...buckets.awaiting, ...buckets.changes]
      : view === 'mine' ? items.filter(i => i.offer.ownerId === currentUserId && ['submitted', 'changes_requested', 'draft'].includes(i.offer.status))
      : items.filter(i => ['approved', 'published', 'expired'].includes(i.offer.status));
    return src
      .filter(i => (query ? i.offer.name.toLowerCase().includes(query.toLowerCase()) || i.offer.code.toLowerCase().includes(query.toLowerCase()) : true))
      .filter(i => (ownerFilter ? i.offer.ownerId === ownerFilter : true))
      .filter(i => (locationFilter ? i.offer.locationIds.includes(locationFilter as any) : true))
      .sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1));
  }, [view, buckets, items, query, ownerFilter, locationFilter, currentUserId]);

  async function act(item: ApprovalItem, action: string) {
    setBusy(action);
    try {
      const res = await fetch(`/api/offers/${item.offer.id}/workflow`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() || null, version: item.offer.version, override: override || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Action rejected', description: json.error, tone: 'danger' }); return; }
      push({ title: `${item.offer.name}: ${ACTION_COPY[action]?.verb ?? action}`, description: note.trim() ? `Note recorded for ${item.offer.ownerId === currentUserId ? 'you' : userById.get(item.offer.ownerId)?.name ?? 'the owner'}.` : undefined });
      setOpen(null); setNote(''); setOverride(false);
      router.refresh();
    } finally { setBusy(null); }
  }

  const counts = {
    awaiting: buckets.awaiting.length, changes: buckets.changes.length, publish: buckets.publish.length, live: buckets.live.length,
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module I</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Approvals</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Draft → Submitted → Changes requested → Approved → Published → Expired or archived. Commercial-term changes after
            approval send the offer back for reapproval, and guardrail blockers need an explicit override — both are recorded
            against your name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={counts.awaiting ? 'warning' : 'neutral'}>{counts.awaiting} awaiting review</Badge>
          <Badge tone={counts.changes ? 'danger' : 'neutral'}>{counts.changes} changes requested</Badge>
          <Badge tone="neutral">{counts.publish} ready to publish</Badge>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Awaiting review" value={counts.awaiting} tone={counts.awaiting ? 'warning' : 'neutral'} onClick={() => setView('queue')} />
        <Tile label="Changes requested" value={counts.changes} tone={counts.changes ? 'danger' : 'neutral'} onClick={() => setView('queue')} />
        <Tile label="Approved, not published" value={counts.publish} tone={counts.publish ? 'info' : 'neutral'} onClick={() => setView('decided')} />
        <Tile label="Live or expired" value={counts.live} tone="neutral" onClick={() => setView('decided')} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <Tabs
            tabs={[{ key: 'queue', label: 'Review queue', count: counts.awaiting + counts.changes }, { key: 'mine', label: 'My offers' }, { key: 'decided', label: 'Decided' }]}
            value={view} onChange={k => setView(k as any)}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input placeholder="Search name or code" value={query} onChange={e => setQuery(e.target.value)} className="w-48" />
            <Select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="w-40">
              <option value="">Any owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="w-48">
              <option value="">Any location</option>
              {Object.entries(LOCATION_LABELS).filter(([id]) => ['p57-blr-vmr', 'studio-cnc-indiranagar', 'plash-pilates-sadashivnagar', 'virtual-online'].includes(id)).map(([id, label]) => (
                <option key={id} value={id}>{label.split('—')[0].trim()}</option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={view === 'queue' ? 'The review queue is clear' : 'Nothing here yet'}
            description={view === 'queue'
              ? 'When a team member submits an offer for review it lands here with its engine figures, guardrail evaluation and comment thread intact.'
              : 'Offers you own will appear here as they move through the workflow.'}
          />
        ) : (
          <div className="divide-y divide-line">
            {filtered.map(item => {
              const owner = userById.get(item.offer.ownerId);
              const failed = (item.offer.metricsSnapshot?.guardrails ?? []).filter((g: any) => !g.passed);
              return (
                <div key={item.offer.id} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                  <button className="min-w-0 flex-1 text-left" onClick={() => { setOpen(item); setNote(''); setOverride(false); }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] text-ink">{item.offer.name}</span>
                      <Badge tone={STATUS_TONES[item.offer.status]}>{STATUS_LABELS[item.offer.status]}</Badge>
                      <span className="text-2xs text-muted">{item.offer.code} · v{item.offer.version}</span>
                      {failed.length > 0 && <Badge tone={failed.some((f: any) => f.severity === 'blocker') ? 'danger' : 'warning'}>{failed.length} guardrail</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[12.5px] text-muted">
                      {inr(item.offer.metricsSnapshot?.sellingPrice ?? item.offer.terms.sellingPrice)}
                      {item.offer.metricsSnapshot?.discountPct ? ` · ${pct(item.offer.metricsSnapshot.discountPct)} off list` : ' · no cash discount'}
                      {' · '}{item.offer.audienceSegments.map(a => AUDIENCE_LABELS[a] ?? a).join(', ') || 'audience not set'}
                      {' · '}{item.offer.locationIds.map(l => (LOCATION_LABELS[l] ?? l).split('—')[0].trim()).join(', ')}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted">
                      {owner && <span className="inline-flex items-center gap-1.5"><Avatar name={owner.name} color={owner.avatarColor} size={16} />{owner.name}</span>}
                      <span>· submitted {item.waitingSince ? relativeTime(item.waitingSince) : 'not yet submitted'}</span>
                      {item.waitingDays != null && <span>· waiting {item.waitingDays} day{item.waitingDays === 1 ? '' : 's'}</span>}
                      {item.commentCount > 0 && <span>· {item.commentCount} comment{item.commentCount === 1 ? '' : 's'}</span>}
                    </p>
                    {item.lastNote && <p className="mt-1 line-clamp-1 text-2xs italic text-muted">&ldquo;{item.lastNote}&rdquo;</p>}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link href={`/offers/${item.offer.id}`}><Button size="sm" variant="ghost">Open editor</Button></Link>
                    {/* Fast path: the two decisions a reviewer nearly always makes. */}
                    {canApprove && item.offer.status === 'in_review' && (
                      <Button size="sm" variant="secondary" onClick={() => act(item, 'approve')} loading={busy === 'approve'}>Approve</Button>
                    )}
                    {canPublish && item.offer.status === 'approved' && (
                      <Button size="sm" variant="primary" onClick={() => act(item, 'publish')} loading={busy === 'publish'}>Publish</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setOpen(item); setNote(''); setOverride(false); }}>Review</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.offer.name ?? ''} subtitle={open ? `${open.offer.code} · version ${open.offer.version} · ${STATUS_LABELS[open.offer.status]}` : ''} width="xl">
        {open && (
          <div className="space-y-4">
            <Card>
              <CardHeader dense title="Commercial summary" subtitle="Figures calculated by the pricing engine at version submission" />
              <div className="grid gap-3 p-3 sm:grid-cols-4">
                <Mini label="List price" value={inr(open.offer.metricsSnapshot?.listPrice, { compact: true })} />
                <Mini label="Selling price" value={inr(open.offer.metricsSnapshot?.sellingPrice ?? open.offer.terms.sellingPrice)} />
                <Mini label="Discount" value={open.offer.metricsSnapshot?.discountPct ? pct(open.offer.metricsSnapshot.discountPct) : 'None'} />
                <Mini label="Per class / visit" value={inr(open.offer.metricsSnapshot?.effectivePricePerClass ?? open.offer.metricsSnapshot?.effectivePricePerVisit)} />
                <Mini label="Member value" value={inr(open.offer.metricsSnapshot?.customerValueReceived)} />
                <Mini label="Member saving" value={open.offer.metricsSnapshot?.customerSavingsPct ? pct(open.offer.metricsSnapshot.customerSavingsPct) : '—'} />
                <Mini label="Validity" value={open.offer.metricsSnapshot?.validityDays ? `${open.offer.metricsSnapshot.validityDays} days` : '—'} />
                <Mini label="Scorecard" value={open.offer.metricsSnapshot?.scorecard ? `${open.offer.metricsSnapshot.scorecard.overall.toFixed(1)}/10` : '—'} />
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader dense title="What this offer gives the member" />
                <div className="space-y-2 p-3 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                  <p>{open.offer.description}</p>
                  <p className="text-muted">
                    {open.offer.objectives.map(o => OBJECTIVE_LABELS[o] ?? o).join(', ') || 'Objective not set'} ·
                    {' '}{open.offer.audienceSegments.map(a => AUDIENCE_LABELS[a] ?? a).join(', ') || 'Audience not set'}
                  </p>
                  {(open.offer.terms.redeemableFrom || open.offer.expiresOn) && (
                    <p className="text-muted">Redeemable {dateLabel(open.offer.terms.redeemableFrom ?? open.offer.publishedAt)} → {dateLabel(open.offer.terms.redeemableTo ?? open.offer.expiresOn)}</p>
                  )}
                  {open.offer.terms.purchaseDeadline && <p className="text-muted">Must be purchased by {dateLabel(open.offer.terms.purchaseDeadline)}</p>}
                  {open.offer.eligibility.customAudience && <p className="text-muted">Eligibility: {open.offer.eligibility.customAudience}</p>}
                  {open.offer.eligibility.exclusions?.length ? <p className="text-muted">Exclusions: {open.offer.eligibility.exclusions.join(', ')}</p> : null}
                </div>
              </Card>
              <Card>
                <CardHeader dense title="Guardrail evaluation" subtitle="Blocker-level findings require an override to proceed" />
                <div className="p-3">
                  <GuardrailList findings={open.offer.metricsSnapshot?.guardrails ?? []} />
                  {canApprove && (open.offer.metricsSnapshot?.guardrails ?? []).some((g: any) => !g.passed && g.severity === 'blocker') && (
                    <label className="mt-3 flex items-start gap-2 text-2xs text-muted">
                      <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} className="mt-0.5" />
                      <span>Override the blocker(s) — recorded against my name with the note below.</span>
                    </label>
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader dense title="Note" subtitle="Required for requesting changes or rejecting; shown to the owner in their notifications" />
              <div className="p-3">
                <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What needs to change before this can be approved?" />
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              {open.transitions.length === 0 && <Alert tone="info" title="No transitions available to you">This offer is not in a state you can action, or your role does not cover this step.</Alert>}
              {open.transitions.map(t => {
                const copy = ACTION_COPY[t.action] ?? { title: t.label, tone: 'info' as const, verb: t.label };
                const destructive = t.action === 'reject' || t.action === 'request_changes';
                if (destructive && !canApprove) return null;
                return (
                  <Button key={t.action}
                    variant={t.action === 'approve' || t.action === 'publish' ? 'primary' : destructive ? 'danger' : 'secondary'}
                    loading={busy === t.action}
                    onClick={() => {
                      if (destructive && note.trim().length < 4) { push({ title: 'Add a note', description: 'The owner needs to know what to change.', tone: 'warning' }); return; }
                      act(open, t.action);
                    }}>
                    {copy.title}
                  </Button>
                );
              })}
              <span className="ml-auto text-2xs text-muted">Every action is written to the offer&rsquo;s history and the activity feed.</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Tile({ label, value, tone, onClick }: { label: string; value: number; tone: 'neutral' | 'warning' | 'danger' | 'info'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-line bg-paper p-3 text-left transition-colors hover:border-clay-200 dark:hover:border-clay-800">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={cn('num mt-1 font-display text-[22px]',
        tone === 'warning' ? 'text-gold-600 dark:text-gold-400' : tone === 'danger' ? 'text-clay-600 dark:text-clay-400' : tone === 'info' ? 'text-teal-700 dark:text-teal-400' : 'text-ink')}>{value}</p>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="num mt-1 text-[14px] text-ink">{value}</p>
    </div>
  );
}
