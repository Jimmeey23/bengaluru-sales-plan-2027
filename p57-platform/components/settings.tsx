'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Divider, Field, Input, KeyValue, Select,
  StatTile, Tabs, Textarea, Toggle, Tooltip, cn, useToast,
} from '@/components/ui';
import { ImportsLog } from '@/components/imports-log';
import { CAPABILITY_GROUPS, CAPABILITY_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { dateTimeLabel, pct } from '@/lib/format';
import type {
  AIProviderConfig, AttendanceAssumptions, CostAssumptions, GuardrailConfig, Role,
  SettingsBundle, SimulationAssumptions, User,
} from '@/lib/types';

interface ProviderOption { id: string; label: string; models: readonly string[]; note: string }

type TabKey = 'guardrails' | 'costs' | 'attendance' | 'simulator' | 'ai' | 'team' | 'integrations' | 'data';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'guardrails', label: 'Commercial guardrails' },
  { key: 'costs', label: 'Costs & margin' },
  { key: 'attendance', label: 'Attendance assumptions' },
  { key: 'simulator', label: 'Simulator defaults' },
  { key: 'ai', label: 'AI provider' },
  { key: 'team', label: 'Team & permissions' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'data', label: 'Data & imports' },
];

const SOURCE_LABELS: Record<string, string> = {
  platform_defaults: 'Platform defaults — the business has not set its own yet',
  org_configured: 'Set by this workspace',
  not_configured: 'Not configured',
  observed_export: 'Derived from the supplied export',
};

export function SettingsView({
  settings: initialSettings,
  users: initialUsers,
  imports,
  capabilityMatrix,
  observedAssumptions,
  locations,
  productClasses,
  catalogueCount,
  currentUserId,
  canManage,
  canManageAi,
  canManageUsers,
}: {
  settings: SettingsBundle;
  users: User[];
  imports: any[];
  capabilityMatrix: Record<string, string[]>;
  observedAssumptions: {
    medianVisitsPerMonth: number | null;
    medianDaysSinceLastVisit: number | null;
    membersTracked: number | null;
    conversionRatePct: number | null;
    poolNote: string;
  };
  locations: { id: string; label: string }[];
  productClasses: string[];
  catalogueCount: number;
  currentUserId: string;
  canManage: boolean;
  canManageAi: boolean;
  canManageUsers: boolean;
}) {
  const { push } = useToast();
  const [tab, setTab] = useState<TabKey>('guardrails');
  const [settings, setSettings] = useState<SettingsBundle>(initialSettings);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [defaults, setDefaults] = useState<{ guardrails: GuardrailConfig; attendance: AttendanceAssumptions; simulation: SimulationAssumptions } | null>(null);
  const [providerCatalogue, setProviderCatalogue] = useState<ProviderOption[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [recalculated, setRecalculated] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d?.defaults) setDefaults(d.defaults);
        if (Array.isArray(d?.providerCatalogue)) setProviderCatalogue(d.providerCatalogue);
      })
      .catch(() => { /* the page still works; defaults are only used by the reset buttons */ });
  }, []);

  const panel = (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-50/60 px-3.5 py-2.5 text-[12.5px] text-muted dark:bg-ink-800/40">
      <span className="text-ink">These are the values the pricing engine reads.</span>
      <span className="hidden sm:inline">
        Changing them recalculates every saved offer — nothing you change here is a suggestion, and nothing is guessed for you.
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Workspace settings</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
            Every commercial rule here belongs to Physique 57, not to the platform. Where the business has not supplied a
            figure, the field stays empty and the platform says so rather than filling it in.
          </p>
        </div>
        {recalculated != null && (
          <Badge tone="success">{recalculated} saved offer{recalculated === 1 ? '' : 's'} recalculated</Badge>
        )}
      </div>

      {!canManage && (
        <Alert tone="info" title="Read-only for your role">
          You can see how the workspace is configured, but changing guardrails, costs or the AI provider needs the
          <span className="font-medium"> settings:manage</span> capability. Switch member from the account menu to try another role.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Discount ceiling" value={pct(settings.guardrails.maxDiscountPct, 0)} hint={SOURCE_LABELS[settings.guardrails.source] ?? settings.guardrails.source} />
        <StatTile
          label="Cost data for margin"
          value={settings.costs.source === 'org_configured' ? 'Configured' : 'Not supplied'}
          hint={settings.costs.source === 'org_configured' ? 'Contribution margin is shown on offers' : 'Margin is withheld, not estimated'}
          tone={settings.costs.source === 'org_configured' ? 'default' : 'warning'}
        />
        <StatTile
          label="Attendance assumption"
          value={settings.attendance.visitsPerMonthDefault != null ? `${settings.attendance.visitsPerMonthDefault} visits/month` : 'Not set'}
          hint={SOURCE_LABELS[settings.attendance.source] ?? settings.attendance.source}
          tone={settings.attendance.visitsPerMonthDefault != null ? 'default' : 'warning'}
        />
        <StatTile
          label="AI provider"
          value={settings.ai.provider === 'local_strategist' ? 'Local engine' : settings.ai.provider}
          hint={settings.ai.keyConfigured ? 'Key stored server-side' : 'No external model connected'}
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={k => setTab(k as TabKey)} />

      {tab === 'guardrails' && (
        <GuardrailsPanel
          value={settings.guardrails}
          defaults={defaults?.guardrails ?? null}
          productClasses={productClasses}
          canManage={canManage}
          saving={saving === 'guardrails'}
          onSave={async next => {
            setSaving('guardrails');
            const res = await patch('/api/settings', { guardrails: next }, push);
            setSaving(null);
            if (res?.settings) {
              setSettings(s => ({ ...s, guardrails: res.settings.guardrails }));
              setRecalculated(res.recalculated ?? 0);
            }
          }}
        />
      )}

      {tab === 'costs' && (
        <CostsPanel
          value={settings.costs}
          canManage={canManage}
          saving={saving === 'costs'}
          onSave={async next => {
            setSaving('costs');
            const res = await patch('/api/settings', { costs: next }, push);
            setSaving(null);
            if (res?.settings) {
              setSettings(s => ({ ...s, costs: res.settings.costs }));
              setRecalculated(res.recalculated ?? 0);
            }
          }}
        />
      )}

      {tab === 'attendance' && (
        <AttendancePanel
          value={settings.attendance}
          locations={locations}
          observed={observedAssumptions}
          canManage={canManage}
          saving={saving === 'attendance'}
          onSave={async next => {
            setSaving('attendance');
            const res = await patch('/api/settings', { attendance: next }, push);
            setSaving(null);
            if (res?.settings) {
              setSettings(s => ({ ...s, attendance: res.settings.attendance }));
              setRecalculated(res.recalculated ?? 0);
            }
          }}
        />
      )}

      {tab === 'simulator' && (
        <SimulatorPanel
          value={settings.simulation}
          observed={observedAssumptions}
          canManage={canManage}
          saving={saving === 'simulator'}
          onSave={async next => {
            setSaving('simulator');
            const res = await patch('/api/settings', { simulation: next }, push);
            setSaving(null);
            if (res?.settings) setSettings(s => ({ ...s, simulation: res.settings.simulation }));
          }}
        />
      )}

      {tab === 'ai' && (
        <AiPanel
          value={settings.ai}
          providerCatalogue={providerCatalogue}
          canManage={canManageAi}
          saving={saving === 'ai'}
          onSave={async next => {
            setSaving('ai');
            const res = await patch('/api/settings', { ai: next }, push);
            setSaving(null);
            if (res?.settings) setSettings(s => ({ ...s, ai: res.settings.ai }));
          }}
        />
      )}

      {tab === 'team' && (
        <TeamPanel
          users={users}
          currentUserId={currentUserId}
          capabilityMatrix={capabilityMatrix}
          canManageUsers={canManageUsers}
          onRoleChange={async (id, role) => {
            setSaving('team');
            const res = await patch('/api/settings', { users: [{ id, role }] }, push);
            setSaving(null);
            if (res?.users) setUsers(res.users);
          }}
          saving={saving === 'team'}
        />
      )}

      {tab === 'integrations' && (
        <IntegrationsPanel
          value={settings.integrations}
          canManage={canManage}
          saving={saving === 'integrations'}
          onSave={async next => {
            setSaving('integrations');
            const res = await patch('/api/settings', { integrations: next }, push);
            setSaving(null);
            if (res?.settings) setSettings(s => ({ ...s, integrations: res.settings.integrations }));
          }}
        />
      )}

      {tab === 'data' && (
        <div className="space-y-4">
          {panel}
          <Card>
            <CardHeader
              title="What this workspace is running on"
              subtitle="Source files, engine versions and record counts — stated so no figure has to be taken on trust"
            />
            <div className="px-4 pb-4 pt-3">
              <KeyValue
                columns={3}
                items={[
                  { label: 'Catalogue records', value: <span className="num">{catalogueCount}</span>, hint: 'Parsed from the Momence membership export, original rows preserved' },
                  { label: 'Source of everything observable', value: 'Supplied exports', hint: 'Membership export, sales, CRM leads, customer base, capacity' },
                  { label: 'Member records read', value: <span className="num">{observedAssumptions.membersTracked ?? '—'}</span>, hint: 'Distinct members in the customer-base export' },
                  { label: 'Median visits per month', value: <span className="num">{observedAssumptions.medianVisitsPerMonth ?? '—'}</span>, hint: 'Observed, not assumed — the simulator can use it as a basis' },
                  { label: 'Trial → sale rate (funnel)', value: <span className="num">{observedAssumptions.conversionRatePct != null ? pct(observedAssumptions.conversionRatePct, 1) : '—'}</span>, hint: 'Lead-funnel figure. Not an offer conversion rate and never used as one' },
                  { label: 'Engine', value: 'Deterministic', hint: 'Pricing, guardrails and scenarios are calculated in code; AI only explains and recommends' },
                ]}
              />
              <p className="mt-3 text-2xs leading-relaxed text-muted">{observedAssumptions.poolNote}</p>
            </div>
          </Card>
          <ImportsLog imports={imports} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

async function patch(url: string, body: unknown, push: (t: { title: string; description?: string; tone?: 'default' | 'success' | 'error' | 'danger' | 'warning' | 'info' }) => void) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    push({ title: 'That change was not saved', description: data?.error ?? 'The server rejected it without a reason.', tone: 'danger' });
    return null;
  }
  push({ title: 'Saved', description: data?.message ?? undefined, tone: 'success' });
  return data;
}

function NumberRow({
  label, hint, value, onChange, suffix, step = 1, min = 0, max, disabled, placeholder,
}: {
  label: string; hint?: string; value: number | null; onChange: (v: number | null) => void;
  suffix?: string; step?: number; min?: number; max?: number; disabled?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink">{label}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <Input
          type="number"
          value={value ?? ''}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          placeholder={placeholder ?? 'Not set'}
          onChange={e => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
          className="num"
        />
        {suffix && <span className="text-[12.5px] text-muted">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-2xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

function SaveBar({ onSave, saving, disabled, children, dirty }: {
  onSave: () => void; saving: boolean; disabled?: boolean; children?: React.ReactNode; dirty: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      <Button variant="primary" onClick={onSave} loading={saving} disabled={disabled || !dirty}>
        {dirty ? 'Save changes' : 'Saved'}
      </Button>
      {children}
      {!dirty && <span className="text-2xs text-muted">No unsaved changes.</span>}
    </div>
  );
}

/* --------------------------------------------------------------- guardrails */

function GuardrailsPanel({
  value, defaults, productClasses, canManage, saving, onSave,
}: {
  value: GuardrailConfig; defaults: GuardrailConfig | null; productClasses: string[];
  canManage: boolean; saving: boolean; onSave: (v: GuardrailConfig) => void;
}) {
  const [draft, setDraft] = useState<GuardrailConfig>(value);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const set = <K extends keyof GuardrailConfig>(k: K, v: GuardrailConfig[K]) => setDraft(d => ({ ...d, [k]: v }));

  const classKeys = useMemo(() => {
    const keys = new Set([...Object.keys(draft.maxDiscountPctByClass ?? {}), ...productClasses]);
    return Array.from(keys).sort();
  }, [draft.maxDiscountPctByClass, productClasses]);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="There is no universal discount limit">
        The platform ships with ceilings so nothing is unbounded, but each one is editable and the engine applies
        whichever ceiling is strictest for the product class in play. Set what Physique 57 can actually sustain.
      </Alert>

      <Card>
        <CardHeader
          title="Discount and approval triggers"
          subtitle="Applies to every offer the engine prices"
          action={<Badge tone={value.source === 'org_configured' ? 'teal' : 'neutral'}>{value.source === 'org_configured' ? 'Your configuration' : 'Platform defaults'}</Badge>}
        />
        <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberRow label="Maximum cash discount" suffix="%" value={draft.maxDiscountPct} onChange={v => set('maxDiscountPct', v ?? 0)} max={90}
            hint="Applies to every product class that has not been given its own ceiling below." />
          <NumberRow label="Require approval above discount" suffix="%" value={draft.requireApprovalAboveDiscountPct} onChange={v => set('requireApprovalAboveDiscountPct', v ?? 0)} max={90}
            hint="Anything deeper than this cannot be published without an approver." />
          <NumberRow label="Require approval above value add" suffix="%" value={draft.requireApprovalAboveValueAddPct} onChange={v => set('requireApprovalAboveValueAddPct', v ?? 0)} max={200}
            hint="Value add counts bonus classes, credits and extras even when the price does not move." />
          <NumberRow label="Minimum effective price per class" suffix="₹" value={draft.minEffectivePricePerClass} onChange={v => set('minEffectivePricePerClass', v ?? 0)}
            hint="A floor the generator repairs against before showing you alternatives." />
          <NumberRow label="Maximum bonus credits" suffix="%" value={draft.maxBonusCreditsPct} onChange={v => set('maxBonusCreditsPct', v ?? 0)} max={300}
            hint="Bonus credits as a share of the base pack's class count." />
          <NumberRow label="Maximum private session discount" suffix="%" value={draft.maxPrivateSessionDiscountPct} onChange={v => set('maxPrivateSessionDiscountPct', v ?? 0)} max={90}
            hint="Private sessions carry a different cost base, so they have a separate ceiling." />
          <NumberRow label="Maximum validity extension" suffix="days" value={draft.maxValidityExtensionDays} onChange={v => set('maxValidityExtensionDays', v ?? 0)} />
          <NumberRow label="Minimum validity" suffix="days" value={draft.minValidityDays} onChange={v => set('minValidityDays', v ?? 0)} />
          <NumberRow label="Maximum guest passes" value={draft.maxGuestPasses} onChange={v => set('maxGuestPasses', v ?? 0)} />
          <NumberRow label="Maximum comp classes" value={draft.maxCompClasses} onChange={v => set('maxCompClasses', v ?? 0)} />
          <NumberRow label="Maximum discount on unlimited" suffix="%" value={draft.maxDiscountOnUnlimitedPct} onChange={v => set('maxDiscountOnUnlimitedPct', v ?? 0)} max={90}
            hint="Unlimited memberships are valued per visit, so a cut here is multiplied by attendance." />
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <Toggle label="Allow any discount on unlimited" checked={draft.allowDiscountOnUnlimited} onChange={v => set('allowDiscountOnUnlimited', v)}
              hint="Off by default: a discount on an unlimited membership compounds with usage." />
            <Toggle label="Block discounting intro products" checked={draft.blockDiscountOnIntroProducts} onChange={v => set('blockDiscountOnIntroProducts', v)}
              hint="Intro offers are already the entry price; stacking makes the next step look like a penalty." />
            <Toggle label="Block stacking of mechanisms" checked={draft.blockStacking} onChange={v => set('blockStacking', v)}
              hint="Stops a percentage cut and a bundle discount compounding into one unrepeatable price." />
          </div>
        </div>
        <Divider />
        <div className="px-4 py-3">
          <Toggle label="Require reapproval when commercial terms change" checked={draft.reapprovalOnCommercialChange} onChange={v => set('reapprovalOnCommercialChange', v)}
            hint="Applies to approved and published offers: a price, terms or eligibility edit sends it back for review." />
        </div>

        <Divider label="Per product class" />
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {classKeys.map(key => (
            <label key={key} className="block">
              <span className="text-[12.5px] text-ink capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="mt-1.5 flex items-center gap-2">
                <Input
                  type="number"
                  className="num"
                  value={draft.maxDiscountPctByClass?.[key] ?? ''}
                  placeholder="Uses the global ceiling"
                  onChange={e => {
                    const raw = e.target.value;
                    const next = { ...(draft.maxDiscountPctByClass ?? {}) };
                    if (raw === '') delete next[key];
                    else next[key] = Number(raw);
                    set('maxDiscountPctByClass', next);
                  }}
                />
                <span className="text-[12.5px] text-muted">%</span>
              </span>
            </label>
          ))}
        </div>

        <div className="px-4 pb-3">
          <p className="text-2xs leading-relaxed text-muted">
            Floor basis: {draft.minEffectivePricePerClassBasis || 'not stated'} · Last set by{' '}
            {draft.updatedBy || 'unknown'} on {dateTimeLabel(draft.updatedAt)}
          </p>
        </div>
        <SaveBar
          dirty={dirty} saving={saving} disabled={!canManage}
          onSave={() => onSave(draft)}
        >
          {defaults && (
            <Button variant="ghost" onClick={() => setDraft(defaults)} disabled={!canManage}>
              Restore platform defaults
            </Button>
          )}
          <span className="text-2xs text-muted">Saving recalculates every saved offer.</span>
        </SaveBar>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- costs */

function CostsPanel({
  value, canManage, saving, onSave,
}: { value: CostAssumptions; canManage: boolean; saving: boolean; onSave: (v: CostAssumptions) => void }) {
  const [draft, setDraft] = useState<CostAssumptions>(value);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const enabled = draft.source === 'org_configured';
  const set = <K extends keyof CostAssumptions>(k: K, v: CostAssumptions[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Revenue is not profit">
        The platform reports revenue, price effects and value delivered. It will only show a contribution margin when you
        enter real delivery costs — it will never infer a cost, and it will never call revenue profit.
      </Alert>

      <Card>
        <CardHeader
          title="Delivery and processing costs"
          subtitle="Used for contribution margin on offers and campaign results"
          action={<Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Margin shown' : 'Margin hidden'}</Badge>}
        />
        <div className="px-4 pb-4 pt-3">
          <Toggle
            label="The business has supplied cost data"
            hint="Switching this on is a statement of fact: margin appears on every offer and in the comparison simulator."
            checked={enabled}
            onChange={v => set('source', v ? 'org_configured' : 'not_configured')}
            disabled={!canManage}
          />
        </div>
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberRow label="Studio class delivery cost" suffix="₹ per visit" value={draft.deliveryCostPerStudioClass} onChange={v => set('deliveryCostPerStudioClass', v)} />
          <NumberRow label="Private session delivery cost" suffix="₹ per session" value={draft.deliveryCostPerPrivateSession} onChange={v => set('deliveryCostPerPrivateSession', v)} />
          <NumberRow label="Payment processing fee" suffix="%" value={draft.paymentProcessingFeePct} onChange={v => set('paymentProcessingFeePct', v)} step={0.1} />
          <NumberRow label="GST rate" suffix="%" value={draft.gstRatePct} onChange={v => set('gstRatePct', v)} step={0.5} />
        </div>
        <div className="px-4 pb-4">
          <Field label="Notes on the cost basis" hint="Appears wherever margin is shown, so nobody has to guess where the number came from.">
            <Textarea rows={2} value={draft.notes} onChange={e => set('notes', e.target.value)} disabled={!canManage} />
          </Field>
        </div>
        <SaveBar dirty={dirty} saving={saving} disabled={!canManage} onSave={() => onSave(draft)}>
          {!enabled && (
            <span className="text-2xs text-muted">
              Figures entered while this is off are stored but unused — nothing is estimated from them.
            </span>
          )}
        </SaveBar>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- attendance */

function AttendancePanel({
  value, locations, observed, canManage, saving, onSave,
}: {
  value: AttendanceAssumptions; locations: { id: string; label: string }[];
  observed: { medianVisitsPerMonth: number | null; medianDaysSinceLastVisit: number | null };
  canManage: boolean; saving: boolean; onSave: (v: AttendanceAssumptions) => void;
}) {
  const [draft, setDraft] = useState<AttendanceAssumptions>(value);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const set = <K extends keyof AttendanceAssumptions>(k: K, v: AttendanceAssumptions[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Unlimited memberships are valued per visit, not per credit">
        An unlimited membership has no class count to divide by. The engine divides its price by an attendance
        assumption you set here, and prints that assumption next to every per-class figure it derives from it.
      </Alert>

      <Card>
        <CardHeader title="Visits per month" subtitle="The divisor behind every unlimited per-class figure" />
        <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2">
          <NumberRow label="Default visits per month" suffix="visits" value={draft.visitsPerMonthDefault} onChange={v => set('visitsPerMonthDefault', v)} step={0.1}
            hint="Applies when a location or segment has no assumption of its own." />
          <div className="space-y-2">
            <span className="text-[12.5px] font-medium text-ink">Observed from the supplied export</span>
            <div className="rounded-lg border border-line bg-ink-50/60 px-3 py-2.5 text-[12.5px] text-muted dark:bg-ink-800/40">
              <p>
                Median <span className="num text-ink">{observed.medianVisitsPerMonth ?? '—'}</span> visits per month and{' '}
                <span className="num text-ink">{observed.medianDaysSinceLastVisit ?? '—'}</span> days since last visit across the member base.
                This is what the exported records show, not a target.
              </p>
              {observed.medianVisitsPerMonth != null && (
                <Button size="sm" variant="ghost" className="mt-1.5 -ml-2" disabled={!canManage}
                  onClick={() => set('visitsPerMonthDefault', observed.medianVisitsPerMonth)}>
                  Use the observed median as the assumption
                </Button>
              )}
            </div>
          </div>
        </div>

        <Divider label="Per location" />
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map(loc => (
            <label key={loc.id} className="block">
              <span className="text-[12.5px] text-ink">{loc.label}</span>
              <span className="mt-1.5 flex items-center gap-2">
                <Input
                  type="number" step={0.1} className="num"
                  value={draft.visitsPerMonthByLocation?.[loc.id] ?? ''}
                  placeholder="Uses the default"
                  onChange={e => {
                    const raw = e.target.value;
                    const next = { ...(draft.visitsPerMonthByLocation ?? {}) };
                    if (raw === '') delete next[loc.id];
                    else next[loc.id] = Number(raw);
                    set('visitsPerMonthByLocation', next);
                  }}
                />
                <span className="text-[12.5px] text-muted">visits</span>
              </span>
            </label>
          ))}
        </div>

        <Divider label="Per segment" />
        <div className="space-y-3 px-4 py-3">
          {(draft.bySegment ?? []).map((row, i) => (
            <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <Field label="Segment">
                <Input value={row.segment} onChange={e => {
                  const next = [...draft.bySegment]; next[i] = { ...row, segment: e.target.value as any }; set('bySegment', next);
                }} />
              </Field>
              <Field label="Visits / month">
                <Input type="number" step={0.1} className="num" value={row.visitsPerMonth} onChange={e => {
                  const next = [...draft.bySegment]; next[i] = { ...row, visitsPerMonth: Number(e.target.value) }; set('bySegment', next);
                }} />
              </Field>
              <Field label="Basis for the figure">
                <Input value={row.basis} onChange={e => {
                  const next = [...draft.bySegment]; next[i] = { ...row, basis: e.target.value }; set('bySegment', next);
                }} placeholder="e.g. observed across active members, Aug–Oct" />
              </Field>
              <Button variant="ghost" onClick={() => set('bySegment', draft.bySegment.filter((_, j) => j !== i))} disabled={!canManage}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" disabled={!canManage}
            onClick={() => set('bySegment', [...(draft.bySegment ?? []), { segment: 'all' as any, visitsPerMonth: draft.visitsPerMonthDefault ?? 0, basis: '' }])}>
            Add a segment assumption
          </Button>
        </div>

        <Divider />
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <Field label="Where these figures come from" hint="Shown alongside any per-class figure derived from an unlimited price.">
            <Select value={draft.source} onChange={e => set('source', e.target.value as AttendanceAssumptions['source'])} disabled={!canManage}>
              <option value="observed_export">Derived from the supplied export</option>
              <option value="org_configured">Set by this workspace</option>
              <option value="not_configured">Not configured — unlimited per-class figures stay withheld</option>
            </Select>
          </Field>
          <Field label="Note shown with the assumption">
            <Input value={draft.sourceNote} onChange={e => set('sourceNote', e.target.value)} disabled={!canManage}
              placeholder="e.g. median visits per month across 2,933 member records, 2023–2026" />
          </Field>
        </div>
        <div className="px-4 pb-3">
          <Toggle
            label="Keep the observed median pinned as a reference"
            hint="Stored for display only — used for comparison, never applied automatically."
            checked={draft.observedMedianVisitsPerMonth != null}
            onChange={v => set('observedMedianVisitsPerMonth', v ? observed.medianVisitsPerMonth : null)}
            disabled={!canManage}
          />
        </div>
        <SaveBar dirty={dirty} saving={saving} disabled={!canManage} onSave={() => onSave(draft)} />
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- simulator */

function SimulatorPanel({
  value, observed, canManage, saving, onSave,
}: {
  value: SimulationAssumptions;
  observed: { conversionRatePct: number | null; medianVisitsPerMonth: number | null };
  canManage: boolean; saving: boolean; onSave: (v: SimulationAssumptions) => void;
}) {
  const [draft, setDraft] = useState<SimulationAssumptions>(value);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const set = <K extends keyof SimulationAssumptions>(k: K, v: SimulationAssumptions[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Defaults only — every run states its own assumptions">
        These values pre-fill the scenario simulator. Each simulation prints the assumptions it ran on and lets you
        override them for that run, so a saved result is never detached from the numbers behind it.
      </Alert>

      <Card>
        <CardHeader title="Scenario defaults" subtitle="Left blank means the simulator asks you rather than assuming" />
        <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberRow label="Expected buyers" value={draft.expectedBuyers} onChange={v => set('expectedBuyers', v)} />
          <NumberRow label="Lead pool size" value={draft.poolSize} onChange={v => set('poolSize', v)}
            hint="The audience the offer is being shown to. No pool is invented from marketing lists." />
          <NumberRow label="Offer conversion rate" suffix="%" value={draft.conversionRatePct} onChange={v => set('conversionRatePct', v)} step={0.1}
            hint="Only set this if the business has a figure it stands behind. The platform has no historical offer conversion rate of its own." />
          <NumberRow label="Redemption utilisation" suffix="%" value={draft.utilisationPct} onChange={v => set('utilisationPct', v)} step={1}
            hint="Share of sold packs expected to be used — drives delivery cost, not revenue." />
          <NumberRow label="Delivery cost per class" suffix="₹" value={draft.deliveryCostPerClass} onChange={v => set('deliveryCostPerClass', v)} />
          <NumberRow label="Attendance per month" suffix="visits" value={draft.attendancePerMonth} onChange={v => set('attendancePerMonth', v)} step={0.1} />
          <NumberRow label="Cannibalisation rate" suffix="%" value={draft.cannibalisationRatePct} onChange={v => set('cannibalisationRatePct', v)} step={1}
            hint="Share of buyers who would have paid full price anyway. Stated as an assumption, never as a measured fact." />
        </div>

        <Divider label="Scenario spread" />
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
          <NumberRow label="Conservative" suffix="× expected" value={draft.scenarioMultipliers?.conservative ?? null} step={0.05}
            onChange={v => set('scenarioMultipliers', { ...draft.scenarioMultipliers, conservative: v ?? 0 })} />
          <NumberRow label="Expected" suffix="× expected" value={draft.scenarioMultipliers?.expected ?? null} step={0.05}
            onChange={v => set('scenarioMultipliers', { ...draft.scenarioMultipliers, expected: v ?? 0 })} />
          <NumberRow label="Optimistic" suffix="× expected" value={draft.scenarioMultipliers?.optimistic ?? null} step={0.05}
            onChange={v => set('scenarioMultipliers', { ...draft.scenarioMultipliers, optimistic: v ?? 0 })} />
        </div>
        <div className="px-4 pb-3">
          <Field label="Note on where these came from" hint="Optional. Shown beside the scenario table.">
            <Input value={draft.sourceNote ?? ''} onChange={e => set('sourceNote', e.target.value)} disabled={!canManage}
              placeholder="e.g. buyer counts are the team's own estimate; no conversion rate is assumed" />
          </Field>
        </div>

        <Divider label="Observed reference — not applied automatically" />
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink-50/60 px-3.5 py-3 dark:bg-ink-800/40">
            <p className="text-[12.5px] text-ink">Trial → sale rate from the CRM funnel</p>
            <p className="num mt-1 text-[18px] text-ink">{observed.conversionRatePct != null ? pct(observed.conversionRatePct, 1) : '—'}</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">
              This is how often a trial converts at Bengaluru. It is not the share of people who accept an offer, and the
              platform will not substitute one for the other.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-ink-50/60 px-3.5 py-3 dark:bg-ink-800/40">
            <p className="text-[12.5px] text-ink">Median visits per month</p>
            <p className="num mt-1 text-[18px] text-ink">{observed.medianVisitsPerMonth ?? '—'}</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">
              Observed across the exported member base. Useful as an attendance default, and only as a default.
            </p>
          </div>
        </div>
        <SaveBar dirty={dirty} saving={saving} disabled={!canManage} onSave={() => onSave(draft)} />
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------- AI */

function AiPanel({
  value, providerCatalogue, canManage, saving, onSave,
}: {
  value: AIProviderConfig; providerCatalogue: ProviderOption[]; canManage: boolean; saving: boolean;
  onSave: (v: Partial<AIProviderConfig> & { apiKey?: string; clearKey?: boolean }) => void;
}) {
  const [provider, setProvider] = useState(value.provider);
  const [model, setModel] = useState(value.model ?? '');
  const [baseUrl, setBaseUrl] = useState(value.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const current = providerCatalogue.find(p => p.id === provider);
  const models = current?.models ?? [];

  const dirty = provider !== value.provider || model !== (value.model ?? '') || baseUrl !== (value.baseUrl ?? '') || apiKey.length > 0 || clearKey;

  return (
    <div className="space-y-4">
      <Alert tone={value.provider === 'local_strategist' ? 'info' : 'warning'} title="What the AI does and does not do">
        Offers are priced, scored and checked by deterministic code. A model provider only explains a recommendation and
        writes copy. With no key configured the workspace runs on the local strategist engine: same catalogue reasoning,
        no network calls, and every screen labels it as local.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Model provider"
            subtitle="Optional — the workspace is fully usable without one"
            action={<Badge tone={value.provider === 'local_strategist' ? 'neutral' : 'teal'}>{value.provider === 'local_strategist' ? 'Local engine' : 'External model'}</Badge>}
          />
          <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2">
            <Field label="Provider" hint={current?.note}>
              <Select value={provider} onChange={e => setProvider(e.target.value as AIProviderConfig['provider'])} disabled={!canManage}>
                {providerCatalogue.length === 0 && <option value={value.provider}>{value.provider}</option>}
                {providerCatalogue.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Model">
              {models.length > 0 ? (
                <Select value={model || models[0]} onChange={e => setModel(e.target.value)} disabled={!canManage || provider === 'local_strategist'}>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              ) : (
                <Input value={model} onChange={e => setModel(e.target.value)} disabled={!canManage} placeholder="Model id" />
              )}
            </Field>
            <Field label="API key" hint={value.keyHint ? `Stored server-side (${value.keyHint}). Entering a new key replaces it.` : 'Stored server-side and never returned to the browser.'}>
              <Input type="password" value={apiKey} autoComplete="off" placeholder={value.keyConfigured ? '••••••••••••' : 'Paste a key, or leave blank for local mode'}
                onChange={e => setApiKey(e.target.value)} disabled={!canManage || provider === 'local_strategist'} />
            </Field>
            <Field label="Base URL override" hint="Only needed for a gateway or self-hosted endpoint. Left blank uses the provider's own API.">
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} disabled={!canManage} placeholder="https://…" />
            </Field>
          </div>
          <div className="px-4 pb-4">
            <Toggle label="Remove the stored key" hint="Falls straight back to the local strategist engine." checked={clearKey}
              onChange={setClearKey} disabled={!canManage} />
          </div>
          <SaveBar
            dirty={dirty} saving={saving} disabled={!canManage}
            onSave={() => { onSave({ provider, model: model || null, baseUrl: baseUrl || null, apiKey: apiKey || undefined, clearKey }); setApiKey(''); setClearKey(false); }}
          >
            <span className="text-2xs text-muted">
              {value.keyConfigured ? `Key last changed ${dateTimeLabel(value.updatedAt)}` : 'No key is stored.'}
            </span>
          </SaveBar>
        </Card>

        <Card>
          <CardHeader title="What is true right now" subtitle="No connection is claimed unless it exists" />
          <div className="px-4 pb-4 pt-3">
            <KeyValue
              columns={1}
              items={[
                { label: 'Running on', value: value.provider === 'local_strategist' ? 'Local strategist engine (rules-v1)' : `${value.provider} · ${value.model}` },
                { label: 'Network calls made', value: value.keyConfigured ? 'Only the prompts you trigger' : 'None — nothing leaves this server' },
                { label: 'Provider status', value: value.keyConfigured ? 'Key present' : 'No key', hint: 'The workspace never tests a third-party endpoint to prove it works' },
                { label: 'Where prompts are logged', value: 'In this workspace database, with the provider and duration' },
              ]}
            />
            <p className="mt-3 text-2xs leading-relaxed text-muted">
              Keys are held in the workspace database on the server. They are never sent to the browser, never written into
              offer records, and never included in exports.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- team */

function TeamPanel({
  users, currentUserId, capabilityMatrix, canManageUsers, saving, onRoleChange,
}: {
  users: User[]; currentUserId: string; capabilityMatrix: Record<string, string[]>;
  canManageUsers: boolean; saving: boolean; onRoleChange: (id: string, role: Role) => void;
}) {
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Team"
          subtitle="Switching member from the account menu changes permissions, approvals and notifications — it is not a security boundary"
        />
        <div className="space-y-3 px-4 pb-4 pt-3">
          {users.map(u => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
              <Avatar name={u.name} color={u.avatarColor} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">
                  {u.name} {u.id === currentUserId && <span className="text-muted">· you</span>}
                </p>
                <p className="truncate text-2xs text-muted">{u.email} · {u.title}</p>
              </div>
              <div className="w-48">
                <Select
                  value={u.role}
                  disabled={!canManageUsers || saving}
                  onChange={e => onRoleChange(u.id, e.target.value as Role)}
                >
                  {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </div>
              <p className="w-full text-2xs leading-relaxed text-muted sm:w-auto sm:flex-1">{ROLE_DESCRIPTIONS[u.role]}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Permissions" subtitle="What each role can do — enforced by the server, not by hiding buttons" />
        <div className="overflow-x-auto px-4 pb-4 pt-3">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <th className="w-64 pb-2 text-left font-medium text-muted">Capability</th>
                {roles.map(r => <th key={r} className="pb-2 text-center font-medium text-muted">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_GROUPS.map(group => (
                <React.Fragment key={group.group}>
                  <tr><td colSpan={roles.length + 1} className="pt-3 pb-1 text-2xs uppercase tracking-wide text-muted/70">{group.group}</td></tr>
                  {group.capabilities.map(cap => (
                    <tr key={cap} className="border-t border-line/60">
                      <td className="py-1.5 pr-3 text-ink">
                        <span>{CAPABILITY_LABELS[cap] ?? cap}</span>
                        <span className="ml-1.5 text-2xs text-muted/70">{cap}</span>
                      </td>
                      {roles.map(r => {
                        const has = (capabilityMatrix[r] ?? []).includes(cap);
                        return (
                          <td key={r} className="py-1.5 text-center">
                            <Tooltip content={has ? `${ROLE_LABELS[r]}: allowed` : `${ROLE_LABELS[r]}: not allowed`}>
                              <span className={cn('inline-block h-2 w-2 rounded-full', has ? 'bg-teal-500' : 'bg-ink-200 dark:bg-ink-700')} />
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- integrations */

function IntegrationsPanel({
  value, canManage, saving, onSave,
}: { value: SettingsBundle['integrations']; canManage: boolean; saving: boolean; onSave: (v: SettingsBundle['integrations']) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const connected = draft.filter(d => d.status === 'connected').length;

  return (
    <div className="space-y-4">
      <Alert tone={connected === 0 ? 'info' : 'warning'} title={connected === 0 ? 'Nothing is connected, and the workspace says so everywhere' : `${connected} connection${connected === 1 ? '' : 's'} recorded as verified`}>
        This workspace runs in local mode: analytics come from files the studio supplies, and nothing is pushed to another
        system. A row can only be marked connected once an endpoint exists <em>and</em> someone records that they verified it —
        the platform does not ping third-party systems to claim a connection.
      </Alert>

      <Card>
        <CardHeader title="Integration register" subtitle="What exists, what is only file-based, and what would be needed to go live" />
        <div className="space-y-3 px-4 pb-4 pt-3">
          {draft.map((row, i) => {
            const set = <K extends keyof typeof row>(k: K, v: any) => {
              const next = [...draft]; next[i] = { ...row, [k]: v }; setDraft(next as any);
            };
            return (
              <div key={row.key} className="rounded-lg border border-line p-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">{row.label}</p>
                    <p className="text-2xs text-muted">{row.key}</p>
                  </div>
                  <Badge tone={row.status === 'connected' ? 'success' : row.status === 'demo' ? 'teal' : 'neutral'}>
                    {row.status === 'demo' ? 'File-based local mode' : row.status === 'connected' ? 'Connected (verified)' : 'Not connected'}
                  </Badge>
                  <div className="w-44">
                    <Select value={row.status} disabled={!canManage} onChange={e => {
                      const status = e.target.value as typeof row.status;
                      set('status', status);
                      if (status === 'connected' && !row.verifiedAt) {
                        set('verifiedAt', new Date().toISOString());
                        set('verifiedBy', 'set-by-you');
                      }
                    }}>
                      <option value="not_connected">Not connected</option>
                      <option value="demo">File-based (local mode)</option>
                      <option value="connected">Connected — verified</option>
                    </Select>
                  </div>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{row.detail}</p>
                {row.needs && <p className="mt-1.5 text-2xs leading-relaxed text-muted"><span className="text-ink">Would need:</span> {row.needs}</p>}
                <div className="mt-2.5 grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <Field label="Endpoint or webhook" hint="Recorded for the record. Nothing is called from here.">
                    <Input value={row.endpoint ?? ''} disabled={!canManage} placeholder="Not configured"
                      onChange={e => set('endpoint', e.target.value || null)} />
                  </Field>
                  <div className="self-end text-2xs text-muted">
                    {row.status === 'connected' && row.verifiedAt
                      ? <>Verified {dateTimeLabel(row.verifiedAt)}{row.verifiedBy ? ` by ${row.verifiedBy}` : ''}</>
                      : 'Never verified.'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <SaveBar dirty={dirty} saving={saving} disabled={!canManage} onSave={() => onSave(draft)}>
          <span className="text-2xs text-muted">Marking something connected without an endpoint and a verification is rejected.</span>
        </SaveBar>
      </Card>
    </div>
  );
}
