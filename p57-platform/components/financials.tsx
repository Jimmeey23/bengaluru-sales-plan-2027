'use client';

/**
 * Shared commercial panels.
 *
 * The hard rule of this screen: calculated numbers are separated from assumptions and from
 * anything the platform does not know. Margin is only shown when cost data was actually supplied.
 */
import React from 'react';
import { Alert, Badge, Card, CardHeader, Divider, Tooltip, cn } from '@/components/ui';
import { ScoreBars, ScoreRadial } from '@/components/charts';
import { inr, pct } from '@/lib/format';
import type { ComputedMetrics, CannibalisationFinding, GuardrailFinding, ScorecardResult } from '@/lib/types';

export function FinancialStrip({ metrics, compact }: { metrics: ComputedMetrics; compact?: boolean }) {
  const rows = [
    { label: 'List price', value: inr(metrics.listPrice), note: 'Base catalogue product', kind: 'calc' as const },
    { label: 'Selling price', value: inr(metrics.sellingPrice), note: 'What the member pays', kind: 'calc' as const },
    {
      label: 'Discount',
      value: metrics.discountPct ? `${pct(metrics.discountPct)} · ${inr(metrics.discountAmount)}` : 'None — value-add led',
      note: 'Engine calculation', kind: 'calc' as const,
    },
    {
      label: metrics.attendanceAssumption ? 'Cost per visit' : 'Price per class',
      value: metrics.attendanceAssumption
        ? inr(metrics.effectivePricePerVisit)
        : inr(metrics.effectivePricePerClass),
      note: metrics.attendanceAssumption
        ? `Unlimited — valued at ${metrics.attendanceAssumption.visitsPerMonth} visits/month (${metrics.attendanceAssumption.source})`
        : 'Across all included classes',
      kind: 'calc' as const,
    },
    {
      label: 'Member value received',
      value: inr(metrics.customerValueReceived),
      note: metrics.customerSavingsPct ? `${inr(metrics.customerSavings)} more than they pay (${pct(metrics.customerSavingsPct)})` : 'Valued at catalogue rates',
      kind: 'calc' as const,
    },
    {
      label: 'Revenue per sale vs list',
      value: `${inr(metrics.revenueDeltaVsReference)}`,
      note: metrics.breakEvenUnits && metrics.breakEvenUnits > 1
        ? `${metrics.breakEvenUnits} sales needed to match one full-price sale`
        : 'No dilution — at or above list',
      kind: 'calc' as const,
    },
    {
      label: 'Contribution after delivery',
      value: metrics.contributionMargin != null ? inr(metrics.contributionMargin) : 'Not calculated',
      note: metrics.costBasis ?? 'Cost data has not been supplied — revenue is not profit, so nothing is estimated here.',
      kind: metrics.contributionMargin != null ? ('calc' as const) : ('unknown' as const),
    },
  ];
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-xl border border-line bg-line', compact ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7')}>
      {rows.map(r => (
        <div key={r.label} className="bg-paper p-3.5">
          <p className="text-2xs uppercase tracking-[0.08em] text-muted">{r.label}</p>
          <p className={cn('num mt-1.5 text-[16px] leading-tight', r.kind === 'unknown' ? 'text-muted' : 'text-ink')}>{r.value}</p>
          <p className="mt-1 text-2xs leading-relaxed text-muted">{r.note}</p>
        </div>
      ))}
    </div>
  );
}

export function ValueBuildUp({ metrics }: { metrics: ComputedMetrics }) {
  return (
    <div className="space-y-2">
      {metrics.notes.length > 0 && (
        <div className="rounded-lg border border-line bg-ink-50/60 p-3 text-2xs leading-relaxed text-muted dark:bg-ink-800/40">
          {metrics.notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">What the member receives</p>
      <p className="text-[12px] leading-relaxed text-muted">
        Valued at the studio&rsquo;s own catalogue rates. Extra time is shown but deliberately not priced — the catalogue
        has no list price for additional redeemable days.
      </p>
    </div>
  );
}

export function GuardrailList({ findings }: { findings: GuardrailFinding[] }) {
  const failed = findings.filter(f => !f.passed);
  const passed = findings.filter(f => f.passed);
  const tone = (s: string) => (s === 'blocker' ? 'danger' : s === 'warning' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral';
  return (
    <div className="space-y-3">
      {failed.length === 0 && (
        <Alert tone="success" title="No guardrail breaches">
          Every configured rule passes at the current terms. Rules are yours to set — nothing here is a platform-wide policy.
        </Alert>
      )}
      {failed.map(f => (
        <div key={f.ruleId} className="rounded-lg border border-line p-3">
          <div className="flex items-start gap-2">
            <Badge tone={tone(f.severity)}>{f.severity}</Badge>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-ink">{f.label}</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted">{f.detail}</p>
              {f.configurable && <p className="mt-1 text-2xs text-clay-600 dark:text-clay-400">Threshold is configurable in Settings.</p>}
            </div>
          </div>
        </div>
      ))}
      {passed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-2xs uppercase tracking-[0.08em] text-muted hover:text-ink">
            {passed.length} rule{passed.length === 1 ? '' : 's'} passing — show detail
          </summary>
          <ul className="mt-2 space-y-1.5">
            {passed.map(f => (
              <li key={f.ruleId} className="flex items-start gap-2 text-2xs leading-relaxed text-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                <span><span className="text-ink-600 dark:text-ink-300">{f.label}:</span> {f.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function CannibalisationList({ findings }: { findings: CannibalisationFinding[] }) {
  if (!findings.length) {
    return (
      <Alert tone="success" title="No displacement risk detected">
        This offer does not undercut a comparable standing product, and its discount does not sit on a high-volume line.
      </Alert>
    );
  }
  const tone = { high: 'danger', medium: 'warning', low: 'neutral' } as const;
  return (
    <div className="space-y-2.5">
      {findings.map((f, i) => (
        <div key={`${f.productId}-${i}`} className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone[f.severity]}>{f.severity} risk</Badge>
            <span className="text-[12.5px] font-medium text-ink">{f.productName}</span>
            <span className="num text-2xs text-muted">{f.metric}</span>
          </div>
          <p className="mt-1.5 text-2xs leading-relaxed text-muted">{f.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function ScorecardPanel({ scorecard }: { scorecard: ScorecardResult }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRadial score={scorecard.overall} label="heuristic" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Offer scorecard</p>
          <p className="mt-0.5 text-2xs leading-relaxed text-muted">
            A structured read of this offer&rsquo;s own design — pricing, structure, clarity and fit. It is deliberately
            <span className="text-ink"> not</span> a conversion prediction and has not been validated against outcomes.
          </p>
        </div>
      </div>
      <ScoreBars dimensions={scorecard.dimensions} />
      <Divider />
      <div className="space-y-1.5">
        {scorecard.dimensions.map(d => (
          <p key={d.key} className="text-2xs leading-relaxed text-muted">
            <span className="font-medium text-ink-600 dark:text-ink-300">{d.label}:</span> {d.reasoning}
          </p>
        ))}
      </div>
      {scorecard.disclaimer ? (
        <p className="text-2xs leading-relaxed text-muted">{scorecard.disclaimer}</p>
      ) : null}
    </div>
  );
}

export function StrategyBlocks({ strategy }: { strategy: { concept: string; whyItWorks: string; customerAppeal: string; commercialImpact: string; risks: string[]; recommendedAudience: string; salesPitch: string; alternativeApproach: string; facts: string[]; estimates: string[]; assumptions: string[]; recommendations: string[] } }) {
  const blocks = [
    { title: 'Offer concept', body: strategy.concept },
    { title: 'Why it works', body: strategy.whyItWorks },
    { title: 'Customer appeal', body: strategy.customerAppeal },
    { title: 'Commercial impact', body: strategy.commercialImpact },
    { title: 'Recommended audience', body: strategy.recommendedAudience },
    { title: 'Alternative approach', body: strategy.alternativeApproach },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {blocks.map(b => (
          <div key={b.title} className="rounded-lg border border-line p-3">
            <p className="text-2xs uppercase tracking-[0.08em] text-muted">{b.title}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">{b.body || '—'}</p>
          </div>
        ))}
      </div>

      {strategy.risks.length > 0 && (
        <div className="rounded-lg border border-line p-3">
          <p className="text-2xs uppercase tracking-[0.08em] text-muted">Potential risks</p>
          <ul className="mt-1.5 space-y-1.5">
            {strategy.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay-400" />{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <p className="text-2xs uppercase tracking-[0.08em] text-muted">Sales pitch</p>
        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">{strategy.salesPitch || '—'}</pre>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EvidenceBlock title="Calculated facts" tone="calc" items={strategy.facts} note="Arithmetic on your catalogue and terms." />
        <EvidenceBlock title="Estimates" tone="estimate" items={strategy.estimates} note="Modelled judgements — not observed outcomes." />
        <EvidenceBlock title="Assumptions" tone="assumption" items={strategy.assumptions} note="Stated so they can be challenged." />
        <EvidenceBlock title="Recommendations" tone="rec" items={strategy.recommendations} note="What the platform suggests you do next." />
      </div>
    </div>
  );
}

function EvidenceBlock({ title, items, tone, note }: { title: string; items: string[]; tone: 'calc' | 'estimate' | 'assumption' | 'rec'; note: string }) {
  const tones = {
    calc: 'border-teal-200 bg-teal-50/50 dark:border-teal-900 dark:bg-teal-950/20',
    estimate: 'border-gold-200 bg-gold-50/50 dark:border-gold-900 dark:bg-gold-950/20',
    assumption: 'border-line bg-ink-50/60 dark:bg-ink-800/40',
    rec: 'border-clay-200 bg-clay-50/50 dark:border-clay-900 dark:bg-clay-950/20',
  }[tone];
  return (
    <div className={cn('rounded-lg border p-3', tones)}>
      <div className="flex items-center justify-between">
        <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-500 dark:text-ink-300">{title}</p>
        <Tooltip content={note}><span className="text-2xs text-muted">?</span></Tooltip>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.length === 0 && <li className="text-2xs text-muted">None.</li>}
        {items.map((t, i) => <li key={i} className="text-2xs leading-relaxed text-ink-700 dark:text-ink-200">{t}</li>)}
      </ul>
    </div>
  );
}

export function MetricsFootnote({ metrics }: { metrics: ComputedMetrics }) {
  return (
    <p className="text-2xs leading-relaxed text-muted">
      Computed by the pricing engine v{metrics.engineVersion} — deterministic and independent of any AI model. Identical
      terms and settings always produce these same numbers. Values shown &ldquo;observed&rdquo; come from the supplied
      Bengaluru exports; everything else is arithmetic on the terms above.
    </p>
  );
}
