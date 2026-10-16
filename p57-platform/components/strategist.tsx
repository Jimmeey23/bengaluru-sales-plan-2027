'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Select, Textarea, Toggle, useToast,
} from '@/components/ui';
import { GuardrailList, StrategyBlocks } from '@/components/financials';
import { AUDIENCE_LABELS, audienceLabel, inr, locationShort, pct } from '@/lib/format';
import type { Offer } from '@/lib/types';

const PROMPTS = [
  'We need to reactivate members who lapsed more than six months ago without discounting the annual plan. What would you put in front of them?',
  'Fill weekday mornings at Kenkere House over the next three weeks. Members who train at the studio only, no cash discount if we can avoid it.',
  'Convert trialists into 8-class packs before Diwali, keeping value visible at the desk.',
  'Protect revenue on the 1-month unlimited while raising commitment — what is the least destructive structure?',
  'Design something for high-value members who already buy private sessions.',
];

export function Strategist({ offers, providerLabel, connected }: { offers: Offer[]; providerLabel: string; connected: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [prompt, setPrompt] = useState('');
  const [offerId, setOfferId] = useState('');
  const [count, setCount] = useState(3);
  const [narrativeOnly, setNarrativeOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function run() {
    if (prompt.trim().length < 12 && !offerId) {
      push({ title: 'Give the strategist something to work with', description: 'Write a brief, or select an offer to review.', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'strategist', prompt: prompt.trim() || null, offerId: offerId || null,
          count, narrativeOnly,
          audience: ['existing_active_members'], objectives: ['increase_renewals'], locationIds: ['p57-blr-vmr'],
        }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Strategist failed', description: json.error, tone: 'danger' }); return; }
      setResult(json);
    } finally { setBusy(false); }
  }

  async function saveProposal(proposal: any) {
    setSaving(proposal.proposalId);
    try {
      const res = await fetch('/api/ai', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposals: [proposal], mode: 'strategist' }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not save', description: json.error, tone: 'danger' }); return; }
      push({ title: 'Concept saved to the bank', description: 'It arrives as a draft marked concept-only — nothing is approved.' });
      router.refresh();
    } finally { setSaving(null); }
  }

  const focusOffer = offers.find(o => o.id === offerId) ?? null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module C</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">AI offer strategist</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Reasons over your effective price per class, commitment, dilution, displacement, upsell path, lifetime value and
            operational load. Calculated facts, estimates, assumptions and recommendations are separated on purpose — the
            strategist never presents a projection as a fact.
          </p>
        </div>
        <Badge tone={connected ? 'teal' : 'neutral'}>{providerLabel}</Badge>
      </header>

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader dense title="Brief" subtitle="Write it as you would to a colleague" />
            <div className="space-y-3 p-3">
              <Textarea rows={6} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What are we trying to achieve, with whom, and what are the constraints?" />
              <div>
                <p className="mb-1.5 text-2xs uppercase tracking-[0.08em] text-muted">Or start from one of these</p>
                <div className="space-y-1.5">
                  {PROMPTS.map(p => (
                    <button key={p} onClick={() => setPrompt(p)}
                      className="w-full rounded-lg border border-line px-2.5 py-2 text-left text-[11.5px] leading-relaxed text-muted transition-colors hover:border-clay-200 hover:text-ink dark:hover:border-clay-800">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader dense title="Review an existing offer" subtitle="Attaches that offer's live engine numbers to the brief" />
            <div className="space-y-3 p-3">
              <Select value={offerId} onChange={e => setOfferId(e.target.value)}>
                <option value="">No offer selected</option>
                {offers.map(o => <option key={o.id} value={o.id}>{o.name} — {o.code} ({o.status.replace(/_/g, ' ')})</option>)}
              </Select>
              {focusOffer && (
                <div className="rounded-lg border border-line p-2.5 text-2xs leading-relaxed text-muted">
                  {focusOffer.name}: {inr(focusOffer.metricsSnapshot?.sellingPrice ?? focusOffer.terms.sellingPrice)} ·{' '}
                  {focusOffer.metricsSnapshot?.discountPct ? `${pct(focusOffer.metricsSnapshot.discountPct)} off list` : 'no cash discount'} ·{' '}
                  {focusOffer.audienceSegments.map(a => audienceLabel(a)).join(', ') || 'audience not set'}
                </div>
              )}
              <Field label="Alternatives to propose">
                <Select value={String(count)} onChange={e => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Toggle checked={narrativeOnly} onChange={setNarrativeOnly} label="Written advice only" hint="No new offer concepts — just the strategic read." />
              <Button variant="primary" className="w-full" onClick={run} loading={busy}>Run the strategist</Button>
            </div>
          </Card>

          <Card>
            <div className="space-y-2 p-3 text-2xs leading-relaxed text-muted">
              <p className="text-[12.5px] font-medium text-ink">What the strategist will not do</p>
              <p>It will not invent a product, a price, a credit count, a policy, a conversion rate or a cost. Anything it cannot ground in your catalogue, your settings or your exports is stated as an assumption or left unresolved.</p>
              <p>Numbers in every proposal come from the pricing engine — the same arithmetic you see in the editor and the simulator.</p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {!result && (
            <Card>
              <EmptyState
                title="Write a brief, or pick an offer to review"
                description="The strategist returns the offer concept, why it works, customer appeal, commercial impact, risks, recommended audience, a sales pitch and an alternative approach — with the evidence separated by kind."
              />
            </Card>
          )}

          {result?.focus && (
            <Card className="border-teal-200 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/20">
              <CardHeader dense title={`Reviewing: ${result.focus.name}`} subtitle="Live engine numbers attached to this brief" />
              <div className="grid gap-3 p-3 sm:grid-cols-4">
                <Metric label="Selling price" value={inr(result.focus.metrics.sellingPrice)} />
                <Metric label="Discount" value={result.focus.metrics.discountPct ? pct(result.focus.metrics.discountPct) : 'None'} />
                <Metric label="Per class" value={inr(result.focus.metrics.effectivePricePerClass ?? result.focus.metrics.effectivePricePerVisit)} />
                <Metric label="Scorecard" value={result.focus.metrics.scorecard.overall.toFixed(1)} />
              </div>
            </Card>
          )}

          {result?.narrative && (
            <Card>
              <CardHeader dense title="Strategist narrative" action={<Badge tone="outline">{result.meta?.usedModel ? 'model-assisted' : 'local engine'}</Badge>} />
              <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-relaxed text-ink-700 dark:text-ink-200">{result.narrative}</pre>
            </Card>
          )}

          {result?.proposals?.map((p: any) => (
            <Card key={p.proposalId}>
              <CardHeader
                title={<span className="flex flex-wrap items-center gap-2"><span className="font-display text-[17px]">{p.name}</span><Badge tone="clay">{p.angleLabel}</Badge></span>}
                subtitle={`${p.baseProductName} · ${p.locationIds.map((l: string) => locationShort(l)).join(', ')}`}
                action={<Button size="sm" variant="secondary" loading={saving === p.proposalId} onClick={() => saveProposal(p)}>Save concept</Button>}
              />
              <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Price" value={inr(p.economics.sellingPrice)} />
                  <Metric label="Per class" value={inr(p.economics.effectivePricePerClass ?? p.economics.effectivePricePerVisit)} />
                  <Metric label="Member value" value={inr(p.economics.customerValueReceived)} />
                  <Metric label="Revenue vs list" value={inr(p.economics.revenueDeltaVsReference)} />
                </div>
                <StrategyBlocks strategy={p.strategy} />
                <details>
                  <summary className="cursor-pointer text-2xs uppercase tracking-[0.08em] text-muted">Guardrail evaluation</summary>
                  <div className="mt-2"><GuardrailList findings={p.guardrails} /></div>
                </details>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Link href={`/generate?mode=existing&base=${p.baseProductId}`}><Button size="sm" variant="ghost">Shape it in the generator</Button></Link>
                  <Badge tone="outline">{p.evidenceNotes?.length ?? 0} evidence references</Badge>
                  <span className="ml-auto text-2xs text-muted">{result.meta?.providerLabel}</span>
                </div>
              </div>
            </Card>
          ))}

          {result && (
            <Alert tone="info" title="How this was produced">
              {result.meta?.usedModel
                ? `The configured model (${result.meta.provider} · ${result.meta.model}) drafted the language; the pricing engine priced it and evaluated the guardrails. ${result.meta.catalogueProductsSent} catalogue products were sent as context.`
                : `No external model is connected, so this brief was produced entirely by the local strategist engine and the pricing engine (v${result.meta?.engineVersion}). Connect a provider in Settings if you want richer phrasing — the numbers would not change.`}
              {result.meta?.fallbackReason ? ` Fallback reason: ${result.meta.fallbackReason}.` : ''}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="num mt-1 text-[15px] text-ink">{value}</p>
    </div>
  );
}
