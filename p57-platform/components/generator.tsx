'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardHeader, Divider, EmptyState, Field, Input, Modal, Select, Slider, Tabs, Textarea, Toggle, cn, useToast,
} from '@/components/ui';
import { GuardrailList, MetricsFootnote, ScorecardPanel, StrategyBlocks } from '@/components/financials';
import { AUDIENCE_LABELS, LOCATION_LABELS, OBJECTIVE_LABELS, audienceLabel, inr, locationShort, objectiveLabel, pct } from '@/lib/format';
import { GENERATION_PRESETS } from '@/lib/engine';
import type { AudienceSegment, CatalogueProduct, CommercialObjective, LocationId } from '@/lib/types';

const MODES = [
  { key: 'guided', label: 'Guided builder', blurb: 'Step through audience, objective and structure yourself.' },
  { key: 'random', label: 'Surprise me', blurb: 'Preset-driven generation with sliders over the whole space.' },
  { key: 'nlq', label: 'Ask in plain English', blurb: 'Describe the offer you want; the engine interprets it.' },
  { key: 'existing', label: 'From an existing package', blurb: 'Start from a catalogue product and shape it.' },
];

export function Generator({ catalogue, canCreate }: { catalogue: CatalogueProduct[]; canCreate: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { push } = useToast();

  const initialMode = (sp.get('mode') as string) ?? 'guided';
  const [mode, setMode] = useState(MODES.some(m => m.key === initialMode) ? initialMode : 'guided');
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState<AudienceSegment[]>(['long_lapsed_members']);
  const [objectives, setObjectives] = useState<CommercialObjective[]>(['reactivate_lapsed']);
  const [locations, setLocations] = useState<LocationId[]>(['p57-blr-vmr']);
  const [baseProductId, setBaseProductId] = useState<string>(sp.get('base') ?? '');
  const [presetId, setPresetId] = useState('balanced');
  const [controls, setControls] = useState({
    creativity: 55, discountAggressiveness: 45, customerAttractiveness: 60, revenueProtection: 60, complexity: 40,
    durationBias: 'same' as 'shorter' | 'same' | 'longer', segment: 'auto' as any, category: 'auto' as any,
  });
  const [locks, setLocks] = useState({ baseProductId: false, audience: false, objectives: false, discount: false, validityDays: false, structure: false, naming: false });
  const [constraints, setConstraints] = useState({ maxDiscountPct: '', priceTarget: '', preferValueAdd: false });
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [label, setLabel] = useState<string>('');

  const preset = useMemo(() => GENERATION_PRESETS.find(p => p.id === presetId) ?? GENERATION_PRESETS[2], [presetId]);

  useEffect(() => { setSelected([]); }, [result]);

  useEffect(() => {
    fetch('/api/ai').then(r => r.json()).then(j => setLabel(j.label)).catch(() => {});
  }, []);

  async function generate(nextMode?: string, seed?: number) {
    const useMode = nextMode ?? mode;
    if (useMode === 'nlq' && prompt.trim().length < 12 && !nextMode) {
      push({ title: 'Describe the offer first', description: 'For example: "win back members who lapsed six months ago without discounting the annual plan".', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: useMode, prompt: prompt.trim() || null, audience, objectives, locationIds: locations,
          controls, presetId, count, seed: seed ?? Math.floor(Math.random() * 100000),
          locked: {
            baseProductId: locks.baseProductId && baseProductId ? baseProductId : undefined,
            audience: locks.audience || undefined,
            objectives: locks.objectives || undefined,
            structure: locks.structure ? undefined : undefined,
            naming: locks.naming ? 'keep' : undefined,
          },
          constraints: {
            maxDiscountPct: constraints.maxDiscountPct ? Number(constraints.maxDiscountPct) : undefined,
            priceTarget: constraints.priceTarget ? Number(constraints.priceTarget) : undefined,
            preferValueAdd: constraints.preferValueAdd || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Generation failed', description: json.error, tone: 'danger' }); return; }
      setResult(json);
      setLabel(json.label);
      if (json.interpretation) {
        push({
          title: 'Brief interpreted',
          description: `${json.interpretation.audience?.map((a: string) => audienceLabel(a)).join(', ') || 'audience not stated'} · ${json.interpretation.objectives?.map((o: string) => objectiveLabel(o)).join(', ') || 'objective not stated'}`,
        });
      }
    } finally { setBusy(false); }
  }

  async function saveSelected(extra: { collectionIds?: string[]; campaignId?: string }) {
    const proposals = (result?.proposals ?? []).filter((p: any) => selected.includes(p.proposalId));
    if (!proposals.length) { push({ title: 'Select at least one concept' , tone: 'warning' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposals, mode, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not save', description: json.error, tone: 'danger' }); return; }
      push({ title: json.message, description: 'Saved as drafts — nothing is approved or live.' });
      router.push('/offers');
    } finally { setBusy(false); }
  }

  async function remix(proposalId: string, action: string) {
    const p = result?.proposals?.find((x: any) => x.proposalId === proposalId);
    if (!p) return;
    setBusy(true);
    try {
      // Remix in place: rebuild from the proposal's own structure using the same engine.
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode, audience: p.audienceSegments, objectives: p.objectives, locationIds: p.locationIds,
          controls, presetId, count: 1, locked: { baseProductId: p.baseProductId, naming: p.name },
        }),
      });
      const json = await res.json();
      if (json.proposals?.[0]) {
        setResult((r: any) => ({ ...r, proposals: r.proposals.map((x: any) => (x.proposalId === proposalId ? { ...json.proposals[0], proposalId } : x)) }));
        push({ title: 'Alternative generated for this angle', description: 'Same base package, different structure.' });
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module B</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Offer generator</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Concepts are built from your own catalogue and priced by the deterministic engine as they are generated, so the
            price you see is the price that will save. {label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{catalogue.filter(p => (p.price ?? 0) > 0).length} sellable products in scope</Badge>
        </div>
      </header>

      <Tabs tabs={MODES.map(m => ({ key: m.key, label: m.label }))} value={mode} onChange={k => setMode(String(k))} />
      <p className="-mt-2 text-[12.5px] text-muted">{MODES.find(m => m.key === mode)?.blurb}</p>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {/* ------------------------------------------------ brief */}
        <div className="space-y-4">
          {mode === 'nlq' && (
            <Card>
              <CardHeader dense title="Describe the offer" subtitle="Plain English — the engine reads audience, objective, price ceilings and timing" />
              <div className="space-y-3 p-3">
                <Textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={'Examples:\n• "Win back members who lapsed more than six months ago, without discounting the annual plan"\n• "Fill weekday mornings for the next three weeks for members who train at Kenkere House"\n• "Convert trialists into 8-class packs before Diwali, keep the price at ₹8,300"'} />
                <Button variant="primary" className="w-full" onClick={() => generate()} loading={busy}>Interpret and generate</Button>
                <p className="text-2xs leading-relaxed text-muted">
                  Anything the engine cannot match to your catalogue, audience list or objectives is left unresolved and shown
                  as such — it never guesses a business rule.
                </p>
              </div>
            </Card>
          )}

          {(mode === 'guided' || mode === 'random' || mode === 'existing') && (
            <>
              <Card>
                <CardHeader dense title="Brief" subtitle="Audience and objective drive which catalogue products are eligible" />
                <div className="space-y-3 p-3">
                  <Field label="Audience">
                    <MultiPick options={Object.entries(AUDIENCE_LABELS).map(([id, label]) => ({ id, label }))} selected={audience} onChange={ids => setAudience(ids as AudienceSegment[])} />
                  </Field>
                  <Field label="Objective">
                    <MultiPick options={Object.entries(OBJECTIVE_LABELS).map(([id, label]) => ({ id, label }))} selected={objectives} onChange={ids => setObjectives(ids as CommercialObjective[])} />
                  </Field>
                  <Field label="Location" hint="Offers stay location-aware: a membership bought at one studio is not assumed redeemable at another.">
                    <MultiPick options={Object.entries(LOCATION_LABELS).map(([id, label]) => ({ id, label }))} selected={locations} onChange={ids => setLocations(ids as LocationId[])} />
                  </Field>
                  {(mode === 'existing' || locks.baseProductId) && (
                    <Field label="Base package">
                      <Select value={baseProductId} onChange={e => setBaseProductId(e.target.value)}>
                        <option value="">Let the engine choose</option>
                        {catalogue.filter(p => (p.price ?? 0) > 0).map(p => (
                          <option key={p.id} value={p.id}>{p.name} — {inr(p.price)}</option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Toggle checked={locks.baseProductId} onChange={v => setLocks(l => ({ ...l, baseProductId: v }))} label="Lock the base package" hint="Generate alternatives around this product instead of across the catalogue." />
                </div>
              </Card>

              <Card>
                <CardHeader dense title="Controls" subtitle="These shape the structure and how aggressive it is" />
                <div className="space-y-4 p-3">
                  <Slider label="Creativity" value={controls.creativity} onChange={v => setControls(c => ({ ...c, creativity: v }))} hint="Higher mixes more mechanisms into one offer" />
                  <Slider label="Discount aggressiveness" value={controls.discountAggressiveness} onChange={v => setControls(c => ({ ...c, discountAggressiveness: v }))} hint="Pushes price-led angles harder, up to your configured ceiling" />
                  <Slider label="Customer attractiveness" value={controls.customerAttractiveness} onChange={v => setControls(c => ({ ...c, customerAttractiveness: v }))} hint="More classes, more time, more inclusions" />
                  <Slider label="Revenue protection" value={controls.revenueProtection} onChange={v => setControls(c => ({ ...c, revenueProtection: v }))} hint="Biases towards value-add instead of cash off" />
                  <Slider label="Complexity" value={controls.complexity} onChange={v => setControls(c => ({ ...c, complexity: v }))} hint="More stacked mechanisms and bundles" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Duration bias">
                      <Select value={controls.durationBias} onChange={e => setControls(c => ({ ...c, durationBias: e.target.value as any }))}>
                        <option value="shorter">Shorter</option>
                        <option value="same">Same as base</option>
                        <option value="longer">Longer</option>
                      </Select>
                    </Field>
                    <Field label="Alternatives">
                      <Select value={String(count)} onChange={e => setCount(Number(e.target.value))}>
                        {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} alternatives</option>)}
                      </Select>
                    </Field>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader dense title="Presets" subtitle="Ten starting points, from cautious to unconventional" />
                <div className="grid gap-1.5 p-3">
                  {GENERATION_PRESETS.map(p => (
                    <button key={p.id} onClick={() => setPresetId(p.id)}
                      className={cn('rounded-lg border px-3 py-2 text-left transition-colors', presetId === p.id ? 'border-clay-300 bg-clay-50/60 dark:border-clay-800 dark:bg-clay-950/30' : 'border-line hover:bg-ink-50 dark:hover:bg-ink-800/40')}>
                      <p className="text-[12.5px] font-medium text-ink">{p.label}</p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-muted">{p.blurb}</p>
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader dense title="Constraints" subtitle="Hard limits you set for this run" />
                <div className="space-y-3 p-3">
                  <Field label="Never exceed this discount (%)" hint="Applies on top of your guardrails — the lower of the two wins.">
                    <Input type="number" value={constraints.maxDiscountPct} onChange={e => setConstraints(c => ({ ...c, maxDiscountPct: e.target.value }))} />
                  </Field>
                  <Field label="Target price (₹)" hint="Used as a preference, not a mandate.">
                    <Input type="number" value={constraints.priceTarget} onChange={e => setConstraints(c => ({ ...c, priceTarget: e.target.value }))} />
                  </Field>
                  <Toggle checked={constraints.preferValueAdd} onChange={v => setConstraints(c => ({ ...c, preferValueAdd: v }))} label="Prefer value-add over cash discount" hint="Keeps the rate card intact and gives the front desk something to sell." />
                </div>
              </Card>
            </>
          )}

          <Card>
            <div className="space-y-2 p-3">
              <Button variant="primary" className="w-full" onClick={() => generate()} loading={busy}>
                {result ? 'Regenerate' : 'Generate offers'}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => generate(undefined, Math.floor(Math.random() * 100000))} disabled={busy}>
                Generate similar set
              </Button>
              {result?.proposals?.length ? (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => saveSelected({})} disabled={!selected.length || !canCreate} loading={busy}>
                    Save {selected.length || ''} to bank
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" onClick={async () => { await saveSelected({}); }} disabled={!selected.length || !canCreate}>
                    Save &amp; compare
                  </Button>
                </div>
              ) : null}
              {!canCreate && <p className="text-2xs text-muted">Your role can generate and review, but not save offers.</p>}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------ results */}
        <div className="space-y-4">
          {!result && (
            <Card>
              <EmptyState
                title="Nothing generated yet"
                description="Set a brief on the left and generate. Each alternative uses a different commercial mechanism — extra access, time, private attention, a guest pass, a price cut or an off-peak window — so you are comparing ideas rather than percentages."
              />
            </Card>
          )}

          {result?.interpretation && (
            <Card className="border-teal-200 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/20">
              <div className="space-y-1.5 p-3">
                <p className="text-[12.5px] font-medium text-ink">How the brief was read</p>
                <p className="text-2xs leading-relaxed text-muted">
                  Audience: {result.interpretation.audience?.map((a: string) => audienceLabel(a)).join(', ') || 'not stated'} ·
                  Objective: {result.interpretation.objectives?.map((o: string) => objectiveLabel(o)).join(', ') || 'not stated'} ·
                  Matched: {result.interpretation.matchedTerms?.join(', ') || '—'}
                </p>
                {result.interpretation.unmatchedTerms?.length ? (
                  <p className="text-2xs text-clay-600 dark:text-clay-400">
                    Not matched to anything in your catalogue or configuration: {result.interpretation.unmatchedTerms.join(', ')} — left
                    unresolved rather than guessed.
                  </p>
                ) : null}
              </div>
            </Card>
          )}

          {result?.proposals?.map((p: any, i: number) => (
            <Card key={p.proposalId} className="overflow-hidden">
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={selected.includes(p.proposalId)}
                      onChange={e => setSelected(s => (e.target.checked ? [...s, p.proposalId] : s.filter(x => x !== p.proposalId)))} />
                    <span className="font-display text-[17px]">{p.name}</span>
                    <Badge tone="clay">{p.angleLabel}</Badge>
                    <Badge tone="neutral">Engine score {p.scorecard.overall.toFixed(1)}</Badge>
                    {p.guardrails.some((g: any) => !g.passed && g.severity === 'blocker') && <Badge tone="danger">Guardrail blocker</Badge>}
                  </span>
                }
                subtitle={`${p.baseProductName} · ${p.locationIds.map((l: string) => locationShort(l)).join(', ')} · ${p.objectives.map((o: string) => objectiveLabel(o)).join(', ')}`}
                action={
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(p)}>Full strategy</Button>
                    <Button size="sm" variant="secondary" onClick={() => remix(p.proposalId, 'more_attractive')} disabled={busy}>Alternative</Button>
                  </div>
                }
              />
              <div className="grid gap-3 p-4 lg:grid-cols-[1fr_280px]">
                <div className="space-y-3">
                  <p className="text-[13px] leading-relaxed text-ink-700 dark:text-ink-200">{p.strategy.concept}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SmallBlock title="Why it works" body={p.strategy.whyItWorks} />
                    <SmallBlock title="Customer appeal" body={p.strategy.customerAppeal} />
                    <SmallBlock title="Commercial impact" body={p.strategy.commercialImpact} />
                    <SmallBlock title="Alternative approach" body={p.strategy.alternativeApproach} />
                  </div>
                  {p.cannibalisation.length > 0 && (
                    <Alert tone="warning" title={`${p.cannibalisation.length} displacement risk${p.cannibalisation.length === 1 ? '' : 's'}`}>
                      {p.cannibalisation[0].detail}{p.cannibalisation.length > 1 ? ` (+${p.cannibalisation.length - 1} more)` : ''}
                    </Alert>
                  )}
                </div>

                <div className="space-y-2.5 rounded-xl border border-line p-3">
                  <div>
                    <p className="text-2xs uppercase tracking-[0.08em] text-muted">Selling price</p>
                    <p className="num font-display text-[24px] leading-tight text-ink">{inr(p.economics.sellingPrice)}</p>
                    {p.economics.listPrice !== p.economics.sellingPrice && (
                      <p className="text-2xs text-muted">list {inr(p.economics.listPrice)} · {inr(p.economics.discountAmount)} off</p>
                    )}
                  </div>
                  <Divider />
                  <MiniRow label="Discount" value={p.economics.discountPct ? pct(p.economics.discountPct) : 'None (value-add)'} />
                  <MiniRow label={p.economics.unlimitedAccess ? 'Cost per visit' : 'Price per class'} value={inr(p.economics.effectivePricePerClass ?? p.economics.effectivePricePerVisit)} />
                  <MiniRow label="Member value" value={inr(p.economics.customerValueReceived)} />
                  <MiniRow label="They save" value={p.economics.customerSavings ? `${inr(p.economics.customerSavings)} (${pct(p.economics.customerSavingsPct ?? 0)})` : '—'} />
                  <MiniRow label="Revenue vs list" value={inr(p.economics.revenueDeltaVsReference)} />
                  <MiniRow label="Break-even units" value={p.economics.breakEvenUnits ? String(p.economics.breakEvenUnits) : '—'} />
                  {p.economics.attendance ? <p className="text-2xs leading-relaxed text-muted">Unlimited: {p.economics.attendance.visitsPerMonth} visits/month assumption.</p> : null}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {p.strategy.facts.slice(0, 2).map((f: string, idx: number) => (
                      <span key={idx} className="rounded bg-ink-50 px-2 py-1 text-2xs text-muted dark:bg-ink-800/60">{f.slice(0, 90)}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {result?.proposals?.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => saveSelected({})} disabled={!selected.length || !canCreate} loading={busy}>
                Save selected to the offer bank
              </Button>
              <Button variant="secondary" onClick={() => setSelected(result.proposals.map((p: any) => p.proposalId))}>Select all</Button>
              <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
              <span className="ml-auto text-2xs text-muted">Saved concepts arrive as drafts marked &ldquo;concept only&rdquo; — never as approved campaigns.</span>
            </div>
          ) : null}
        </div>
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name ?? ''} subtitle="Full strategist read-out" width="xl">
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniRow label="Price" value={inr(detail.economics.sellingPrice)} />
              <MiniRow label="Per class" value={inr(detail.economics.effectivePricePerClass ?? detail.economics.effectivePricePerVisit)} />
              <MiniRow label="Discount" value={detail.economics.discountPct ? pct(detail.economics.discountPct) : 'None'} />
              <MiniRow label="Scorecard" value={detail.scorecard.overall.toFixed(1)} />
            </div>
            <StrategyBlocks strategy={detail.strategy} />
            <Card>
              <CardHeader dense title="Guardrails" />
              <div className="p-3"><GuardrailList findings={detail.guardrails} /></div>
            </Card>
            <Card>
              <CardHeader dense title="Scorecard reasoning" />
              <div className="p-3"><ScorecardPanel scorecard={detail.scorecard} /></div>
            </Card>
            {detail.nameOptions?.length ? (
              <Card>
                <CardHeader dense title="Name options" />
                <div className="flex flex-wrap gap-2 p-3">
                  {detail.nameOptions.map((n: any) => <Badge key={n.name} tone="outline">{n.name}</Badge>)}
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SmallBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{title}</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-700 dark:text-ink-200">{body || '—'}</p>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-2xs uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="num text-[13px] text-ink">{value}</span>
    </div>
  );
}

function MultiPick({ options, selected, onChange }: { options: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.includes(o.id);
        return (
          <button key={o.id} onClick={() => onChange(on ? selected.filter(s => s !== o.id) : [...selected, o.id])}
            className={cn('rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
              on ? 'border-clay-300 bg-clay-50 text-clay-700 dark:border-clay-800 dark:bg-clay-950/40 dark:text-clay-300' : 'border-line text-muted hover:text-ink')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
