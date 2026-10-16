'use client';

/**
 * Advanced offer editor (Module E) + review workspace.
 *
 * The split screen is genuine: the right-hand preview and every number are recomputed from the
 * deterministic pricing engine on each keystroke, using the same catalogue and settings the server
 * uses. Saving sends the version the editor loaded, so two people cannot silently overwrite
 * each other; the server recomputes and versions the record on the way in.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardHeader, Divider, Field, Input, Modal, Select, Tabs, Textarea, Toggle, cn, useToast,
} from '@/components/ui';
import { CannibalisationList, FinancialStrip, GuardrailList, MetricsFootnote, ScorecardPanel, StrategyBlocks, ValueBuildUp } from '@/components/financials';
import { ScenarioChart } from '@/components/charts';
import {
  AUDIENCE_LABELS, LOCATION_LABELS, OBJECTIVE_LABELS, STATUS_LABELS, STATUS_TONES, dateLabel, dateTimeLabel, inr, pct, relativeTime,
} from '@/lib/format';
import { computeOfferMetrics, simulateScenarios, GENERATION_PRESETS } from '@/lib/engine';
import type {
  AudienceSegment, Campaign, CatalogueProduct, Collection, Comment, CommercialObjective, ComputedMetrics,
  CostAssumptions, GuardrailConfig, AttendanceAssumptions, LocationId, Offer, OfferVersion, SimulationAssumptions, User,
} from '@/lib/types';

interface Props {
  offer: Offer;
  versions: OfferVersion[];
  approvals: { id: string; action: string; note: string | null; actorId: string; createdAt: string; version: number }[];
  comments: Comment[];
  performance: any[];
  catalogue: CatalogueProduct[];
  settings: { guardrails: GuardrailConfig; costs: CostAssumptions; attendance: AttendanceAssumptions; simulation: SimulationAssumptions };
  allOffers: Offer[];
  collections: Collection[];
  campaigns: Campaign[];
  users: User[];
  transitions: { action: string; to: string; label: string }[];
  can: { edit: boolean; approve: boolean; publish: boolean; simulate: boolean; create: boolean };
  commentsAllowed: boolean;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'edit', label: 'Editor' },
  { id: 'preview', label: 'Member preview' },
  { id: 'economics', label: 'Economics' },
  { id: 'simulate', label: 'Scenario simulator' },
  { id: 'collaborate', label: 'Collaboration' },
  { id: 'history', label: 'Versions & approvals' },
];

export function OfferWorkspace(props: Props) {
  const { offer, catalogue, settings, users, collections, campaigns, allOffers } = props;
  const router = useRouter();
  const { push } = useToast();

  const [draft, setDraft] = useState<Offer>(offer);
  const [history, setHistory] = useState<Offer[]>([offer]);
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<'overview' | 'edit' | 'preview' | 'economics' | 'simulate' | 'collaborate' | 'history'>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<{ error: string; conflicts?: any[] } | null>(null);
  const [messages, setMessages] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(props.comments);
  const [workflowNote, setWorkflowNote] = useState('');
  const [workflowOpen, setWorkflowOpen] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [sim, setSim] = useState<SimulationAssumptions>(settings.simulation);
  const [buyers, setBuyers] = useState<number | null>(settings.simulation.expectedBuyers);

  const ctx = useMemo(() => ({
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers,
  }), [catalogue, settings, allOffers]);

  const live = useMemo(() => computeOfferMetrics(draft, ctx), [draft, ctx]);
  const metrics: ComputedMetrics = live.metrics;

  const commit = useCallback((next: Offer) => {
    setDraft(next);
    setDirty(true);
    setHistory(h => {
      const trimmed = h.slice(0, cursor + 1);
      return [...trimmed, next].slice(-40);
    });
    setCursor(c => Math.min(c + 1, 39));
  }, [cursor]);

  const patch = useCallback((changes: Partial<Offer>) => {
    commit({ ...draft, ...changes });
  }, [commit, draft]);

  const patchTerms = useCallback((changes: Partial<Offer['terms']>) => {
    commit({ ...draft, terms: { ...draft.terms, ...changes } });
  }, [commit, draft]);

  const patchEligibility = useCallback((changes: Partial<Offer['eligibility']>) => {
    commit({ ...draft, eligibility: { ...draft.eligibility, ...changes } });
  }, [commit, draft]);

  const undo = () => {
    if (cursor === 0) return;
    setCursor(cursor - 1); setDraft(history[cursor - 1]); setDirty(true);
  };
  const redo = () => {
    if (cursor >= history.length - 1) return;
    setCursor(cursor + 1); setDraft(history[cursor + 1]); setDirty(true);
  };
  const reset = () => { setDraft(offer); setHistory([offer]); setCursor(0); setDirty(false); push({ title: 'Editor reset to the saved version' }); };

  const base = draft.baseProductId ? catalogue.find(p => p.id === draft.baseProductId) ?? null : null;

  async function save(note?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedVersion: offer.version, saveNote: note }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409) { setConflict({ error: json.error, conflicts: json.conflicts }); return; }
        push({ title: 'Could not save', description: json.error, tone: 'danger' });
        return;
      }
      setDraft(json.offer);
      setHistory([json.offer]); setCursor(0); setDirty(false); setConflict(null);
      push({
        title: `Saved as v${json.offer.version}`,
        description: json.requiresReapproval
          ? 'Commercial terms changed after approval — this offer now needs re-approval before it can be published.'
          : (json.warnings?.length ? json.warnings.join(' ') : 'Every figure was recomputed by the pricing engine.'),
        tone: json.requiresReapproval ? 'warning' : 'default',
      });
      router.refresh();
    } finally { setSaving(false); }
  }

  async function runWorkflow(action: string) {
    setBusy(action);
    try {
      const res = await fetch(`/api/offers/${offer.id}/workflow`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: workflowNote, version: draft.version }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: `Could not ${action.replace('_', ' ')}`, description: json.error, tone: 'danger' }); return; }
      setDraft(json.offer);
      setWorkflowOpen(null); setWorkflowNote('');
      push({ title: `Offer ${action === 'request_changes' ? 'sent back for changes' : action + 'd'}`, description: json.offer.name });
      router.refresh();
    } finally { setBusy(null); }
  }

  async function postComment() {
    if (!comment.trim()) return;
    setBusy('comment');
    try {
      const res = await fetch(`/api/offers/${offer.id}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: comment }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not post', description: json.error, tone: 'danger' }); return; }
      setComments(json.comments); setComment('');
    } finally { setBusy(null); }
  }

  async function remix(action: string) {
    setBusy(action);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'remix', offerId: offer.id, action }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Remix failed', description: json.error, tone: 'danger' }); return; }
      setProposal(json.proposal);
    } finally { setBusy(null); }
  }

  function applyProposal() {
    if (!proposal) return;
    commit({
      ...draft,
      name: proposal.name,
      description: proposal.strategy.concept,
      baseProductId: proposal.baseProductId,
      components: proposal.components,
      terms: proposal.terms,
      audienceSegments: proposal.audienceSegments,
      objectives: proposal.objectives,
      tags: Array.from(new Set([...draft.tags, ...proposal.tags, 'remixed'])),
    });
    setProposal(null);
    setTab('edit');
    push({ title: 'Remix applied to the editor', description: 'Review the numbers, then save to version it.' });
  }

  async function loadMessages() {
    setBusy('messages');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'messages', offerId: offer.id }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not generate copy', description: json.error, tone: 'danger' }); return; }
      setMessages(json);
      setTab('preview');
    } finally { setBusy(null); }
  }

  async function restoreVersion(version: number) {
    setBusy(`restore-${version}`);
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'restore_version', version }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not restore', description: json.error, tone: 'danger' }); return; }
      setDraft(json.offer); setHistory([json.offer]); setCursor(0);
      push({ title: `Restored version ${version}`, description: 'Saved as a new version — nothing was overwritten.' });
      router.refresh();
    } finally { setBusy(null); }
  }

  const simulation = useMemo(() => simulateScenarios({
    economics: live.economics, assumptions: { ...sim, expectedBuyers: buyers },
    buyersOverride: buyers, baseProduct: base,
  }), [live, sim, buyers, base]);

  const blockers = metrics.guardrails.filter(g => !g.passed && g.severity === 'blocker');
  const warnings = metrics.guardrails.filter(g => !g.passed && g.severity === 'warning');

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
            <span className="font-mono text-2xs text-muted">{draft.code} · v{draft.version}</span>
            {draft.approvedVersion ? <Badge tone="teal">Approved v{draft.approvedVersion}</Badge> : null}
            {draft.requiresReapproval && <Badge tone="danger">Re-approval required</Badge>}
            {draft.conceptOnly && <Badge tone="outline">Concept only — never run in market</Badge>}
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </div>
          <input
            value={draft.name}
            onChange={e => patch({ name: e.target.value })}
            className="mt-1.5 w-full max-w-3xl border-0 bg-transparent p-0 font-display text-[28px] leading-tight tracking-tight text-ink focus:outline-none"
          />
          <p className="mt-1 text-[12.5px] text-muted">
            {draft.baseProductName ?? 'No base package'} · {draft.locationIds.map(l => LOCATION_LABELS[l] ?? l).join(' · ')} ·
            owner {users.find(u => u.id === draft.ownerId)?.name ?? '—'} · updated {relativeTime(draft.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={undo} disabled={cursor === 0}>Undo</Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={cursor >= history.length - 1}>Redo</Button>
          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
          <Button variant="secondary" size="sm" onClick={() => remix('increase_perceived_value')} loading={busy === 'increase_perceived_value'}>Remix</Button>
          <Button variant="primary" size="sm" onClick={() => save()} loading={saving} disabled={!props.can.edit}>Save draft</Button>
        </div>
      </header>

      {conflict && (
        <Alert tone="danger" title="Someone else saved this offer first">
          <p>{conflict.error}</p>
          {conflict.conflicts?.length ? (
            <ul className="mt-2 space-y-1">
              {conflict.conflicts.map((c: any, i: number) => (
                <li key={i} className="text-2xs">
                  <span className="font-medium">{c.field}:</span> on the server {JSON.stringify(c.current).slice(0, 90)} vs your {JSON.stringify(c.submitted).slice(0, 90)}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => { setDraft(offer); setHistory([offer]); setCursor(0); setConflict(null); router.refresh(); }}>Reload latest</Button>
            <Button size="sm" variant="secondary" onClick={() => save()}>Overwrite with mine</Button>
          </div>
        </Alert>
      )}

      {blockers.length > 0 && (
        <Alert tone="warning" title={`${blockers.length} guardrail blocker${blockers.length === 1 ? '' : 's'} in the way of approval`}>
          {blockers.map(b => b.detail).join(' ')}
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="border-b border-line px-3 py-2">
              <Tabs tabs={TABS.map(t => ({ key: t.id, label: t.label }))} value={tab} onChange={id => setTab(id as any)} />
            </div>

            {/* ------------------------------------------------------------ overview */}
            {tab === 'overview' && (
              <div className="space-y-4 p-4">
                <FinancialStrip metrics={metrics} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Strategy" subtitle="Calculated facts, estimates, assumptions and recommendations are kept separate" dense />
                    <div className="p-3">
                      <StrategyBlocks strategy={{ ...draft.generationContext?.notes?.length ? {} as any : {}, ...(proposal?.strategy ?? proposalStrategyFor(draft, metrics, base)) }} />
                    </div>
                  </Card>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader title="Scorecard" dense />
                      <div className="p-3"><ScorecardPanel scorecard={metrics.scorecard} /></div>
                    </Card>
                    <Card>
                      <CardHeader title="Displacement & cannibalisation" dense />
                      <div className="p-3"><CannibalisationList findings={metrics.cannibalisation} /></div>
                    </Card>
                  </div>
                </div>
                <Card>
                  <CardHeader title="Commercial guardrails" subtitle="Thresholds configured for this workspace — not platform-wide policy" dense />
                  <div className="p-3"><GuardrailList findings={metrics.guardrails} /></div>
                </Card>
              </div>
            )}

            {/* ------------------------------------------------------------ editor */}
            {tab === 'edit' && (
              <div className="space-y-5 p-4">
                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Identity</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Offer name" hint="Member-facing. The naming helper can propose alternatives.">
                      <div className="flex gap-2">
                        <Input value={draft.name} onChange={e => patch({ name: e.target.value })} />
                        <NameSuggestions audience={draft.audienceSegments} objectives={draft.objectives} baseName={base?.name} onPick={name => patch({ name })} />
                      </div>
                    </Field>
                    <Field label="Internal title" hint="For the team — what this offer actually is.">
                      <Input value={draft.internalTitle ?? ''} onChange={e => patch({ internalTitle: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Description" hint="The commercial logic in plain language.">
                    <Textarea rows={3} value={draft.description} onChange={e => patch({ description: e.target.value })} />
                  </Field>
                  <Field label="Promo copy" hint="What goes to members. Generate the full set from the preview tab.">
                    <Textarea rows={2} value={draft.promoCopy} onChange={e => patch({ promoCopy: e.target.value })} />
                  </Field>
                </section>

                <Divider />

                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Audience, objective and location</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Base package" hint="Everything is priced against this catalogue product.">
                      <Select value={draft.baseProductId ?? ''} onChange={e => {
                        const p = catalogue.find(x => x.id === e.target.value) ?? null;
                        commit({
                          ...draft, baseProductId: p?.id ?? null, baseProductName: p?.name ?? null,
                          locationIds: p ? [p.locationId] : draft.locationIds,
                          terms: { ...draft.terms, validityDays: p?.duration && p.durationUnit ? durationDays(p.duration, p.durationUnit) : draft.terms.validityDays },
                        });
                      }}>
                        <option value="">No base package</option>
                        {catalogue.filter(p => p.price != null && p.price > 0).map(p => (
                          <option key={p.id} value={p.id}>{p.name} — {inr(p.price)} · {p.locationName}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Locations" hint="A membership sold at one studio is not redeemable at another unless you say so here.">
                      <MultiSelect
                        options={Object.entries(LOCATION_LABELS).map(([id, label]) => ({ id, label }))}
                        selected={draft.locationIds as string[]}
                        onChange={ids => commit({ ...draft, locationIds: ids as LocationId[], eligibility: { ...draft.eligibility, locationIds: ids as LocationId[] } })}
                      />
                    </Field>
                    <Field label="Collections">
                      <MultiSelect
                        options={collections.map(c => ({ id: c.id, label: c.name }))}
                        selected={draft.collectionIds}
                        onChange={ids => patch({ collectionIds: ids })}
                      />
                    </Field>
                    <Field label="Audience segments">
                      <MultiSelect
                        options={Object.entries(AUDIENCE_LABELS).map(([id, label]) => ({ id, label }))}
                        selected={draft.audienceSegments as string[]}
                        onChange={ids => patch({ audienceSegments: ids as AudienceSegment[] })}
                      />
                    </Field>
                    <Field label="Objectives">
                      <MultiSelect
                        options={Object.entries(OBJECTIVE_LABELS).map(([id, label]) => ({ id, label }))}
                        selected={draft.objectives as string[]}
                        onChange={ids => patch({ objectives: ids as CommercialObjective[] })}
                      />
                    </Field>
                    <Field label="Campaign">
                      <Select value={draft.campaignId ?? ''} onChange={e => patch({ campaignId: e.target.value || null })}>
                        <option value="">Not linked to a campaign</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                </section>

                <Divider />

                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Commercial terms</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Pricing mode">
                      <Select value={draft.terms.pricingMode} onChange={e => patchTerms({ pricingMode: e.target.value as any })}>
                        <option value="discount_pct">Percentage discount</option>
                        <option value="discount_amount">Fixed amount off</option>
                        <option value="fixed_price">Fixed price</option>
                        <option value="value_add">List price + added value</option>
                      </Select>
                    </Field>
                    {draft.terms.pricingMode === 'discount_pct' && (
                      <Field label="Discount %" hint={base ? `List ${inr(base.price)} → ${inr(Math.round((base.price ?? 0) * (1 - (draft.terms.discountPct ?? 0) / 100)))}` : undefined}>
                        <Input type="number" value={draft.terms.discountPct ?? 0} onChange={e => patchTerms({ discountPct: Number(e.target.value) })} />
                      </Field>
                    )}
                    {draft.terms.pricingMode === 'discount_amount' && (
                      <Field label="Amount off (₹)">
                        <Input type="number" value={draft.terms.discountAmount ?? 0} onChange={e => patchTerms({ discountAmount: Number(e.target.value) })} />
                      </Field>
                    )}
                    {draft.terms.pricingMode === 'fixed_price' && (
                      <Field label="Selling price (₹)">
                        <Input type="number" value={draft.terms.sellingPrice ?? 0} onChange={e => patchTerms({ sellingPrice: Number(e.target.value) })} />
                      </Field>
                    )}
                    <Field label="Included credits" hint={base?.unlimitedAccess ? 'Unlimited product — credits do not apply.' : 'Defaults to the base package.'}>
                      <Input type="number" disabled={Boolean(base?.unlimitedAccess)} value={draft.terms.creditsIncluded ?? ''} onChange={e => patchTerms({ creditsIncluded: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Bonus credits">
                      <Input type="number" value={draft.terms.bonusCredits ?? 0} onChange={e => patchTerms({ bonusCredits: Number(e.target.value) })} />
                    </Field>
                    <Field label="Complimentary classes">
                      <Input type="number" value={draft.terms.complimentaryClasses ?? 0} onChange={e => patchTerms({ complimentaryClasses: Number(e.target.value) })} />
                    </Field>
                    <Field label="Private sessions">
                      <Input type="number" value={draft.terms.privateSessions ?? 0} onChange={e => patchTerms({ privateSessions: Number(e.target.value) })} />
                    </Field>
                    <Field label="Guest passes">
                      <Input type="number" value={draft.terms.guestPasses ?? 0} onChange={e => patchTerms({ guestPasses: Number(e.target.value) })} />
                    </Field>
                    <Field label="Validity (days)" hint={base ? `Base package validity: ${metrics.listPrice ? base.duration ?? '—' : '—'} ${base.durationUnit ?? ''}` : undefined}>
                      <Input type="number" value={draft.terms.validityDays ?? ''} onChange={e => patchTerms({ validityDays: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Validity extension (days)">
                      <Input type="number" value={draft.terms.validityExtensionDays ?? 0} onChange={e => patchTerms({ validityExtensionDays: Number(e.target.value) })} />
                    </Field>
                    <Field label="Purchase deadline">
                      <Input type="date" value={draft.terms.purchaseDeadline ?? ''} onChange={e => patchTerms({ purchaseDeadline: e.target.value || null })} />
                    </Field>
                    <Field label="Redeemable from">
                      <Input type="date" value={draft.terms.redeemableFrom ?? ''} onChange={e => patchTerms({ redeemableFrom: e.target.value || null })} />
                    </Field>
                    <Field label="Redeemable until">
                      <Input type="date" value={draft.terms.redeemableTo ?? ''} onChange={e => patchTerms({ redeemableTo: e.target.value || null })} />
                    </Field>
                    <Field label="Offer expires on">
                      <Input type="date" value={draft.expiresOn ?? ''} onChange={e => patch({ expiresOn: e.target.value || null })} />
                    </Field>
                  </div>
                </section>

                <Divider />

                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Eligibility</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Toggle checked={draft.eligibility.newClientsOnly} onChange={v => patchEligibility({ newClientsOnly: v })} label="New clients only" hint="Members who have never purchased." />
                    <Toggle checked={draft.eligibility.existingMembersOnly} onChange={v => patchEligibility({ existingMembersOnly: v })} label="Existing members only" hint="Retention and win-back offers." />
                    <Toggle checked={draft.eligibility.lapsedOnly} onChange={v => patchEligibility({ lapsedOnly: v })} label="Lapsed members only" hint="Uses the observed lapse gap for the segment." />
                    <Toggle checked={draft.eligibility.requiresCode} onChange={v => patchEligibility({ requiresCode: v })} label="Requires a promo code" hint="Tracked against the code's observed performance." />
                    <Toggle checked={draft.eligibility.stackableWithOtherOffers} onChange={v => patchEligibility({ stackableWithOtherOffers: v })} label="Stackable with other offers" hint="Off by default — stacking is a margin decision." />
                    <Field label="Purchase limit per member">
                      <Input type="number" value={draft.eligibility.purchaseLimitPerMember ?? ''} onChange={e => patchEligibility({ purchaseLimitPerMember: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    {draft.eligibility.requiresCode && (
                      <Field label="Promo code">
                        <Input value={draft.eligibility.code ?? ''} onChange={e => patchEligibility({ code: e.target.value.toUpperCase() })} />
                      </Field>
                    )}
                    {draft.eligibility.lapsedOnly && (
                      <Field label="Minimum days since last visit">
                        <Input type="number" value={draft.eligibility.minLapsedDays ?? ''} onChange={e => patchEligibility({ minLapsedDays: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                    )}
                  </div>
                </section>

                <Divider />

                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Team notes</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Internal notes" hint="Never shown to members.">
                      <Textarea rows={3} value={draft.internalNotes} onChange={e => patch({ internalNotes: e.target.value })} />
                    </Field>
                    <Field label="Tags" hint="Comma separated. Used for smart filters in the bank.">
                      <Input value={draft.tags.join(', ')} onChange={e => patch({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
                    </Field>
                  </div>
                </section>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button variant="primary" onClick={() => save('Edited in the workspace')} loading={saving}>Save as new version</Button>
                  <Button variant="secondary" onClick={() => setTab('preview')}>Check member preview</Button>
                  <Button variant="ghost" onClick={() => setTab('economics')}>See economics</Button>
                  <span className="ml-auto text-2xs text-muted">
                    Undo history: {history.length} state{history.length === 1 ? '' : 's'} · engine v{metrics.engineVersion}
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ preview */}
            {tab === 'preview' && (
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Member-facing preview</h3>
                    <Button size="sm" variant="secondary" onClick={loadMessages} loading={busy === 'messages'}>Generate full copy set</Button>
                  </div>
                  <OfferPreviewCard offer={draft} metrics={{ ...metrics, valueBuildUp: live.economics.valueBuildUp, privateSessions: live.economics.privateSessions, guestPasses: live.economics.guestPasses }} headline={messages?.messages?.headline} />
                  {messages && (
                    <Alert tone="info" title={messages.note ?? 'Copy generated'}>
                      Facts used: {messages.messages?.factsUsed?.join(' · ')}
                    </Alert>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">Channel copy</h3>
                  {!messages && (
                    <Card><div className="p-4 text-[12.5px] leading-relaxed text-muted">
                      Generate the copy set to see the WhatsApp messages, email, verbal script, headline and campaign description.
                      Every number is injected from the engine&rsquo;s live calculation, so the copy can never quote a price the offer does not have.
                    </div></Card>
                  )}
                  {messages && (
                    <div className="space-y-3">
                      {[
                        { label: 'Headline', body: messages.polished?.headline ?? messages.messages.headline },
                        { label: 'WhatsApp — short', body: messages.messages.whatsappShort },
                        { label: 'WhatsApp — detailed', body: messages.messages.whatsappDetailed },
                        { label: 'Email subject', body: messages.messages.emailSubject },
                        { label: 'Email body', body: messages.messages.emailBody },
                        { label: 'Verbal script (front desk)', body: messages.polished?.verbalScript ?? messages.messages.verbalScript },
                        { label: 'Campaign description', body: messages.messages.campaignDescription },
                        { label: 'Social caption', body: messages.messages.socialCaption },
                      ].map(block => (
                        <Card key={block.label}>
                          <CardHeader dense title={<span className="text-[12.5px]">{block.label}</span>}
                            action={<button className="text-2xs text-clay-600 hover:underline dark:text-clay-400"
                              onClick={() => { navigator.clipboard?.writeText(block.body ?? ''); push({ title: 'Copied' }); }}>Copy</button>} />
                          <pre className="whitespace-pre-wrap px-3.5 py-3 font-sans text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">{block.body}</pre>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ economics */}
            {tab === 'economics' && (
              <div className="space-y-4 p-4">
                <FinancialStrip metrics={metrics} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="What the member receives, and at what rate" dense />
                    <div className="space-y-3 p-3">
                      <ValueBuildUp metrics={metrics} />
                      <table className="w-full text-[12.5px]">
                        <tbody>
                          {live.economics.valueBuildUp.map((v, i) => (
                            <tr key={i} className="border-b border-line last:border-0">
                              <td className="py-1.5 text-ink">{v.label}</td>
                              <td className="py-1.5 text-right text-muted">×{v.quantity}</td>
                              <td className="py-1.5 text-right text-muted">{inr(v.unitValue)}</td>
                              <td className="py-1.5 text-right num text-ink">{v.value ? inr(v.value) : 'not priced'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-2xs leading-relaxed text-muted">
                        Total member value at catalogue rates: <span className="num text-ink">{inr(metrics.customerValueReceived)}</span> ·
                        they pay <span className="num text-ink">{inr(metrics.sellingPrice)}</span>
                        {metrics.customerSavingsPct ? <> — <span className="num text-ink">{pct(metrics.customerSavingsPct)}</span> below the rate card</> : null}.
                      </p>
                    </div>
                  </Card>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader title="Revenue and dilution" dense />
                      <div className="space-y-2 p-3 text-[12.5px]">
                        <Row label="Revenue per sale vs base package" value={`${(metrics.revenueDeltaVsReference ?? 0) >= 0 ? '+' : ''}${inr(metrics.revenueDeltaVsReference)}`} note={`Retention ${metrics.revenueRetentionPct ? pct(metrics.revenueRetentionPct) : '—'} of list price`} />
                        <Row label="Sales needed to match one list-price sale" value={metrics.breakEvenUnits ? `${metrics.breakEvenUnits}` : '—'} note="Break-even on revenue, ignoring delivery cost" />
                        <Row label="Value per rupee paid" value={metrics.valuePerRupee ? `${metrics.valuePerRupee.toFixed(2)}×` : '—'} note="At catalogue rates" />
                        <Row label="Contribution after delivery" value={metrics.contributionMargin != null ? inr(metrics.contributionMargin) : 'Not calculated'}
                          note={metrics.costBasis ?? 'No cost data supplied. Revenue is not profit, so margin stays blank until costs are configured in Settings.'} />
                      </div>
                    </Card>
                    <Card>
                      <CardHeader title="Cannibalisation detector" dense />
                      <div className="p-3"><CannibalisationList findings={metrics.cannibalisation} /></div>
                    </Card>
                  </div>
                </div>
                <MetricsFootnote metrics={metrics} />
              </div>
            )}

            {/* ------------------------------------------------------------ simulate */}
            {tab === 'simulate' && (
              <div className="space-y-4 p-4">
                <Alert tone="info" title="Projection, not a forecast">
                  Every figure below is arithmetic on the assumptions shown. Buyers, displacement and delivery cost are your
                  inputs. Nothing here predicts what this offer will do — it shows what would follow from these numbers.
                </Alert>
                <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                  <Card>
                    <CardHeader dense title="Assumptions" subtitle="Editable — nothing is hidden" />
                    <div className="space-y-3 p-3">
                      <Field label="Expected buyers" hint={settings.simulation.expectedBuyers == null ? 'No default set — enter your own view.' : `Workspace default: ${settings.simulation.expectedBuyers}`}>
                        <Input type="number" value={buyers ?? ''} onChange={e => setBuyers(e.target.value === '' ? null : Number(e.target.value))} />
                      </Field>
                      <Field label="Displacement — share of buyers who would have bought anyway (%)">
                        <Input type="number" value={sim.cannibalisationRatePct ?? 0} onChange={e => setSim(s => ({ ...s, cannibalisationRatePct: Number(e.target.value) }))} />
                      </Field>
                      <Field label="Delivery cost per class visit (₹)" hint="Leave blank to show contribution before delivery costs.">
                        <Input type="number" value={sim.deliveryCostPerClass ?? ''} onChange={e => setSim(s => ({ ...s, deliveryCostPerClass: e.target.value === '' ? null : Number(e.target.value) }))} />
                      </Field>
                      <Field label="Attendance per month (unlimited products)">
                        <Input type="number" value={sim.attendancePerMonth ?? metrics.attendanceAssumption?.visitsPerMonth ?? ''} onChange={e => setSim(s => ({ ...s, attendancePerMonth: e.target.value === '' ? null : Number(e.target.value) }))} />
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        {(['conservative', 'expected', 'optimistic'] as const).map(sc => (
                          <Field key={sc} label={`${sc.slice(0, 4)}×`}>
                            <Input type="number" step="0.05" value={sim.scenarioMultipliers[sc]} onChange={e => setSim(s => ({ ...s, scenarioMultipliers: { ...s.scenarioMultipliers, [sc]: Number(e.target.value) } }))} />
                          </Field>
                        ))}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => { setSim(settings.simulation); setBuyers(settings.simulation.expectedBuyers); }}>Reset to workspace defaults</Button>
                    </div>
                  </Card>

                  <div className="space-y-4">
                    {!simulation.ready ? (
                      <Card><div className="p-4 text-[12.5px] text-muted">{simulation.blockers.join(' ')}</div></Card>
                    ) : (
                      <>
                        <ScenarioChart data={simulation.scenarios.map(r => ({ scenario: r.scenario, revenue: r.grossRevenue, incremental: r.incrementalRevenue, contribution: r.contribution }))} />
                        <Card>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-[12.5px]">
                              <thead>
                                <tr className="border-b border-line text-2xs uppercase tracking-[0.08em] text-muted">
                                  <th className="px-3 py-2 text-left">Scenario</th>
                                  <th className="px-3 py-2 text-right">Buyers</th>
                                  <th className="px-3 py-2 text-right">Gross revenue</th>
                                  <th className="px-3 py-2 text-right">Displaced</th>
                                  <th className="px-3 py-2 text-right">Incremental</th>
                                  <th className="px-3 py-2 text-right">Delivery cost</th>
                                  <th className="px-3 py-2 text-right">Contribution</th>
                                </tr>
                              </thead>
                              <tbody>
                                {simulation.scenarios.map(r => (
                                  <tr key={r.scenario} className="border-b border-line last:border-0">
                                    <td className="px-3 py-2 capitalize text-ink">{r.scenario} <span className="text-2xs text-muted">({r.multiplier}×)</span></td>
                                    <td className="px-3 py-2 text-right num">{r.buyers}</td>
                                    <td className="px-3 py-2 text-right num">{inr(r.grossRevenue)}</td>
                                    <td className="px-3 py-2 text-right num text-muted">{inr(r.displacedRevenue)}</td>
                                    <td className={cn('px-3 py-2 text-right num', r.incrementalRevenue < 0 ? 'text-clay-600 dark:text-clay-400' : 'text-ink')}>{inr(r.incrementalRevenue)}</td>
                                    <td className="px-3 py-2 text-right num text-muted">{r.deliveryCost ? inr(r.deliveryCost) : '—'}</td>
                                    <td className="px-3 py-2 text-right num text-ink">{simulation.scenarios[0].deliveryCost || sim.deliveryCostPerClass != null ? inr(r.contribution) : 'costs off'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </Card>
                        <Card>
                          <CardHeader dense title="Recommendation from these assumptions" />
                          <div className="space-y-2 p-3 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                            <p>{simulation.recommendation}</p>
                            <details>
                              <summary className="cursor-pointer text-2xs uppercase tracking-[0.08em] text-muted">Assumption trace</summary>
                              <ul className="mt-2 space-y-1">
                                {simulation.assumptionTrace.map((t, i) => <li key={i} className="text-2xs text-muted">{t}</li>)}
                              </ul>
                            </details>
                            <p className="text-2xs text-muted">{simulation.disclaimer}</p>
                          </div>
                        </Card>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ collaborate */}
            {tab === 'collaborate' && (
              <div className="space-y-4 p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <Card>
                    <CardHeader dense title="Discussion" subtitle="Use @name to notify a colleague — mentions become notifications" />
                    <div className="space-y-3 p-3">
                      <div className="space-y-3">
                        {comments.length === 0 && <p className="text-[12.5px] text-muted">No comments yet. Reviews go faster when the reasoning is written down next to the numbers.</p>}
                        {comments.map(c => (
                          <div key={c.id} className="rounded-lg border border-line p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[12.5px] font-medium text-ink">{users.find(u => u.id === c.authorId)?.name ?? 'Someone'}</span>
                              <span className="text-2xs text-muted">{dateTimeLabel(c.createdAt)}</span>
                              {c.mentions.length > 0 && <Badge tone="clay">{c.mentions.length} mention{c.mentions.length === 1 ? '' : 's'}</Badge>}
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">{c.body}</p>
                          </div>
                        ))}
                      </div>
                      {props.commentsAllowed ? (
                        <div className="space-y-2">
                          <Textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ask a question, flag a risk, or @mention a reviewer…" />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="primary" onClick={postComment} loading={busy === 'comment'} disabled={!comment.trim()}>Post comment</Button>
                            <span className="text-2xs text-muted">{users.map(u => `@${u.name.split(' ')[0]}`).join(' · ')}</span>
                          </div>
                        </div>
                      ) : <p className="text-2xs text-muted">Your role can read the discussion but not post to it.</p>}
                    </div>
                  </Card>

                  <div className="space-y-4">
                    <Card>
                      <CardHeader dense title="Ownership" subtitle="Who is responsible for this offer" />
                      <div className="space-y-2 p-3">
                        <p className="text-[12.5px] text-ink">Owner: <span className="font-medium">{users.find(u => u.id === draft.ownerId)?.name ?? '—'}</span></p>
                        <p className="text-[12.5px] text-ink">Collaborators:</p>
                        <ul className="space-y-1">
                          {draft.collaboratorIds.length === 0 && <li className="text-2xs text-muted">No collaborators yet.</li>}
                          {draft.collaboratorIds.map(id => <li key={id} className="text-2xs text-muted">{users.find(u => u.id === id)?.name ?? id}</li>)}
                        </ul>
                        <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>Assign a colleague</Button>
                      </div>
                    </Card>
                    <Card>
                      <CardHeader dense title="Concurrent editing" subtitle="Two people cannot silently overwrite each other" />
                      <div className="p-3 text-2xs leading-relaxed text-muted">
                        This editor loaded version {offer.version}. Saving sends that version to the server: if someone else
                        saved in the meantime you will be asked to compare rather than losing either set of changes.
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ history */}
            {tab === 'history' && (
              <div className="space-y-4 p-4">
                <Card>
                  <CardHeader dense title="Version history" subtitle="Every save is a version with a diff summary and an author" />
                  <div className="divide-y divide-line">
                    {props.versions.map(v => (
                      <div key={v.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="num w-8 shrink-0 text-[13px] text-ink">v{v.version}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] text-ink">{v.changeSummary}</p>
                          <p className="mt-0.5 text-2xs text-muted">
                            {users.find(u => u.id === v.authorId)?.name ?? 'System'} · {dateTimeLabel(v.createdAt)} · state {v.approvalState}
                            {v.changedFields.length ? ` · changed: ${v.changedFields.join(', ')}` : ''}
                          </p>
                        </div>
                        {props.can.edit && v.version !== offer.version && (
                          <Button size="sm" variant="ghost" onClick={() => restoreVersion(v.version)} loading={busy === `restore-${v.version}`}>Restore</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardHeader dense title="Approval trail" subtitle="Who decided what, on which version, and why" />
                  <div className="divide-y divide-line">
                    {props.approvals.map(a => (
                      <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                        <Badge tone={a.action === 'approve' ? 'success' : a.action === 'request_changes' ? 'warning' : 'outline'}>{a.action.replace(/_/g, ' ')}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] text-ink">{users.find(u => u.id === a.actorId)?.name ?? 'Someone'} on v{a.version}</p>
                          {a.note && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{a.note}</p>}
                        </div>
                        <span className="text-2xs text-muted">{dateTimeLabel(a.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                {props.performance.length > 0 && (
                  <Card>
                    <CardHeader dense title="Performance records" subtitle="Observed outcomes, labelled with their source — never estimates" />
                    <div className="divide-y divide-line">
                      {props.performance.map((p: any) => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-[12.5px] text-ink">{p.label}</span>
                          <span className="num ml-auto text-[13px] text-ink">{Number(p.actual ?? 0).toLocaleString('en-IN')} {p.unit}</span>
                          <span className="hidden text-2xs text-muted sm:block">{p.period}</span>
                        </div>
                      ))}
                    </div>
                    <p className="px-4 pb-3 text-2xs leading-relaxed text-muted">
                      Recorded from the supplied Bengaluru exports and labelled &ldquo;observed … not an estimate&rdquo;. Newly designed
                      offers have no performance records until they run.
                    </p>
                  </Card>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------------ right rail */}
        <aside className="space-y-4">
          <Card>
            <CardHeader dense title="Live economics" subtitle="Recomputed on every keystroke" action={<Badge tone="teal">Engine v{metrics.engineVersion}</Badge>} />
            <div className="space-y-2.5 p-3">
              <Row label="Selling price" value={inr(metrics.sellingPrice)} big />
              <Row label="Discount" value={metrics.discountPct ? `${pct(metrics.discountPct)} · ${inr(metrics.discountAmount)}` : 'None'} />
              <Row label={metrics.attendanceAssumption ? 'Cost per visit' : 'Price per class'} value={inr(metrics.effectivePricePerClass ?? metrics.effectivePricePerVisit)} />
              <Row label="Member value received" value={inr(metrics.customerValueReceived)} />
              <Row label="Revenue vs list" value={`${(metrics.revenueDeltaVsReference ?? 0) >= 0 ? '+' : ''}${inr(metrics.revenueDeltaVsReference)}`} />
              <Row label="Scorecard" value={`${metrics.scorecard.overall.toFixed(1)} / 10`} note="Heuristic, not a prediction" />
              {metrics.attendanceAssumption && (
                <Alert tone="info" title="Unlimited product">
                  Priced at {metrics.attendanceAssumption.visitsPerMonth} visits/month — {metrics.attendanceAssumption.source}.
                </Alert>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader dense title="Workflow" subtitle={STATUS_LABELS[draft.status]} />
            <div className="space-y-2 p-3">
              <p className="text-2xs leading-relaxed text-muted">
                {draft.status === 'draft' && 'Draft — visible to the owner and collaborators. Submit it when the numbers hold.'}
                {draft.status === 'in_review' && 'Waiting on a manager or administrator. Changes requested will return it with a note.'}
                {draft.status === 'changes_requested' && 'A reviewer asked for changes. Amend and resubmit.'}
                {draft.status === 'approved' && 'Approved for the current version. Publishing makes it live for the team.'}
                {draft.status === 'published' && 'Live. Editing commercial terms triggers re-approval before the next publish.'}
                {draft.status === 'expired' && 'Past its window. Reopen as a draft to run it again.'}
                {draft.status === 'archived' && 'Retired but retained for history and reporting.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {props.transitions.map(t => (
                  <Button key={t.action} size="sm"
                    variant={t.action === 'approve' || t.action === 'publish' ? 'primary' : t.action === 'request_changes' ? 'secondary' : 'subtle'}
                    onClick={() => (['submit', 'approve', 'request_changes', 'reject', 'archive', 'reopen'].includes(t.action) ? setWorkflowOpen(t.action) : runWorkflow(t.action))}
                    loading={busy === t.action}>
                    {t.label}
                  </Button>
                ))}
                {props.transitions.length === 0 && <p className="text-2xs text-muted">No transitions available for your role at this status.</p>}
              </div>
              {dirty && <p className="text-2xs text-gold-600 dark:text-gold-300">Save your edits before submitting — the workflow acts on the saved version.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader dense title="Remix &amp; refine" subtitle="Engine-driven, applied to the editor for review" />
            <div className="grid gap-2 p-3">
              {[
                { action: 'more_attractive', label: 'Make more attractive' },
                { action: 'protect_revenue', label: 'Protect revenue' },
                { action: 'increase_perceived_value', label: 'Increase perceived value' },
                { action: 'reduce_discount', label: 'Reduce discount' },
                { action: 'add_twist', label: 'Add a creative twist' },
              ].map(a => (
                <Button key={a.action} size="sm" variant="secondary" onClick={() => remix(a.action)} loading={busy === a.action}>{a.label}</Button>
              ))}
              <Link href={`/compare?offers=${offer.id}`}><Button size="sm" variant="ghost" className="w-full">Compare this offer</Button></Link>
              <Button size="sm" variant="ghost" onClick={() => patch({ favourite: !draft.favourite })}>{draft.favourite ? '★ Remove favourite' : '☆ Add to favourites'}</Button>
              <Button size="sm" variant="ghost" onClick={() => patch({ pinned: !draft.pinned })}>{draft.pinned ? 'Unpin' : 'Pin to top'}</Button>
            </div>
          </Card>

          <Card>
            <CardHeader dense title="Status of the numbers" />
            <div className="space-y-2 p-3 text-2xs leading-relaxed text-muted">
              <p><span className="text-ink">Calculated:</span> price, discount, per-class rate, savings, revenue delta, guardrails, scorecard.</p>
              <p><span className="text-ink">Observed:</span> {base?.observed ? `${base.observed.units} sales of ${base.name} in the Bengaluru export.` : 'No observed sales for this base package.'}</p>
              <p><span className="text-ink">Projected:</span> only inside the simulator, from your own inputs.</p>
              <p><span className="text-ink">Not known:</span> {metrics.contributionMargin == null ? 'delivery cost — so margin is left blank.' : 'nothing material; costs are configured.'}</p>
            </div>
          </Card>
        </aside>
      </div>

      {/* ---------------- modals */}
      <Modal open={Boolean(proposal)} onClose={() => setProposal(null)} title="Remixed proposal" subtitle="Nothing is written until you apply it and save" width="xl"
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setProposal(null)}>Discard</Button>
          <Button variant="primary" onClick={applyProposal}>Apply to the editor</Button>
        </div>}>
        {proposal && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Row label="Name" value={proposal.name} />
              <Row label="Price" value={inr(proposal.economics.sellingPrice)} />
              <Row label="Per class" value={inr(proposal.economics.effectivePricePerClass ?? proposal.economics.effectivePricePerVisit)} />
            </div>
            <Alert tone="info" title="What changed">
              {(proposal.strategy?.facts ?? []).filter((f: string) => f.startsWith('Remix:')).join(' ') || proposal.strategy?.concept}
            </Alert>
            <StrategyBlocks strategy={proposal.strategy} />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(workflowOpen)} onClose={() => setWorkflowOpen(null)} title={`${workflowOpen?.replace('_', ' ')} — ${draft.name}`}
        subtitle="The note is stored on the approval trail and shown to the owner"
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setWorkflowOpen(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => workflowOpen && runWorkflow(workflowOpen)} loading={busy === workflowOpen}>Confirm</Button>
        </div>}>
        <Field label="Note (optional)" hint={workflowOpen === 'request_changes' ? 'Be specific — what has to change before this can be approved?' : undefined}>
          <Textarea rows={3} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign a colleague" subtitle="Collaborators can edit and comment; the owner stays accountable">
        <div className="space-y-2">
          {users.filter(u => u.id !== draft.ownerId && !draft.collaboratorIds.includes(u.id)).map(u => (
            <button key={u.id} onClick={async () => {
              const res = await fetch(`/api/offers/${offer.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'share', userId: u.id }) });
              if (res.ok) { const json = await res.json(); setDraft(json.offer); push({ title: `${u.name} added to this offer` }); router.refresh(); }
              setAssignOpen(false);
            }} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-800/40">
              <span className="text-ink">{u.name}</span>
              <span className="text-2xs text-muted">{u.title}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Row({ label, value, note, big }: { label: string; value: React.ReactNode; note?: string; big?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
        {note && <p className="mt-0.5 text-2xs leading-relaxed text-muted/80">{note}</p>}
      </div>
      <p className={cn('num shrink-0 text-right', big ? 'text-[20px] text-ink' : 'text-[13px] text-ink')}>{value}</p>
    </div>
  );
}

function MultiSelect({ options, selected, onChange }: { options: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
      {options.map(o => (
        <label key={o.id} className="flex items-center gap-2 text-[12px] text-ink-700 dark:text-ink-200">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={e => onChange(e.target.checked ? [...selected, o.id] : selected.filter(s => s !== o.id))} />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function NameSuggestions({ audience, objectives, baseName, onPick }: {
  audience: AudienceSegment[]; objectives: CommercialObjective[]; baseName?: string | null; onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<{ name: string; rationale: string }[]>([]);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={async () => {
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'names', audience, objectives }),
        });
        const json = await res.json();
        setNames(json.names ?? []); setOpen(true);
      }}>Names</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Suggested names" subtitle={baseName ? `Built around ${baseName}` : 'Based on the audience and objective'}>
        <div className="space-y-2">
          {names.map(n => (
            <button key={n.name} onClick={() => { onPick(n.name); setOpen(false); }}
              className="w-full rounded-lg border border-line px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/40">
              <p className="text-[13px] text-ink">{n.name}</p>
              <p className="text-2xs text-muted">{n.rationale}</p>
            </button>
          ))}
          <p className="text-2xs text-muted">Names come from the local naming engine (deterministic templates over your own brand language), never from a live model unless one is connected.</p>
        </div>
      </Modal>
    </>
  );
}

export function OfferPreviewCard({ offer, metrics, headline }: { offer: Offer; metrics: ComputedMetrics & { valueBuildUp?: any[]; privateSessions?: number; guestPasses?: number; bonusCredits?: number; complimentaryClasses?: number }; headline?: string }) {
  const credits = (metrics.includedCredits ?? 0) + (metrics.bonusCredits ?? 0) + (metrics.complimentaryClasses ?? 0);
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-b from-ink-50/70 to-paper p-5 dark:from-ink-800/50">
      <p className="text-2xs uppercase tracking-[0.16em] text-muted">{offer.locationIds.map(l => (LOCATION_LABELS[l] ?? l).split('—')[0].trim()).join(' · ')}</p>
      <h4 className="mt-2 font-display text-[24px] leading-tight tracking-tight text-ink">{headline ?? offer.name}</h4>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{offer.description}</p>
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <p className="text-2xs uppercase tracking-[0.1em] text-muted">Your price</p>
          <p className="num font-display text-[30px] leading-none text-ink">{inr(metrics.sellingPrice)}</p>
        </div>
        {metrics.discountAmount ? (
          <p className="text-[13px] text-muted line-through">{inr(metrics.listPrice)}</p>
        ) : null}
        {metrics.attendanceAssumption ? (
          <p className="text-[12.5px] text-muted">unlimited classes · {metrics.validityDays} days</p>
        ) : credits ? (
          <p className="text-[12.5px] text-muted">{credits} classes{metrics.validityDays ? ` · valid ${metrics.validityDays} days` : ''}</p>
        ) : null}
      </div>
      <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
        {(metrics.valueBuildUp ?? []).filter((v: any) => v.value > 0).map((v: any, i: number) => (
          <li key={i} className="flex items-center gap-2 text-[12.5px] text-ink-700 dark:text-ink-200">
            <span className="h-1.5 w-1.5 rounded-full bg-clay-400" />{v.label}
          </li>
        ))}
        {(metrics.privateSessions ?? 0) > 0 && <li className="flex items-center gap-2 text-[12.5px] text-ink-700 dark:text-ink-200"><span className="h-1.5 w-1.5 rounded-full bg-clay-400" />{metrics.privateSessions} private session{(metrics.privateSessions ?? 0) > 1 ? 's' : ''}</li>}
        {(metrics.guestPasses ?? 0) > 0 && <li className="flex items-center gap-2 text-[12.5px] text-ink-700 dark:text-ink-200"><span className="h-1.5 w-1.5 rounded-full bg-clay-400" />{metrics.guestPasses} guest pass{(metrics.guestPasses ?? 0) > 1 ? 'es' : ''}</li>}
      </ul>
      {metrics.customerSavings ? (
        <p className="mt-3 text-[12px] text-muted">
          Worth <span className="num text-ink">{inr(metrics.customerValueReceived)}</span> at our rate card — you save{' '}
          <span className="num text-ink">{inr(metrics.customerSavings)}</span>{metrics.customerSavingsPct ? ` (${pct(metrics.customerSavingsPct)})` : ''}.
        </p>
      ) : null}
      {offer.terms.purchaseDeadline ? (
        <p className="mt-2 text-2xs text-muted">Available until {dateLabel(offer.terms.purchaseDeadline)}{offer.eligibility.requiresCode && offer.eligibility.code ? ` · code ${offer.eligibility.code}` : ''}</p>
      ) : null}
      <p className="mt-3 text-2xs text-muted">
        Preview only. Figures are the engine&rsquo;s live calculation for the terms currently in the editor.
      </p>
    </div>
  );
}

function durationDays(duration: number, unit: string | null): number | null {
  if (unit === 'days') return duration;
  if (unit === 'weeks') return duration * 7;
  if (unit === 'months') return Math.round(duration * 30.44);
  if (unit === 'years') return duration * 365;
  return null;
}

/** Fallback strategy text built from the stored generation context when nothing else is available. */
function proposalStrategyFor(offer: Offer, metrics: ComputedMetrics, base: CatalogueProduct | null) {
  const gc = offer.generationContext;
  return {
    concept: offer.description,
    whyItWorks: offer.audienceSegments.length
      ? `Designed for ${offer.audienceSegments.map(a => AUDIENCE_LABELS[a] ?? a).join(', ')} — see the observed behaviour in Analytics for the size and habit of that group.`
      : 'Audience not set on this offer.',
    customerAppeal: metrics.customerSavings
      ? `Worth ${inr(metrics.customerValueReceived)} at catalogue rates for ${inr(metrics.sellingPrice)} paid.`
      : 'Value-add structure with no cash discount.',
    commercialImpact: `${metrics.discountPct ? `${pct(metrics.discountPct)} discount · ${inr(metrics.discountAmount)} per sale` : 'No discount'} · revenue vs list ${inr(metrics.revenueDeltaVsReference)}.`,
    risks: metrics.cannibalisation.map(c => `${c.productName}: ${c.detail}`),
    recommendedAudience: offer.audienceSegments.map(a => AUDIENCE_LABELS[a] ?? a).join(', ') || 'Not set',
    salesPitch: '',
    alternativeApproach: 'Compare this against a credit-based alternative in the simulator before committing.',
    facts: [
      base ? `Base product: ${base.name} at ${inr(base.price)}${base.credits ? `, ${base.credits} credits` : base.unlimitedAccess ? ', unlimited access' : ''}.` : 'No base product selected.',
      `Selling price ${inr(metrics.sellingPrice)} · effective ${inr(metrics.effectivePricePerClass ?? metrics.effectivePricePerVisit)} per ${metrics.attendanceAssumption ? 'visit' : 'class'}.`,
      base?.observed ? `Observed Bengaluru sales for the base product: ${base.observed.units} units, ${inr(base.observed.revenue, { compact: true })}.` : 'No observed sales for the base product in the Bengaluru export.',
    ],
    estimates: ['Scorecard values are a heuristic read of the offer structure — not a conversion prediction.'],
    assumptions: [
      metrics.attendanceAssumption ? `Unlimited access valued at ${metrics.attendanceAssumption.visitsPerMonth} visits/month (${metrics.attendanceAssumption.source}).` : 'Credit-based offer — no attendance assumption applies.',
      metrics.contributionMargin == null ? 'Delivery costs are not configured, so margin is not shown.' : `Margin uses configured delivery costs: ${metrics.costBasis}.`,
    ],
    recommendations: [
      ...metrics.guardrails.filter(g => !g.passed).map(g => `${g.severity === 'blocker' ? 'Blocker' : 'Check'}: ${g.detail}`),
      gc?.providerLabel ? `Generated by: ${gc.providerLabel}` : 'Created manually in the workspace.',
    ],
  };
}
