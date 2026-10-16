'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea, Th, Tooltip, cn, useToast,
} from '@/components/ui';
import { dateLabel, inr, num, pct } from '@/lib/format';
import type { CatalogueProduct } from '@/lib/types';

const CLASS_LABELS: Record<string, string> = {
  standard_retail: 'Standard retail', promotional: 'Promotional', introductory: 'New-client', partner: 'Partner studio',
  complimentary: 'Complimentary', operational: 'Operational link', internal: 'Internal / test',
};

export function CatalogueView({ products, counts, canEdit, unlimitedAssumption, initialStatus }: {
  products: CatalogueProduct[]; counts: Record<string, number>; canEdit: boolean;
  unlimitedAssumption: { visitsPerMonth: number; source: string };
  initialStatus?: string;
}) {
  const { push } = useToast();
  const [rows, setRows] = useState(products);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('sellable');
  const [loc, setLoc] = useState('all');
  const [status, setStatus] = useState(initialStatus ?? 'all');
  const [unlimitedOnly, setUnlimitedOnly] = useState(false);
  const [sort, setSort] = useState<'price_desc' | 'price_asc' | 'perclass_asc' | 'name'>('price_desc');
  const [open, setOpen] = useState<CatalogueProduct | null>(null);
  const [editing, setEditing] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editNote, setEditNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ versions: any[]; source: any } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const perClass = (p: CatalogueProduct) => {
    if (p.unlimitedAccess) {
      const days = p.durationUnit === 'months' ? (p.duration ?? 1) * 30.44 : p.durationUnit === 'days' ? (p.duration ?? 30) : (p.duration ?? 1) * 7;
      const visits = (unlimitedAssumption.visitsPerMonth * days) / 30.44;
      return visits > 0 && p.price ? { value: p.price / visits, basis: `${visits.toFixed(1)} visits at ${unlimitedAssumption.visitsPerMonth}/month` } : null;
    }
    if (p.credits && p.price) return { value: p.price / p.credits, basis: `${p.credits} credits` };
    return null;
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = rows.filter(p => {
      if (cls === 'sellable' && !((p.price ?? 0) > 0 && ['standard_retail', 'promotional', 'introductory', 'partner'].includes(p.productClass))) return false;
      if (cls !== 'sellable' && cls !== 'all' && p.productClass !== cls) return false;
      if (loc !== 'all' && p.locationId !== loc) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (unlimitedOnly && !p.unlimitedAccess) return false;
      if (term && !(`${p.name} ${p.locationName} ${p.tags.join(' ')} ${p.description}`.toLowerCase().includes(term))) return false;
      return true;
    });
    out = out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const av = a.price ?? 0, bv = b.price ?? 0;
      if (sort === 'price_asc') return av - bv;
      if (sort === 'perclass_asc') return (perClass(a)?.value ?? 1e9) - (perClass(b)?.value ?? 1e9);
      return bv - av;
    });
    return out;
  }, [rows, q, cls, loc, status, unlimitedOnly, sort, unlimitedAssumption]);

  async function openDetail(p: CatalogueProduct) {
    setOpen(p); setDetail(null); setEditing(false); setEditPrice(String(p.price ?? '')); setEditNote('');
    try {
      const res = await fetch(`/api/catalogue/${p.id}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* the drawer still works without the source record */ }
  }

  async function savePrice() {
    if (!open) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/catalogue/${open.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ price: Number(editPrice), note: editNote || 'Price edited in the workspace.' }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Could not save', description: json.error, tone: 'danger' }); return; }
      setRows(prev => prev.map(p => (p.id === open.id ? json.product : p)));
      setOpen(json.product);
      setDetail(d => ({ ...(d ?? { source: null }), versions: json.versions }));
      setEditing(false);
      push({ title: 'Catalogue price updated', description: `${json.product.name} is now ${inr(json.product.price)}. ${json.recalculated} offer(s) recalculated.` });
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted">Module D</p>
          <h1 className="mt-1 font-display text-[27px] tracking-tight text-ink">Memberships &amp; pricing intelligence</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
            Every parsed record from the supplied membership export, with its pricing, validity and eligibility intact.
            Unlimited memberships have no credit count — their cost per visit uses the stated attendance assumption.
            Nothing on this screen is inferred from a price or a name.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{num(counts.all)} records</Badge>
          <Badge tone="teal">{num(counts.sellable)} sellable</Badge>
          {counts.review > 0 && <Badge tone="warning">{counts.review} need review</Badge>}
          <Badge tone="outline">{num(counts.nonRetail)} non-retail</Badge>
          {canEdit && <Button size="sm" onClick={() => setImportOpen(true)}>Import price list</Button>}
        </div>
      </header>

      <Alert tone="info" title="Where these numbers come from">
        Prices, validity and inclusions are exactly as they appear in the source export. Currency is INR and GST treatment
        is not stated in the source, so no tax is added or removed anywhere in the platform. Complimentary classes, comp
        memberships, partner studios and internal links are retained for traceability and excluded from offer generation.
      </Alert>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <Input placeholder="Search products, locations, tags…" value={q} onChange={e => setQ(e.target.value)} className="h-8 w-full sm:w-64" />
          <Select value={cls} onChange={e => setCls(e.target.value)} className="h-8 w-auto">
            <option value="sellable">Sellable only</option>
            <option value="all">All classes</option>
            {Object.entries(CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={loc} onChange={e => setLoc(e.target.value)} className="h-8 w-auto">
            <option value="all">All locations</option>
            <option value="p57-blr-vmr">Kenkere House</option>
            <option value="studio-cnc-indiranagar">Copper + Cloves</option>
            <option value="plash-pilates-sadashivnagar">Plash Pilates</option>
          </Select>
          <Select value={status} onChange={e => setStatus(e.target.value)} className="h-8 w-auto">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="review">Needs review</option>
            <option value="historical">Historical</option>
            <option value="archived">Archived / non-retail</option>
          </Select>
          <Select value={sort} onChange={e => setSort(e.target.value as any)} className="h-8 w-auto">
            <option value="price_desc">Price, high → low</option>
            <option value="price_asc">Price, low → high</option>
            <option value="perclass_asc">Price per class, low → high</option>
            <option value="name">Name</option>
          </Select>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={unlimitedOnly} onChange={e => setUnlimitedOnly(e.target.checked)} /> Unlimited only
          </label>
          <span className="ml-auto text-2xs text-muted">{filtered.length} shown</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No records match those filters" description="Widen the class or location filter to see more of the catalogue." compact />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Location</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Validity</Th>
                  <Th align="right">Inclusions</Th>
                  <Th align="right">Price / class</Th>
                  <Th align="right">Observed sales</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const pc = perClass(p);
                  return (
                    <tr key={p.id} className="cursor-pointer transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40" onClick={() => openDetail(p)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{p.name}</span>
                          {p.isIntroOffer && <Badge tone="clay">Intro</Badge>}
                          {p.unlimitedAccess && <Badge tone="teal">Unlimited</Badge>}
                          {p.warnings.length > 0 && <Tooltip content={p.warnings.join(' · ')}><Badge tone="outline">parsed with notes</Badge></Tooltip>}
                        </div>
                        <p className="mt-0.5 text-2xs text-muted">{CLASS_LABELS[p.productClass] ?? p.productClass} · source #{p.sourceId}</p>
                      </Td>
                      <Td><span className="text-[12.5px] text-muted">{p.locationName}</span></Td>
                      <Td align="right"><span className="num">{p.price != null ? inr(p.price) : '—'}</span></Td>
                      <Td align="right"><span className="text-[12.5px] text-muted">{p.duration ? `${p.duration} ${p.durationUnit}` : '—'}</span></Td>
                      <Td align="right">
                        <span className="text-[12.5px] text-muted">
                          {p.unlimitedAccess ? 'Unlimited access' : p.credits ? `${p.credits} credits` : p.privateSessionCount ? `${p.privateSessionCount} private` : '—'}
                          {p.complimentaryCredits ? ` +${p.complimentaryCredits} comp` : ''}
                        </span>
                      </Td>
                      <Td align="right">
                        {pc ? (
                          <Tooltip content={pc.basis}><span className="num">{inr(Math.round(pc.value))}</span></Tooltip>
                        ) : <span className="text-muted">—</span>}
                      </Td>
                      <Td align="right">
                        {p.observed ? (
                          <Tooltip content={`${p.observed.units} units · ${inr(p.observed.revenue)} observed · avg realised ${inr(p.observed.avgRealisedPrice)}${p.observed.discountGiven ? ` · ₹${Math.round(p.observed.discountGiven).toLocaleString('en-IN')} discount given` : ''}`}>
                            <span className="num">{p.observed.units} · {inr(p.observed.revenue, { compact: true })}</span>
                          </Tooltip>
                        ) : <span className="text-2xs text-muted">none in export</span>}
                      </Td>
                      <Td>
                        <Badge tone={p.status === 'active' ? 'success' : p.status === 'review' ? 'warning' : 'outline'}>{p.status}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? `${CLASS_LABELS[open.productClass] ?? open.productClass} · ${open.locationName} · source record #${open.sourceId}` : ''} width="xl">
        {open && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: 'Price', value: open.price != null ? inr(open.price) : '—' },
                { label: 'Validity', value: open.duration ? `${open.duration} ${open.durationUnit}` : 'Not stated' },
                { label: 'Inclusions', value: open.unlimitedAccess ? 'Unlimited access' : open.credits ? `${open.credits} credits` : open.privateSessionCount ? `${open.privateSessionCount} private classes` : '—' },
                { label: 'Price per class', value: perClass(open) ? inr(Math.round(perClass(open)!.value)) : '—', hint: perClass(open)?.basis },
              ].map(c => (
                <div key={c.label} className="rounded-lg border border-line p-3">
                  <p className="text-2xs uppercase tracking-[0.08em] text-muted">{c.label}</p>
                  <p className="num mt-1 text-[15px] text-ink">{c.value}</p>
                  {c.hint && <p className="mt-1 text-2xs leading-relaxed text-muted">{c.hint}</p>}
                </div>
              ))}
            </div>

            {open.status === 'review' && (
              <Alert tone="warning" title="Flagged for manual review">
                {open.statusBasis} Confirm the value with the studio — the platform will not guess it.
              </Alert>
            )}
            {open.observed && (
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs uppercase tracking-[0.08em] text-muted">Observed performance (Bengaluru sales export)</p>
                <p className="mt-1 text-[12.5px] text-ink">
                  {open.observed.units} units · {inr(open.observed.revenue)} · avg realised {inr(open.observed.avgRealisedPrice)} ·
                  last sale {open.observed.lastSale ? dateLabel(open.observed.lastSale) : '—'}
                  {open.observed.discountGiven ? ` · ₹${Math.round(open.observed.discountGiven).toLocaleString('en-IN')} of discount given` : ''}
                </p>
                <p className="mt-1 text-2xs text-muted">Observed in the payments export — not a projection.</p>
              </div>
            )}

            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-2xs uppercase tracking-[0.08em] text-muted">Eligibility &amp; policy in the source</p>
              </div>
              <ul className="mt-1.5 space-y-1 text-2xs leading-relaxed text-muted">
                <li>New clients only: <span className="text-ink">{open.eligibility.newClientsOnly ? 'yes' : 'no'}</span> · First purchase only: <span className="text-ink">{open.eligibility.firstPurchaseOnly ? 'yes' : 'no'}</span></li>
                <li>Location scope: <span className="text-ink">{open.locationName}</span> {open.policies.locationExclusive ? '(location-exclusive in the source)' : ''}</li>
                {open.policies.freezeAllowance != null && <li>Freeze allowance: <span className="text-ink">{open.policies.freezeAllowance}</span></li>}
                {open.policies.lateCancellationWindowHours != null && <li>Late-cancellation window: <span className="text-ink">{open.policies.lateCancellationWindowHours}h</span></li>}
                <li>Soft-deleted in source: <span className="text-ink">{open.softDeletedInSource ? 'yes' : 'no'}</span> · parse confidence: <span className="text-ink">{open.parseConfidence}</span></li>
              </ul>
            </div>

            {detail?.versions?.length ? (
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs uppercase tracking-[0.08em] text-muted">Version history</p>
                <ul className="mt-1.5 space-y-1.5">
                  {detail.versions.map(v => (
                    <li key={v.id} className="flex items-start gap-2 text-2xs text-muted">
                      <span className="num text-ink">v{v.version}</span>
                      <span>{v.note}</span>
                      <span className="ml-auto">{dateLabel(v.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer list-none text-2xs uppercase tracking-[0.08em] text-muted hover:text-ink">Original source record (traceability)</summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-ink-50 p-3 text-[10.5px] leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
{detail?.source?.raw_block ?? 'Source block not loaded.'}
              </pre>
              <p className="mt-2 text-2xs text-muted">
                File: {detail?.source?.source_file ?? open.sourceFile} · index {detail?.source?.source_index ?? open.sourceIndex} ·
                hash {open.rawBlockHash.slice(0, 16)}…
              </p>
            </details>

            {canEdit && (
              <div className="rounded-lg border border-line p-3">
                {editing ? (
                  <div className="space-y-3">
                    <Field label="New price (INR)" hint="Editing price versions the record and recalculates every offer built on it.">
                      <Input value={editPrice} onChange={e => setEditPrice(e.target.value)} inputMode="numeric" />
                    </Field>
                    <Field label="Reason for the change" hint="Stored on the version so the price history stays meaningful.">
                      <Textarea rows={2} value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="e.g. festive price confirmed by the studio on 12 Oct" />
                    </Field>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" loading={busy} onClick={savePrice}>Save and version</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-2xs text-muted">Price changes are versioned, attributed and recalculated across the bank.</p>
                    <Button size="sm" onClick={() => setEditing(true)}>Edit price</Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Link href={`/generate?mode=existing&base=${open.id}`}><Button size="sm" variant="primary">Build an offer on this</Button></Link>
              <Link href={`/strategist?base=${open.id}`}><Button size="sm" variant="secondary">Ask the strategist about it</Button></Link>
            </div>
          </div>
        )}
      </Modal>

      <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} onApplied={() => window.location.reload()} />
    </div>
  );
}

function ImportPanel({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: () => void }) {
  const { push } = useToast();
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('price-list.csv');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/catalogue/import', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv, filename, dryRun }),
      });
      const json = await res.json();
      if (!res.ok) { push({ title: 'Import failed', description: json.error, tone: 'danger' }); return; }
      setPreview(json);
      if (!dryRun) {
        push({ title: 'Import applied', description: `${json.summary.creates} created, ${json.summary.updates} updated, ${json.summary.flagged} flagged, ${json.summary.rejected} rejected.` });
        onApplied();
      }
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import a price list" subtitle="CSV in local mode — Excel exports should be saved as CSV first" width="xl"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="secondary" loading={busy} onClick={() => run(true)} disabled={!csv.trim()}>Preview</Button>
        <Button variant="primary" loading={busy} onClick={() => run(false)} disabled={!csv.trim() || !preview || preview.dryRun === false}>Apply ready rows</Button>
      </div>}>
      <div className="space-y-3">
        <Field label="File name" hint="Recorded on the import log for traceability.">
          <Input value={filename} onChange={e => setFilename(e.target.value)} />
        </Field>
        <Field label="CSV contents" hint="Required columns: name, price. Optional: location, credits, duration, duration unit, unlimited, class, intro, notes.">
          <Textarea rows={6} value={csv} onChange={e => setCsv(e.target.value)}
            placeholder={'name,price,credits,location\nStudio 15 Class Pack,15500,15,Kenkere House\nFestive 5,4450,5,Kenkere House'} />
        </Field>
        {preview && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{preview.summary.ready} ready</Badge>
              <Badge tone="warning">{preview.summary.flagged} flagged</Badge>
              <Badge tone="danger">{preview.summary.rejected} rejected</Badge>
              <Badge tone="neutral">{preview.summary.creates} new · {preview.summary.updates} updates</Badge>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
              <Table>
                <thead><tr><Th>Row</Th><Th>Product</Th><Th>Action</Th><Th>Result</Th></tr></thead>
                <tbody>
                  {preview.report.map((r: any) => (
                    <tr key={r.row}>
                      <Td><span className="num text-muted">{r.row}</span></Td>
                      <Td><span className="text-ink">{r.name}</span>{r.changes && <span className="ml-2 text-2xs text-muted">{Object.entries(r.changes).map(([k, v]: any) => `${k}: ${v.from} → ${v.to}`).join(', ')}</span>}</Td>
                      <Td><Badge tone="outline">{r.action}</Badge></Td>
                      <Td>
                        <Badge tone={r.status === 'ready' ? 'success' : r.status === 'flagged' ? 'warning' : 'danger'}>{r.status}</Badge>
                        {r.reasons.length > 0 && <p className="mt-1 text-2xs leading-relaxed text-muted">{r.reasons.join(' ')}</p>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="text-2xs text-muted">
              Flagged rows are written with their warnings attached and held for review. Rejected rows are never written —
              the platform does not fill in a missing price or an unknown studio.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
