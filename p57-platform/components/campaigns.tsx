'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Tabs, Textarea, cn, useToast,
} from '@/components/ui';
import { AUDIENCE_LABELS, LOCATION_LABELS, dateLabel, daysUntil, inr, pct } from '@/lib/format';
import type { Campaign, Offer } from '@/lib/types';

const STATUS_ORDER: Campaign['status'][] = ['planned', 'in_review', 'approved', 'live', 'completed', 'cancelled'];

const STATUS_STYLE: Record<Campaign['status'], string> = {
  planned: 'border-ink-200 dark:border-ink-700',
  in_review: 'border-gold-300 dark:border-gold-800',
  approved: 'border-teal-300 dark:border-teal-800',
  live: 'border-teal-400 dark:border-teal-700',
  completed: 'border-ink-300 dark:border-ink-700',
  cancelled: 'border-clay-200 dark:border-clay-900',
};

const CAMPAIGN_TYPES = [
  'Diwali', 'New Year', 'Anniversary', 'Summer', 'Member Appreciation', 'Referral Drive', 'Win-Back', 'Corporate Partnership', 'Other',
];

export function Campaigns({
  campaigns, offers, users, canManage,
}: {
  campaigns: Campaign[]; offers: Offer[]; users: { id: string; name: string; avatarColor: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [view, setView] = useState<'board' | 'timeline' | 'calendar' | 'list'>('board');
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const offerById = useMemo(() => new Map(offers.map(o => [o.id, o])), [offers]);

  async function move(campaignId: string, status: Campaign['status']) {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not update', description: json.error, tone: 'danger' }); return; }
      push({ title: `Moved to ${status.replace(/_/g, ' ')}` });
      router.refresh();
    } finally { setBusy(false); setDragging(null); }
  }

  const monthStart = useMemo(() => new Date('2026-10-01T00:00:00'), []);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monthStart); d.setMonth(d.getMonth() + i); return d;
  }), [monthStart]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module J</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Campaign planner</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Calendar moments, win-back drives and partnerships — with their offers, owners, messaging, approvals and expected
            versus observed results kept together. Expected outcomes record their basis; anything without a basis is left blank
            rather than estimated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{campaigns.filter(c => c.status === 'live').length} live</Badge>
          <Badge tone="outline">{campaigns.filter(c => c.status === 'planned').length} planned</Badge>
          {canManage && <Button size="sm" variant="primary" onClick={() => setOpenNew(true)}>New campaign</Button>}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs tabs={[{ key: 'board', label: 'Board' }, { key: 'timeline', label: 'Timeline' }, { key: 'calendar', label: 'Calendar' }, { key: 'list', label: 'List' }]} value={view} onChange={k => setView(k as any)} />
      </div>

      {view === 'board' && (
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {STATUS_ORDER.map(status => {
            const items = campaigns.filter(c => c.status === status);
            return (
              <div key={status}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragging && canManage) move(dragging, status); }}
                className={cn('rounded-xl border bg-paper/60 p-2.5', STATUS_STYLE[status])}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-2xs uppercase tracking-[0.08em] text-muted">{status.replace(/_/g, ' ')}</p>
                  <span className="num text-2xs text-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(c => (
                    <div key={c.id} draggable={canManage} onDragStart={() => setDragging(c.id)}
                      className="cursor-grab rounded-lg border border-line bg-paper p-2.5 active:cursor-grabbing">
                      <button className="w-full text-left" onClick={() => setEditing(c)}>
                        <p className="text-[12.5px] font-medium leading-snug text-ink">{c.name}</p>
                        <p className="mt-1 text-2xs text-muted">{c.objective}</p>
                        <p className="mt-1.5 text-2xs text-muted">{dateLabel(c.startDate)} → {dateLabel(c.endDate)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge tone="outline">{c.offerIds.length} offer{c.offerIds.length === 1 ? '' : 's'}</Badge>
                          {c.memberIds.slice(0, 3).map(m => {
                            const u = userById.get(m);
                            return u ? <Avatar key={m} name={u.name} color={u.avatarColor} size={16} /> : null;
                          })}
                        </div>
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && <p className="rounded-lg border border-dashed border-line px-2.5 py-3 text-center text-2xs text-muted">Drop here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'timeline' && (
        <Card>
          <CardHeader dense title="Six-month view" subtitle="October 2026 onwards · bars span each campaign's planned window" />
          <div className="overflow-x-auto p-3">
            <div className="min-w-[900px]">
              <div className="mb-2 grid grid-cols-6">
                {months.map(m => (
                  <p key={m.toISOString()} className="border-l border-line pl-2 text-2xs uppercase tracking-[0.08em] text-muted">
                    {m.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </p>
                ))}
              </div>
              <div className="space-y-1.5">
                {campaigns.map(c => {
                  const start = Date.parse(c.startDate);
                  const end = Date.parse(c.endDate);
                  const range = months.length * 30.44 * 86_400_000;
                  const left = Math.max(0, Math.min(100, ((start - monthStart.getTime()) / range) * 100));
                  const width = Math.max(2, Math.min(100 - left, ((end - start) / range) * 100));
                  return (
                    <div key={c.id} className="relative h-9 rounded-lg bg-ink-50/60 dark:bg-ink-800/40">
                      <button onClick={() => setEditing(c)}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={cn('absolute top-1 h-7 truncate rounded-md border px-2 text-left text-2xs text-ink transition-colors hover:brightness-95',
                          c.status === 'live' ? 'border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/40'
                            : c.status === 'cancelled' ? 'border-clay-200 bg-clay-50/60 dark:border-clay-900 dark:bg-clay-950/20'
                            : 'border-line bg-paper')}>
                        {c.name}
                      </button>
                      <span className="pointer-events-none absolute right-2 top-2.5 text-2xs text-muted">{c.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === 'calendar' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {months.map(m => {
            const first = new Date(m.getFullYear(), m.getMonth(), 1);
            const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            const offset = first.getDay();
            return (
              <Card key={m.toISOString()}>
                <CardHeader dense title={m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
                <div className="p-3">
                  <div className="grid grid-cols-7 gap-1 text-center text-2xs text-muted">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {Array.from({ length: offset }, (_, i) => <span key={`pad${i}`} />)}
                    {Array.from({ length: days }, (_, i) => {
                      const day = new Date(m.getFullYear(), m.getMonth(), i + 1);
                      const iso = day.toISOString().slice(0, 10);
                      const starting = campaigns.filter(c => c.startDate <= iso && c.endDate >= iso);
                      return (
                        <div key={iso} className={cn('min-h-[38px] rounded border p-0.5 text-2xs',
                          starting.length ? 'border-clay-200 bg-clay-50/50 dark:border-clay-900 dark:bg-clay-950/20' : 'border-line/60')}>
                          <span className="text-muted">{i + 1}</span>
                          {starting.slice(0, 1).map(c => <p key={c.id} className="truncate text-[9px] text-clay-700 dark:text-clay-300">{c.name}</p>)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === 'list' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-[0.08em] text-muted">
                  <th className="px-4 py-2.5 text-left">Campaign</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Window</th>
                  <th className="px-4 py-2.5 text-left">Offers</th>
                  <th className="px-4 py-2.5 text-left">Value at one sale each</th>
                  <th className="px-4 py-2.5 text-left">Owner</th>
                  <th className="px-4 py-2.5 text-left">Expected vs observed</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const linked = c.offerIds.map(id => offerById.get(id)).filter(Boolean) as Offer[];
                  const proxy = linked.reduce((sum, o) => sum + (o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice ?? 0), 0);
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                      <td className="px-4 py-2.5">
                        <button className="text-left" onClick={() => setEditing(c)}>
                          <span className="block text-ink">{c.name}</span>
                          <span className="block text-2xs text-muted">{c.objective}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={c.status === 'live' ? 'success' : c.status === 'cancelled' ? 'neutral' : 'outline'}>{c.status.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-2.5 text-muted">{dateLabel(c.startDate)} → {dateLabel(c.endDate)}</td>
                      <td className="px-4 py-2.5 num">{c.offerIds.length}</td>
                      <td className="px-4 py-2.5 num">{inr(proxy)}<span className="ml-1 text-2xs text-muted">not a forecast</span></td>
                      <td className="px-4 py-2.5 text-muted">{userById.get(c.ownerId)?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-2xs text-muted">
                        {c.expectedOutcomes.length} expected · {c.actuals?.length ? `${c.actuals.length} observed` : 'no observations yet'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {campaigns.length === 0 && <Card><EmptyState title="No campaigns yet" description="Create the first campaign to group offers around a moment in the calendar." /></Card>}

      <CampaignModal
        open={openNew || Boolean(editing)}
        campaign={editing}
        offers={offers}
        users={users}
        canManage={canManage}
        onClose={() => { setOpenNew(false); setEditing(null); }}
        onSaved={() => { setOpenNew(false); setEditing(null); router.refresh(); }}
      />
    </div>
  );
}

function CampaignModal({
  open, campaign, offers, users, canManage, onClose, onSaved,
}: {
  open: boolean; campaign: Campaign | null; offers: Offer[];
  users: { id: string; name: string }[]; canManage: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => blank());
  const [type, setType] = useState('Diwali');
  const [linked, setLinked] = useState<string[]>([]);

  function blank() {
    return {
      name: '', objective: '', description: '', startDate: '2026-10-20', endDate: '2026-11-05',
      status: 'planned' as Campaign['status'], ownerId: users[0]?.id ?? '', memberIds: [] as string[],
      messaging: '', locationIds: ['p57-blr-vmr'] as string[],
      expectedOutcomes: [{ label: '', value: '', basis: '' }],
    };
  }

  React.useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name, objective: campaign.objective, description: campaign.description,
        startDate: campaign.startDate.slice(0, 10), endDate: campaign.endDate.slice(0, 10), status: campaign.status,
        ownerId: campaign.ownerId, memberIds: campaign.memberIds, messaging: campaign.messaging,
        locationIds: campaign.locationIds as string[],
        expectedOutcomes: campaign.expectedOutcomes.length ? campaign.expectedOutcomes : [{ label: '', value: '', basis: '' }],
      });
      setLinked(campaign.offerIds);
      setType(CAMPAIGN_TYPES.find(t => campaign.name.toLowerCase().includes(t.toLowerCase())) ?? 'Other');
    } else {
      setForm(blank()); setLinked([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, open]);

  async function save() {
    if (!form.name.trim()) { push({ title: 'Name the campaign', tone: 'warning' }); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        offerIds: linked,
        expectedOutcomes: form.expectedOutcomes.filter(e => e.label.trim() && e.value.trim()),
      };
      const res = await fetch(campaign ? `/api/campaigns/${campaign.id}` : '/api/campaigns', {
        method: campaign ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not save', description: json.error, tone: 'danger' }); return; }
      push({ title: campaign ? 'Campaign updated' : 'Campaign created', description: 'Offer links and expected outcomes saved.' });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={campaign ? campaign.name : 'New campaign'} subtitle={campaign ? `${campaign.status.replace(/_/g, ' ')} · owner ${users.find(u => u.id === campaign.ownerId)?.name ?? '—'}` : 'Group offers around a moment, an audience or a partnership'} width="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Diwali 2026 — Value Stack" /></Field>
          <Field label="Type" hint="Used for grouping and reporting only">
            <Select value={type} onChange={e => setType(e.target.value)}>{CAMPAIGN_TYPES.map(t => <option key={t}>{t}</option>)}</Select>
          </Field>
          <Field label="Objective"><Input value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="Convert trialists into 8-class packs" /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Campaign['status'] }))}>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Starts"><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></Field>
          <Field label="Ends"><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></Field>
          <Field label="Owner"><Select value={form.ownerId} onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Location">
            <Select value={form.locationIds[0] ?? ''} onChange={e => setForm(f => ({ ...f, locationIds: [e.target.value] }))}>
              {Object.entries(LOCATION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Description"><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
        <Field label="Messaging" hint="How it will be described to members — sales and copy teams read this"><Textarea rows={3} value={form.messaging} onChange={e => setForm(f => ({ ...f, messaging: e.target.value }))} /></Field>

        <div>
          <p className="mb-1.5 text-2xs uppercase tracking-[0.08em] text-muted">Offers in this campaign</p>
          <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
            {offers.map(o => (
              <label key={o.id} className="flex items-start gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={linked.includes(o.id)} onChange={e => setLinked(l => (e.target.checked ? [...l, o.id] : l.filter(x => x !== o.id)))} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block truncate text-ink">{o.name}</span>
                  <span className="block truncate text-2xs">{o.code} · {inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}{o.metricsSnapshot?.discountPct ? ` · ${pct(o.metricsSnapshot.discountPct)} off` : ''}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-2xs text-muted">
            Only offers that pass guardrails and are approved should be published as part of a campaign. Nothing here publishes automatically.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-2xs uppercase tracking-[0.08em] text-muted">Expected outcomes</p>
          <div className="space-y-2">
            {form.expectedOutcomes.map((e, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_1.4fr]">
                <Input placeholder="Metric (e.g. trial-to-pack conversion)" value={e.label}
                  onChange={ev => setForm(f => ({ ...f, expectedOutcomes: f.expectedOutcomes.map((x, xi) => xi === i ? { ...x, label: ev.target.value } : x) }))} />
                <Input placeholder="Value" value={e.value}
                  onChange={ev => setForm(f => ({ ...f, expectedOutcomes: f.expectedOutcomes.map((x, xi) => xi === i ? { ...x, value: ev.target.value } : x) }))} />
                <Input placeholder="Basis — where does this number come from?" value={e.basis}
                  onChange={ev => setForm(f => ({ ...f, expectedOutcomes: f.expectedOutcomes.map((x, xi) => xi === i ? { ...x, basis: ev.target.value } : x) }))} />
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, expectedOutcomes: [...f.expectedOutcomes, { label: '', value: '', basis: '' }] }))}>Add expected outcome</Button>
            <p className="text-2xs text-muted">
              Outcomes without a stated basis are kept blank in reporting. The platform will not invent a target or a conversion rate.
            </p>
          </div>
        </div>

        {campaign?.actuals?.length ? (
          <Card>
            <CardHeader dense title="Observed results recorded" />
            <div className="space-y-1 p-3 text-2xs text-muted">
              {campaign.actuals.map(a => <p key={a.label}><span className="text-ink">{a.label}:</span> {a.value} — {a.basis}</p>)}
            </div>
          </Card>
        ) : campaign ? (
          <Alert tone="info" title="No observed results recorded">Once this campaign runs, record what actually happened — the platform keeps it separate from the expected figures.</Alert>
        ) : null}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={busy} disabled={!canManage}>
            {campaign ? 'Save campaign' : 'Create campaign'}
          </Button>
          {!canManage && <span className="text-2xs text-muted">Your role can view campaigns but not change them.</span>}
          {campaign && <span className="ml-auto text-2xs text-muted">Created {dateLabel(campaign.createdAt)} · updated {dateLabel(campaign.updatedAt)}</span>}
        </div>
      </div>
    </Modal>
  );
}
