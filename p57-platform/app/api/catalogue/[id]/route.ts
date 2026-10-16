import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { getDb, newId, nowIso } from '@/lib/db';
import { getProduct, logActivity, notify, recomputeAllOfferMetrics, productVersions } from '@/lib/data';
import { catalogueEditSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  const row = getDb().prepare(`SELECT raw_block, source_file, source_id, source_index FROM catalogue_products WHERE id = ?`).get(id) as any;
  return NextResponse.json({ product, versions: productVersions(id), source: row });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'catalogue:edit')) return NextResponse.json({ error: 'Your role cannot edit catalogue pricing.' }, { status: 403 });
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  const parsed = catalogueEditSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid edit.' }, { status: 400 });

  const db = getDb();
  const now = nowIso();
  const editable = ['name', 'price', 'duration', 'durationUnit', 'credits', 'complimentaryCredits', 'unlimitedAccess', 'privateSessionCount', 'isIntroOffer', 'status', 'description', 'audienceRestriction'] as const;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const field of editable) {
    if (!(field in (parsed.data as any))) continue;
    const next = (parsed.data as any)[field];
    const current = (product as any)[field];
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      changes[field] = { from: current, to: next };
      sets.push(`${camelToSnake(field)} = ?`);
      values.push(typeof next === 'boolean' ? (next ? 1 : 0) : next);
    }
  }
  if (parsed.data.manualReviewNote != null) {
    sets.push('manual_review_note = ?');
    values.push(parsed.data.manualReviewNote);
    changes.manualReviewNote = { from: product.manualReviewNote, to: parsed.data.manualReviewNote };
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing changed.' }, { status: 400 });

  const nextVersion = (db.prepare(`SELECT MAX(version) v FROM catalogue_versions WHERE product_id = ?`).get(id) as any)?.v ?? 1;
  const beforeSnapshot = { ...product };
  const tx = db.transaction(() => {
    db.prepare(`UPDATE catalogue_products SET ${sets.join(', ')}, modified_at = ? WHERE id = ?`).run(...values, now, id);
    db.prepare(`INSERT INTO catalogue_versions (id,product_id,version,changed_fields,snapshot_json,note,author_id,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      newId('cver'), id, nextVersion + 1, JSON.stringify(Object.keys(changes)),
      JSON.stringify(beforeSnapshot), parsed.data.note ?? 'Price/terms edited in the workspace.',
      user.id, now);
  });
  tx();

  const recalculated = recomputeAllOfferMetrics();
  logActivity({
    actorId: user.id, action: 'edited_catalogue_product', entityType: 'catalogue', entityId: id,
    entityLabel: product.name,
    detail: `Changed ${Object.keys(changes).join(', ')}. ${recalculated} offer(s) recalculated.`,
    meta: { changes },
  });
  if (changes.price) {
    notify('usr_priya', 'Catalogue price changed', `${product.name} moved from ₹${Number((changes.price.from as number) ?? 0).toLocaleString('en-IN')} to ₹${Number(changes.price.to).toLocaleString('en-IN')}. Offers based on it were recalculated.`, `/catalogue/${id}`);
  }

  return NextResponse.json({ product: getProduct(id), versions: productVersions(id), changes, recalculated });
}

function camelToSnake(s: string) {
  return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}
