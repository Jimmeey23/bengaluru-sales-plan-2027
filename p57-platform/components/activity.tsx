'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Select, StatTile, Toggle, cn,
} from '@/components/ui';
import { dateTimeLabel, relativeTime } from '@/lib/format';
import type { ActivityEntry } from '@/lib/types';

type Actor = { id: string; name: string; role: string; title: string; avatarColor: string };
type OfferRef = { id: string; name: string; code: string; status: string; metricsSnapshot: { sellingPrice: number | null } };

const ENTITY_LABELS: Record<string, string> = {
  offer: 'Offers',
  campaign: 'Campaigns',
  catalogue: 'Catalogue',
  settings: 'Settings',
  approval: 'Approvals',
  comment: 'Comments',
  import: 'Imports',
  ai: 'AI',
};

const ENTITY_TONES: Record<string, string> = {
  offer: 'clay', campaign: 'teal', catalogue: 'neutral', settings: 'warning',
  approval: 'success', comment: 'info', import: 'neutral', ai: 'gold',
};

/** Plain-language phrasing for each recorded action. Kick-off fallback keeps unknown actions readable. */
const ACTION_PHRASES: Record<string, string> = {
  created: 'created',
  edited: 'edited',
  submitted: 'submitted for review',
  approved: 'approved',
  requested_changes: 'requested changes on',
  rejected: 'rejected back to draft',
  published: 'published',
  expired: 'marked expired',
  archived: 'archived',
  reopened: 'reopened as a draft',
  commented: 'commented on',
  restored_version: 'restored an earlier version of',
  converted_to_template: 'converted to a template',
  assigned_collaborator: 'assigned a collaborator to',
  imported_catalogue: 'imported a price list into',
  edited_catalogue_product: 'edited a catalogue product in',
  created_catalogue_product: 'added a catalogue product to',
  updated_settings: 'changed workspace settings in',
  changed_role: 'changed a team role for',
  saved_generated_offers: 'saved generated concepts to',
  campaign_created: 'created a campaign in',
  campaign_updated: 'updated a campaign in',
  campaign_live: 'set a campaign live in',
  campaign_approved: 'approved a campaign in',
  campaign_completed: 'completed a campaign in',
  imported: 'imported records into',
  updated: 'updated',
  generated: 'generated concepts in',
  viewed: 'reviewed',
};

function phrase(action: string) {
  return ACTION_PHRASES[action] ?? action.replace(/_/g, ' ');
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function ActivityView({
  entries, users, offerIndex, catalogueCount, currentUserId,
}: {
  entries: ActivityEntry[];
  users: Actor[];
  offerIndex: OfferRef[];
  catalogueCount: number;
  currentUserId: string;
}) {
  const [entity, setEntity] = useState('all');
  const [actor, setActor] = useState('all');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [grouped, setGrouped] = useState(true);

  const actorById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const offerById = useMemo(() => new Map(offerIndex.map(o => [o.id, o])), [offerIndex]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const windowMs = range === '24h' ? 86400000 : range === '7d' ? 7 * 86400000 : range === '30d' ? 30 * 86400000 : null;
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (entity !== 'all' && e.entityType !== entity) return false;
      if (actor !== 'all' && e.actorId !== actor) return false;
      if (mineOnly && e.actorId !== currentUserId) return false;
      if (windowMs != null && now - Date.parse(e.createdAt) > windowMs) return false;
      if (q) {
        const hay = `${actorById.get(e.actorId)?.name ?? ''} ${e.action} ${e.entityLabel} ${e.detail ?? ''} ${e.entityType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, entity, actor, query, range, mineOnly, currentUserId, actorById]);

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    entries.forEach(e => byType.set(e.entityType, (byType.get(e.entityType) ?? 0) + 1));
    return byType;
  }, [entries]);

  const byActor = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => map.set(e.actorId, (map.get(e.actorId) ?? 0) + 1));
    return Array.from(map, ([id, n]) => ({ id, n, actor: actorById.get(id) })).sort((a, b) => b.n - a.n);
  }, [filtered, actorById]);

  const days = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    filtered.forEach(e => {
      const k = dayKey(e.createdAt);
      map.set(k, [...(map.get(k) ?? []), e]);
    });
    return Array.from(map, ([key, list]) => ({ key, list })).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  const hrefFor = (e: ActivityEntry): string | null => {
    switch (e.entityType) {
      case 'offer':
      case 'comment':
      case 'approval':
        return offerById.has(e.entityId) ? `/offers/${e.entityId}` : '/offers';
      case 'campaign': return '/campaigns';
      case 'catalogue':
      case 'import': return '/catalogue';
      case 'settings': return '/settings';
      case 'ai': return '/generate';
      default: return null;
    }
  };

  const exportCsv = () => {
    const header = ['When', 'Who', 'Role', 'Action', 'Entity type', 'Entity', 'Reference', 'Detail'];
    const rows = filtered.map(e => {
      const a = actorById.get(e.actorId);
      const offer = offerById.get(e.entityId);
      return [
        new Date(e.createdAt).toISOString(), a?.name ?? e.actorId, a?.role ?? '', e.action,
        e.entityType, e.entityLabel, offer?.code ?? e.entityId, e.detail ?? '',
      ];
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `p57-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const busy = byActor[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Activity &amp; audit</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
            Every action taken in this workspace, who took it and what it changed. The log is append-only: nothing here is
            editable, and nothing is reconstructed after the fact.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>Export as CSV</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Events recorded" value={entries.length} hint="Most recent 400 shown" />
        <StatTile label="Events shown" value={filtered.length} hint={filtered.length === entries.length ? 'No filters applied' : 'Matching the filters below'} />
        <StatTile label="People involved" value={byActor.length} hint={busy?.actor ? `${busy.actor.name} leads with ${busy.n}` : '—'} />
        <StatTile label="Catalogue records" value={catalogueCount} hint="Traceable to the original source rows" />
      </div>

      <Card>
        <CardHeader
          title="Filters"
          subtitle="Narrow to one entity type, one person, or your own trail"
          action={<Button size="sm" variant="ghost" onClick={() => { setEntity('all'); setActor('all'); setQuery(''); setRange('all'); setMineOnly(false); }}>Clear</Button>}
        />
        <div className="space-y-3 px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {[['all', 'Everything'], ...Object.entries(ENTITY_LABELS).map(([k, v]) => [k, v] as [string, string])].map(([key, label]) => {
              const n = key === 'all' ? entries.length : counts.get(key) ?? 0;
              return (
                <button
                  key={key}
                  onClick={() => setEntity(key)}
                  disabled={key !== 'all' && n === 0}
                  className={cn(
                    'rounded-full border px-3 py-1 text-2xs transition disabled:opacity-40',
                    entity === key
                      ? 'border-ink-900 bg-ink-900 text-paper dark:border-ink-100 dark:bg-ink-100 dark:text-ink-900'
                      : 'border-line text-muted hover:border-ink-300 hover:text-ink',
                  )}
                >
                  {label} <span className="num ml-1 opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Search people, offers, actions…" value={query} onChange={e => setQuery(e.target.value)} />
            <Select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="all">Everyone</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select value={range} onChange={e => setRange(e.target.value)}>
              <option value="all">All time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </Select>
            <div className="flex items-center gap-4 lg:justify-end">
              <Toggle label="Only mine" checked={mineOnly} onChange={setMineOnly} />
              <Toggle label="Group by day" checked={grouped} onChange={setGrouped} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Trail" subtitle={`${filtered.length} of ${entries.length} recorded events`} />
          <div className="px-4 pb-4 pt-3">
            {filtered.length === 0 ? (
              <EmptyState
                title="Nothing matches those filters"
                description="Widen the entity type, clear the search, or include everyone. Actions taken across offers, campaigns, catalogue and settings are recorded here the moment they happen."
                action={<Button variant="secondary" onClick={() => { setEntity('all'); setActor('all'); setQuery(''); setRange('all'); setMineOnly(false); }}>Clear filters</Button>}
                compact
              />
            ) : grouped ? (
              <div className="space-y-5">
                {days.map(day => (
                  <div key={day.key}>
                    <div className="sticky top-0 z-10 -mx-1 bg-paper/95 px-1 py-1.5 backdrop-blur dark:bg-ink-900/95">
                      <p className="text-2xs font-medium uppercase tracking-wide text-muted">{dayLabel(day.key)}</p>
                    </div>
                    <ol className="mt-1">
                      {day.list.map((e, i) => (
                        <TrailRow key={e.id} entry={e} actor={actorById.get(e.actorId)} href={hrefFor(e)}
                          offer={offerById.get(e.entityId)} last={i === day.list.length - 1} />
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <ol>
                {filtered.map((e, i) => (
                  <TrailRow key={e.id} entry={e} actor={actorById.get(e.actorId)} href={hrefFor(e)}
                    offer={offerById.get(e.entityId)} last={i === filtered.length - 1} />
                ))}
              </ol>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Who is doing the work" subtitle="Across the events currently shown" />
            <div className="space-y-3 px-4 pb-4 pt-3">
              {byActor.length === 0 && <p className="text-[12.5px] text-muted">No events match the filters.</p>}
              {byActor.slice(0, 6).map(({ id, n, actor: a }) => (
                <div key={id} className="flex items-center gap-2.5">
                  <Avatar name={a?.name ?? id} color={a?.avatarColor} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-ink">{a?.name ?? id}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full rounded-full bg-clay-500" style={{ width: `${(n / (byActor[0]?.n || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="num shrink-0 text-2xs text-muted">{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="What is being touched" subtitle="Entity types in the recorded log" />
            <div className="space-y-2.5 px-4 pb-4 pt-3">
              {Object.entries(ENTITY_LABELS).map(([key, label]) => {
                const n = counts.get(key) ?? 0;
                const max = Math.max(...Object.values(ENTITY_LABELS).map((_, i) => counts.get(Object.keys(ENTITY_LABELS)[i]) ?? 0), 1);
                return (
                  <button key={key} onClick={() => setEntity(key)} disabled={n === 0}
                    className="flex w-full items-center gap-3 text-left disabled:opacity-40">
                    <span className="w-24 shrink-0 text-[12.5px] text-ink">{label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <span className="block h-full rounded-full bg-teal-500" style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span className="num w-8 shrink-0 text-right text-2xs text-muted">{n}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="How to read this log" subtitle="What it does and does not contain" />
            <div className="space-y-2.5 px-4 pb-4 pt-3 text-2xs leading-relaxed text-muted">
              <p><span className="text-ink">Actions only, not page views.</span> Opening a screen is not recorded; changing something, commenting, submitting, approving or importing is.</p>
              <p><span className="text-ink">Attribution is real.</span> Each entry carries the member who performed it — which is why switching member in the account menu changes the record it produces.</p>
              <p><span className="text-ink">No external audit trail is claimed.</span> This log lives in the workspace database. Nothing is forwarded to a SIEM, a CRM or a third party.</p>
              <p><span className="text-ink">Approval events are duplicated deliberately.</span> They appear both on the offer&rsquo;s own history and here, so a decision can be read in either context.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TrailRow({
  entry, actor, href, offer, last,
}: {
  entry: ActivityEntry; actor?: Actor; href: string | null; offer?: OfferRef; last: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-3.5">
      {!last && <span className="absolute left-[5px] top-5 h-full w-px bg-line" />}
      <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-paper bg-ink-300 dark:border-ink-900" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Avatar name={actor?.name ?? 'System'} color={actor?.avatarColor} size={20} />
          <p className="text-[12.5px] leading-snug text-ink">
            <span className="font-medium">{actor?.name ?? 'System'}</span>{' '}
            <span className="text-muted">{phrase(entry.action)}</span>{' '}
            {entry.entityLabel && <span>{entry.entityLabel}</span>}
          </p>
          <Badge tone={ENTITY_TONES[entry.entityType] ?? 'neutral'}>{ENTITY_LABELS[entry.entityType] ?? entry.entityType}</Badge>
          {offer?.code && <span className="num text-2xs text-muted">{offer.code}</span>}
        </div>
        {entry.detail && <p className="mt-1 text-2xs leading-relaxed text-muted">{entry.detail}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted/80">
          <span title={dateTimeLabel(entry.createdAt)}>{relativeTime(entry.createdAt)}</span>
          <span>·</span>
          <span>{dateTimeLabel(entry.createdAt)}</span>
          {href && (
            <>
              <span>·</span>
              <Link href={href} className="text-clay-600 hover:underline dark:text-clay-400">Open record →</Link>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
