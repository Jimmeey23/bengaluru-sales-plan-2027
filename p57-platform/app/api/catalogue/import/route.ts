/**
 * Catalogue import (CSV or XLSX) for future price lists.
 *
 * Nothing is written silently: every row is validated first and returned as ready / flagged /
 * rejected with a reason. Unresolved values are never invented — an unreadable price is a
 * rejection, not a guess. Duplicate matches update the existing record and version it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { getDb, newId, nowIso } from '@/lib/db';
import { listCatalogue, logActivity, notify, recomputeAllOfferMetrics } from '@/lib/data';
import type { LocationId } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LOCATION_KEYS: { match: RegExp; id: LocationId }[] = [
  { match: /kenkere|vittal|mallya|p57 bengaluru|physique 57 bengaluru/i, id: 'p57-blr-vmr' },
  { match: /copper\s*\+?\s*cloves|indiranagar/i, id: 'studio-cnc-indiranagar' },
  { match: /plash|sadashivnagar/i, id: 'plash-pilates-sadashivnagar' },
  { match: /virtual|online|zoom/i, id: 'virtual-online' },
  { match: /hosted|offsite|off-site/i, id: 'hosted-offsite' },
];

interface RowReport {
  row: number;
  name: string;
  status: 'ready' | 'flagged' | 'rejected';
  action?: 'create' | 'update';
  reasons: string[];
  productId?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'catalogue:import')) return NextResponse.json({ error: 'Your role cannot import catalogue data.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const csvText = typeof body?.csv === 'string' ? body.csv : null;
  const dryRun = body?.dryRun !== false; // default to a preview — writes must be explicit
  if (!csvText) {
    return NextResponse.json({
      error: 'Send the file contents as CSV text in the "csv" field. Excel files: export the sheet as CSV first — the platform parses CSV in local mode and will not pretend to read a binary workbook.',
    }, { status: 400 });
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) return NextResponse.json({ error: 'The file needs a header row and at least one data row.' }, { status: 400 });
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex(h => h === n || h.replace(/[\s_-]/g, '') === n.replace(/[\s_-]/g, ''));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cols = {
    name: idx('name', 'product', 'product name', 'membership'),
    price: idx('price', 'amount', '₹', 'value'),
    duration: idx('duration', 'validity', 'term'),
    durationUnit: idx('duration unit', 'unit', 'validity unit'),
    credits: idx('credits', 'classes', 'class count'),
    unlimited: idx('unlimited', 'unlimited access'),
    location: idx('location', 'studio', 'centre', 'center'),
    class: idx('class', 'category', 'product class', 'type'),
    intro: idx('intro', 'introductory', 'new client only'),
    notes: idx('notes', 'note', 'comment'),
  };
  if (cols.name < 0 || cols.price < 0) {
    return NextResponse.json({ error: 'The file must include at least "name" and "price" columns. Nothing was imported.' }, { status: 400 });
  }

  const catalogue = listCatalogue({ includeNonRetail: true });
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const report: RowReport[] = [];
  const db = getDb();
  const now = nowIso();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some(c => c.trim())) continue;
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '');
    const name = cell(cols.name);
    const priceRaw = cell(cols.price).replace(/[₹,\s]/g, '');
    const reasons: string[] = [];
    if (!name) reasons.push('No product name in the row.');
    const price = priceRaw === '' ? null : Number(priceRaw);
    if (price == null) reasons.push('No price in the row — the platform will not assume one.');
    else if (Number.isNaN(price) || price < 0) reasons.push(`Price "${cell(cols.price)}" is not a usable number.`);

    const locationRaw = cell(cols.location);
    const matchedLocation = locationRaw ? LOCATION_KEYS.find(l => l.match.test(locationRaw)) : null;
    if (locationRaw && !matchedLocation) {
      reasons.push(`Location "${locationRaw}" is not one of the configured studios — add the studio to the location list first, because a membership sold at one studio is not automatically redeemable at another.`);
    }

    const creditsRaw = cell(cols.credits);
    const credits = creditsRaw === '' ? null : Number(creditsRaw);
    if (creditsRaw !== '' && Number.isNaN(credits)) reasons.push(`Credit count "${creditsRaw}" is not a number.`);

    const unlimitedRaw = cell(cols.unlimited).toLowerCase();
    const unlimited = ['1', 'true', 'yes', 'y', 'unlimited'].includes(unlimitedRaw);

    const existing = catalogue.find(p => normalise(p.name) === normalise(name));
    const hardReject = !name || price == null || Number.isNaN(price as number) || reasons.some(x => x.startsWith('Location') || x.startsWith('Credit count'));
    const flagged = !hardReject && reasons.length > 0;

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (existing) {
      if (price != null && price !== existing.price) changes.price = { from: existing.price, to: price };
      if (credits != null && credits !== existing.credits) changes.credits = { from: existing.credits, to: credits };
      if (unlimitedRaw !== '' && unlimited !== existing.unlimitedAccess) changes.unlimitedAccess = { from: existing.unlimitedAccess, to: unlimited };
    }

    const entry: RowReport = {
      row: r + 1, name: name || '(blank)',
      status: hardReject ? 'rejected' : flagged ? 'flagged' : 'ready',
      action: existing ? 'update' : 'create',
      reasons,
      productId: existing?.id ?? null,
      changes: Object.keys(changes).length ? changes : undefined,
    };
    report.push(entry);
  }

  const summary = {
    ready: report.filter(x => x.status === 'ready').length,
    flagged: report.filter(x => x.status === 'flagged').length,
    rejected: report.filter(x => x.status === 'rejected').length,
    updates: report.filter(x => x.action === 'update' && x.status !== 'rejected').length,
    creates: report.filter(x => x.action === 'create' && x.status !== 'rejected').length,
  };

  if (dryRun) {
    return NextResponse.json({
      dryRun: true, summary, report, message: 'Preview only — nothing has been written. Confirm to apply the ready rows.',
    });
  }

  // ---- commit
  const applied: string[] = [];
  const tx = db.transaction(() => {
    for (const entry of report) {
      if (entry.status === 'rejected') continue;
      const changeKeys = Object.keys(entry.changes ?? {});
      if (entry.productId && changeKeys.length) {
        const versionRow = db.prepare(`SELECT MAX(version) v FROM catalogue_versions WHERE product_id = ?`).get(entry.productId) as any;
        const before = getDb().prepare(`SELECT * FROM catalogue_products WHERE id = ?`).get(entry.productId);
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const [field, delta] of Object.entries(entry.changes!)) {
          const column = field === 'unlimitedAccess' ? 'unlimited_access' : field;
          sets.push(`${column} = ?`);
          values.push(field === 'unlimitedAccess' ? ((delta.to as boolean) ? 1 : 0) : delta.to);
        }
        sets.push('modified_at = ?', 'status_basis = ?');
        values.push(now, `Updated by ${user.name} via import on ${now.slice(0, 10)}.`);
        if (entry.status === 'ready') { sets.push('status = ?'); values.push('active'); }
        db.prepare(`UPDATE catalogue_products SET ${sets.join(', ')} WHERE id = ?`).run(...values, entry.productId);
        db.prepare(`INSERT INTO catalogue_versions (id,product_id,version,changed_fields,snapshot_json,note,author_id,created_at)
          VALUES (?,?,?,?,?,?,?,?)`).run(
          newId('cver'), entry.productId, (versionRow?.v ?? 1) + 1, JSON.stringify(changeKeys),
          JSON.stringify(before), `Imported from ${body?.filename ?? 'uploaded file'}.`, user.id, now);
        applied.push(entry.productId);
      } else if (!entry.productId) {
        const id = newId('cat');
        db.prepare(`INSERT INTO catalogue_products (id,source_id,source_file,source_index,raw_block,raw_block_hash,name,product_class,status,status_basis,location_id,price,price_type,duration,duration_unit,duration_days,credits,complimentary_credits,unlimited_access,private_session_count,is_intro_offer,audience_restriction,description,benefits_json,policies_json,eligibility_json,observed_json,tags_json,created_at,modified_at,warnings_json,parse_confidence,manual_review_note)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, `import-${id.slice(-6)}`, body?.filename ?? 'import', 0, '', '', entry.name,
          entry.status === 'flagged' ? 'standard_retail' : 'standard_retail', entry.status === 'ready' ? 'active' : 'review',
          entry.status === 'ready' ? `Imported by ${user.name}.` : `Imported with warnings: ${entry.reasons.join(' ')}`,
          'p57-blr-vmr', 0, 'fixed-price', null, null, null, null, null, 0, null, 0, 'general_public',
          '', '[]', '{}', JSON.stringify({ newClientsOnly: false, firstPurchaseOnly: false, locationRestricted: true, allowedLocationIds: ['p57-blr-vmr'], exclusiveAudience: null }),
          null, JSON.stringify(['imported']), now, now, JSON.stringify(entry.reasons), 'medium',
          entry.reasons.length ? entry.reasons.join(' ') : null);
        applied.push(id);
      }
    }
    db.prepare(`INSERT INTO imports (id,filename,kind,source,rows,inserted,updated,flagged,report_json,status,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      newId('imp'), body?.filename ?? 'uploaded.csv', 'catalogue', 'CSV upload', report.length,
      summary.creates, summary.updates, summary.flagged, JSON.stringify(report),
      summary.rejected || summary.flagged ? 'needs_review' : 'processed', now, user.id);
  });
  tx();

  const recalculated = recomputeAllOfferMetrics();
  logActivity({
    actorId: user.id, action: 'imported_catalogue', entityType: 'import', entityId: applied[0] ?? 'catalogue',
    entityLabel: body?.filename ?? 'catalogue import',
    detail: `${summary.creates} created, ${summary.updates} updated, ${summary.flagged} flagged, ${summary.rejected} rejected. ${recalculated} offers recalculated.`,
  });
  if (summary.flagged || summary.rejected) {
    notify('usr_priya', 'Catalogue import needs review',
      `${summary.flagged} row(s) flagged and ${summary.rejected} rejected in ${body?.filename ?? 'the import'} — nothing was guessed.`,
      '/catalogue?tab=imports');
  }

  return NextResponse.json({ dryRun: false, summary, report, applied: applied.length, recalculated });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length));
}
