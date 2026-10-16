'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Toggle, cn, useToast } from '@/components/ui';
import { ScenarioChart } from '@/components/charts';
import { CannibalisationList, GuardrailList, ScorecardPanel } from '@/components/financials';
import { STATUS_LABELS, STATUS_TONES, audienceLabel, dateLabel, inr, locationShort, objectiveLabel, pct } from '@/lib/format';
import { computeOfferMetrics, simulateScenarios } from '@/lib/engine';
import type {
  AttendanceAssumptions, CatalogueProduct, ComputedMetrics, CostAssumptions, GuardrailConfig, Offer, SimulationAssumptions,
} from '@/lib/types';

export function Compare({
  offers, catalogue, settings, users,
}: {
  offers: Offer[]; catalogue: CatalogueProduct[];
  settings: { guardrails: GuardrailConfig; costs: CostAssumptions; attendance: AttendanceAssumptions; simulation: SimulationAssumptions };
  users: { id: string; name: string }[];
}) {
  const sp = useSearchParams();
  const { push } = useToast();
  const initial = (sp.get('offers') ?? '').split(',').filter(Boolean);
  const [picked, setPicked] = useState<string[]>(initial.slice(0, 4));
  const [slotA, setSlotA] = useState(initial[0] ?? offers[0]?.id ?? '');
  const [slotB, setSlotB] = useState(initial[1] ?? offers[1]?.id ?? '');
  const [sim, setSim] = useState<SimulationAssumptions>(settings.simulation);
  const [buyers, setBuyers] = useState<number | null>(settings.simulation.expectedBuyers ?? 25);
  const [showOnly, setShowOnly] = useState<'all' | 'differences'>('all');

  const selected = picked.map(id => offers.find(o => o.id === id)).filter(Boolean) as Offer[];

  const computed = useMemo(() => selected.map(o => ({
    offer: o,
    ...computeOfferMetrics(o, {
      catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: offers,
    }),
  })), [selected, catalogue, settings, offers]);

  function toggle(id: string) {
    setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 4)));
  }

  const slotAComputed = useMemo(() => {
    const o = offers.find(x => x.id === slotA);
    if (!o) return null;
    return { offer: o, ...computeOfferMetrics(o, { catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: offers }) };
  }, [slotA, offers, catalogue, settings]);
  const slotBComputed = useMemo(() => {
    const o = offers.find(x => x.id === slotB);
    if (!o) return null;
    return { offer: o, ...computeOfferMetrics(o, { catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: offers }) };
  }, [slotB, offers, catalogue, settings]);

  const scenarioFor = (c: typeof slotAComputed) => c ? simulateScenarios({
    economics: c.economics, assumptions: { ...sim, expectedBuyers: buyers }, buyersOverride: buyers,
    baseProduct: catalogue.find(p => p.id === c.offer.baseProductId) ?? null,
  }) : null;

  const scenarioA = scenarioFor(slotAComputed);
  const scenarioB = scenarioFor(slotBComputed);

  const rows: { label: string; value: (c: any) => React.ReactNode }[] = [
    { label: 'Status', value: c => <Badge tone={STATUS_TONES[c.offer.status as keyof typeof STATUS_TONES]}>{STATUS_LABELS[c.offer.status as keyof typeof STATUS_LABELS]}</Badge> },
    { label: 'Base package', value: c => c.offer.baseProductName ?? '—' },
    { label: 'Location', value: c => c.offer.locationIds.map((l: string) => locationShort(l)).join(', ') },
    { label: 'Audience', value: c => c.offer.audienceSegments.map((a: string) => audienceLabel(a)).join(', ') || '—' },
    { label: 'Objective', value: c => c.offer.objectives.map((o: string) => objectiveLabel(o)).join(', ') || '—' },
    { label: 'List price', value: c => inr(c.metrics.listPrice) },
    { label: 'Selling price', value: c => <span className="font-medium">{inr(c.metrics.sellingPrice)}</span> },
    { label: 'Discount', value: c => c.metrics.discountPct ? `${pct(c.metrics.discountPct)} · ${inr(c.metrics.discountAmount)}` : 'None (value-add)' },
    { label: 'Composition', value: c => composition(c.metrics, c.economics) },
    { label: 'Member value received', value: c => inr(c.metrics.customerValueReceived) },
    { label: 'Member saving', value: c => c.metrics.customerSavings ? `${inr(c.metrics.customerSavings)} (${pct(c.metrics.customerSavingsPct ?? 0)})` : '—' },
    { label: 'Price per class / visit', value: c => inr(c.metrics.effectivePricePerClass ?? c.metrics.effectivePricePerVisit) },
    { label: 'Validity', value: c => c.metrics.validityDays ? `${c.metrics.validityDays} days` : 'Not set' },
    { label: 'Revenue vs list', value: c => inr(c.metrics.revenueDeltaVsReference) },
    { label: 'Break-even units', value: c => c.metrics.breakEvenUnits ? String(c.metrics.breakEvenUnits) : '—' },
    { label: 'Contribution after delivery', value: c => c.metrics.contributionMargin != null ? inr(c.metrics.contributionMargin) : <span className="text-muted">costs not configured</span> },
    { label: 'Scorecard', value: c => `${c.metrics.scorecard.overall.toFixed(1)} / 10 (heuristic)` },
    { label: 'Guardrail breaches', value: c => {
      const failed = c.metrics.guardrails.filter((g: any) => !g.passed);
      return failed.length === 0 ? <Badge tone="success">clear</Badge> : <Badge tone={failed.some((f: any) => f.severity === 'blocker') ? 'danger' : 'warning'}>{failed.length}</Badge>;
    } },
    { label: 'Displacement risks', value: c => c.metrics.cannibalisation.length ? <Badge tone="warning">{c.metrics.cannibalisation.length}</Badge> : <Badge tone="success">none found</Badge> },
    { label: 'Proposition', value: c => <span className="text-[12px] leading-relaxed">{c.offer.description.slice(0, 180)}</span> },
    { label: 'Owner', value: c => users.find(u => u.id === c.offer.ownerId)?.name ?? '—' },
    { label: 'Updated', value: c => dateLabel(c.offer.updatedAt) },
  ];

  const visibleRows = showOnly === 'differences'
    ? rows.filter(r => new Set(computed.map(c => String(r.value(c)))).size > 1)
    : rows;

  const recommendation = useMemo(() => {
    if (computed.length < 2) return null;
    const ranked = [...computed].sort((a, b) => b.metrics.scorecard.overall - a.metrics.scorecard.overall);
    const best = ranked[0];
    const cheapest = [...computed].sort((a, b) => (a.metrics.effectivePricePerClass ?? a.metrics.effectivePricePerVisit ?? 1e9) - (b.metrics.effectivePricePerClass ?? b.metrics.effectivePricePerVisit ?? 1e9))[0];
    const safest = [...computed].sort((a, b) => (b.metrics.revenueRetentionPct ?? 0) - (a.metrics.revenueRetentionPct ?? 0))[0];
    return {
      best, cheapest, safest,
      text: [
        `${best.offer.name} scores highest on the structured read (${best.metrics.scorecard.overall.toFixed(1)}/10) — driven by ${best.metrics.scorecard.dimensions.slice().sort((a, b) => b.score - a.score)[0].label.toLowerCase()}.`,
        cheapest.offer.id !== best.offer.id ? `${cheapest.offer.name} is the cheapest per ${cheapest.metrics.attendanceAssumption ? 'visit' : 'class'} at ${inr(cheapest.metrics.effectivePricePerClass ?? cheapest.metrics.effectivePricePerVisit)}.` : '',
        safest.offer.id !== best.offer.id ? `${safest.offer.name} holds the most list price (${pct(safest.metrics.revenueRetentionPct ?? 0)} of it).` : '',
        'This ranking is a heuristic over the same calculated metrics shown above. It is not a forecast of which offer will sell better.',
      ].filter(Boolean).join(' '),
    };
  }, [computed]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module G</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Compare &amp; simulate</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Put up to four offers side by side on the numbers the engine already calculated, then change the assumptions and
            watch what follows. Assumptions are shown, editable and never hidden behind a single &ldquo;revenue&rdquo; figure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{selected.length} selected</Badge>
          <Button size="sm" variant="ghost" onClick={() => setPicked([])} disabled={!selected.length}>Clear</Button>
        </div>
      </header>

      <Card>
        <CardHeader dense title="Pick offers to compare" subtitle="Choose up to four — from any status, including drafts" />
        <div className="grid max-h-64 gap-1.5 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map(o => (
            <button key={o.id} onClick={() => toggle(o.id)}
              className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                picked.includes(o.id) ? 'border-clay-300 bg-clay-50/60 dark:border-clay-800 dark:bg-clay-950/30' : 'border-line hover:bg-ink-50 dark:hover:bg-ink-800/40')}>
              <input type="checkbox" checked={picked.includes(o.id)} readOnly />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{o.name}</span>
                <span className="block truncate text-2xs text-muted">{o.code} · {STATUS_LABELS[o.status as keyof typeof STATUS_LABELS] ?? o.status} · {inr(o.metricsSnapshot?.sellingPrice ?? o.terms.sellingPrice)}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {selected.length < 2 ? (
        <Card>
          <EmptyState
            title="Select at least two offers"
            description="The comparison shows pricing, composition, member value, dilution, validity, audience, proposition, risks and a heuristic recommendation — all from the same engine that priced them."
            action={<Link href="/offers"><Button size="sm" variant="secondary">Browse the offer bank</Button></Link>}
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Toggle checked={showOnly === 'differences'} onChange={v => setShowOnly(v ? 'differences' : 'all')} label="Show only differences" hint="Hides rows where every offer matches" />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="w-52 px-4 py-3 text-left text-2xs uppercase tracking-[0.08em] text-muted">Attribute</th>
                    {computed.map(c => (
                      <th key={c.offer.id} className="px-4 py-3 text-left align-top">
                        <Link href={`/offers/${c.offer.id}`} className="font-display text-[15px] text-ink hover:text-clay-600 dark:hover:text-clay-400">{c.offer.name}</Link>
                        <p className="mt-0.5 text-2xs font-normal text-muted">{c.offer.code}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => (
                    <tr key={r.label} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 align-top text-2xs uppercase tracking-[0.06em] text-muted">{r.label}</td>
                      {computed.map(c => <td key={c.offer.id} className="px-4 py-2.5 align-top text-ink-700 dark:text-ink-200">{r.value(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {recommendation && (
            <Card className="border-teal-200 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/20">
              <CardHeader dense title="Heuristic recommendation" subtitle="Reasoning shown against the calculated figures — not a sales forecast" />
              <p className="px-4 pb-3 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">{recommendation.text}</p>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {computed.map(c => (
              <Card key={c.offer.id}>
                <CardHeader dense title={`${c.offer.name} — risks`} subtitle={`${c.metrics.guardrails.filter(g => !g.passed).length} guardrail issue(s), ${c.metrics.cannibalisation.length} displacement risk(s)`} />
                <div className="space-y-3 p-3">
                  <CannibalisationList findings={c.metrics.cannibalisation} />
                  <GuardrailList findings={c.metrics.guardrails.filter(g => !g.passed)} />
                  <details>
                    <summary className="cursor-pointer text-2xs uppercase tracking-[0.08em] text-muted">Scorecard reasoning</summary>
                    <div className="mt-2"><ScorecardPanel scorecard={c.metrics.scorecard} /></div>
                  </details>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------ scenario simulator */}
      <Card>
        <CardHeader
          title="Scenario simulator"
          subtitle="Two offers, three scenarios, every assumption editable — the arithmetic is shown, nothing is predicted"
          action={<Badge tone="outline">Projection under your assumptions</Badge>}
        />
        <div className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <Field label="Offer A">
              <Select value={slotA} onChange={e => setSlotA(e.target.value)}>
                {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Offer B">
              <Select value={slotB} onChange={e => setSlotB(e.target.value)}>
                {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Buyers at this price" hint="Your input. The platform will not supply a conversion rate for an unrun offer.">
              <Input type="number" value={buyers ?? ''} onChange={e => setBuyers(e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Displacement (%)" hint="Share of buyers who would have bought at list anyway.">
              <Input type="number" value={sim.cannibalisationRatePct ?? 0} onChange={e => setSim(s => ({ ...s, cannibalisationRatePct: Number(e.target.value) }))} />
            </Field>
            <Field label="Delivery cost per class visit (₹)" hint="Leave blank to see contribution before delivery cost — gross revenue is not profit.">
              <Input type="number" value={sim.deliveryCostPerClass ?? ''} onChange={e => setSim(s => ({ ...s, deliveryCostPerClass: e.target.value === '' ? null : Number(e.target.value) }))} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'expected', 'optimistic'] as const).map(sc => (
                <Field key={sc} label={`${sc.slice(0, 4)}×`}>
                  <Input type="number" step="0.05" value={sim.scenarioMultipliers[sc]} onChange={e => setSim(s => ({ ...s, scenarioMultipliers: { ...s.scenarioMultipliers, [sc]: Number(e.target.value) } }))} />
                </Field>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setSim(settings.simulation); setBuyers(settings.simulation.expectedBuyers ?? 25); }}>Reset to workspace defaults</Button>
          </div>

          <div className="space-y-4">
            {[scenarioA, scenarioB].map((res, idx) => {
              const c = idx === 0 ? slotAComputed : slotBComputed;
              if (!res || !c) return null;
              if (!res.ready) {
                return (
                  <Alert key={idx} tone="warning" title={`${c.offer.name}: assumptions incomplete`}>
                    {res.blockers.join(' ')}
                  </Alert>
                );
              }
              return (
                <div key={idx} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">{c.offer.name}</p>
                    <p className="text-2xs text-muted">
                      {inr(c.metrics.sellingPrice)} · {c.metrics.discountPct ? `${pct(c.metrics.discountPct)} off ${inr(c.metrics.listPrice)}` : 'no discount'}
                      {c.metrics.attendanceAssumption ? ` · ${c.metrics.attendanceAssumption.visitsPerMonth} visits/month` : ''}
                    </p>
                  </div>
                  <div className="mt-3">
                    <ScenarioChart data={res.scenarios.map(r => ({ scenario: r.scenario, revenue: r.grossRevenue, incremental: r.incrementalRevenue, contribution: r.contribution }))} height={200} />
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[12px]">
                      <thead>
                        <tr className="border-b border-line text-2xs uppercase tracking-[0.06em] text-muted">
                          <th className="px-2 py-1.5 text-left">Scenario</th>
                          <th className="px-2 py-1.5 text-right">Buyers</th>
                          <th className="px-2 py-1.5 text-right">Gross</th>
                          <th className="px-2 py-1.5 text-right">Displaced</th>
                          <th className="px-2 py-1.5 text-right">Incremental</th>
                          <th className="px-2 py-1.5 text-right">Contribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.scenarios.map(r => (
                          <tr key={r.scenario} className="border-b border-line last:border-0">
                            <td className="px-2 py-1.5 capitalize text-ink">{r.scenario}</td>
                            <td className="px-2 py-1.5 text-right num">{r.buyers}</td>
                            <td className="px-2 py-1.5 text-right num">{inr(r.grossRevenue)}</td>
                            <td className="px-2 py-1.5 text-right num text-muted">{inr(r.displacedRevenue)}</td>
                            <td className={cn('px-2 py-1.5 text-right num', r.incrementalRevenue < 0 ? 'text-clay-600 dark:text-clay-400' : 'text-ink')}>{inr(r.incrementalRevenue)}</td>
                            <td className="px-2 py-1.5 text-right num text-muted">{sim.deliveryCostPerClass != null ? inr(r.contribution) : 'costs off'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-2xs leading-relaxed text-muted">{res.recommendation}</p>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-2xs uppercase tracking-[0.08em] text-muted">Assumption trace</summary>
                    <ul className="mt-1.5 space-y-1">
                      {[...res.assumptionTrace, ...res.scenarios[1].assumptionTrace].map((t, i) => <li key={i} className="text-2xs text-muted">{t}</li>)}
                    </ul>
                  </details>
                </div>
              );
            })}
            <p className="text-2xs leading-relaxed text-muted">
              Projection only. Buyers, displacement and delivery cost are your inputs, not observed outcomes for these offers.
              Historical funnel conversion is available in Analytics as a reference and is deliberately not applied here.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function composition(metrics: ComputedMetrics, economics: any) {
  const bits: string[] = [];
  if (economics.unlimitedAccess) bits.push('unlimited access');
  else if (economics.includedCredits) bits.push(`${economics.includedCredits} credits`);
  if (economics.bonusCredits) bits.push(`+${economics.bonusCredits} bonus`);
  if (economics.complimentaryClasses) bits.push(`+${economics.complimentaryClasses} comp`);
  if (economics.privateSessions) bits.push(`${economics.privateSessions} private`);
  if (economics.guestPasses) bits.push(`${economics.guestPasses} guest pass`);
  if (metrics.validityDeltaDays) bits.push(`${metrics.validityDeltaDays > 0 ? '+' : ''}${metrics.validityDeltaDays} days`);
  return bits.join(' · ') || '—';
}
