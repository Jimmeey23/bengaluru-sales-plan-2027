import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { getDb, newId, nowIso } from '@/lib/db';
import { listCatalogue, logActivity, getEvidence } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const all = listCatalogue({ includeNonRetail: true });
  const q = (p.get('q') ?? '').toLowerCase();
  const filtered = all.filter(prod => {
    if (p.get('class') && p.get('class') !== 'all' && prod.productClass !== p.get('class')) return false;
    if (p.get('location') && p.get('location') !== 'all' && prod.locationId !== p.get('location')) return false;
    if (p.get('status') && p.get('status') !== 'all' && prod.status !== p.get('status')) return false;
    if (p.get('unlimited') === '1' && !prod.unlimitedAccess) return false;
    if (p.get('intro') === '1' && !prod.isIntroOffer) return false;
    if (q && !(`${prod.name} ${prod.locationName} ${prod.productClass} ${prod.tags.join(' ')}`.toLowerCase().includes(q))) return false;
    return true;
  });
  return NextResponse.json({
    products: filtered,
    counts: {
      all: all.length,
      sellable: all.filter(x => (x.price ?? 0) > 0 && ['standard_retail', 'promotional', 'introductory', 'partner'].includes(x.productClass)).length,
      review: all.filter(x => x.status === 'review').length,
      nonRetail: all.filter(x => ['complimentary', 'operational'].includes(x.productClass)).length,
      unlimited: all.filter(x => x.unlimitedAccess).length,
      intro: all.filter(x => x.isIntroOffer).length,
    },
    evidence: getEvidence(),
  });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'catalogue:edit')) return NextResponse.json({ error: 'Your role cannot add catalogue records.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body?.name || body?.price == null) return NextResponse.json({ error: 'A product name and price are required.' }, { status: 400 });
  const id = newId('cat');
  const now = nowIso();
  getDb().prepare(`INSERT INTO catalogue_products (id,source_id,source_file,source_index,raw_block,raw_block_hash,name,product_class,status,status_basis,location_id,price,price_type,duration,duration_unit,duration_days,credits,complimentary_credits,unlimited_access,private_session_count,is_intro_offer,audience_restriction,description,benefits_json,policies_json,eligibility_json,observed_json,tags_json,created_at,modified_at,warnings_json,parse_confidence,manual_review_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, `manual-${id.slice(-6)}`, 'manual entry', 0, '', '', String(body.name), body.productClass ?? 'standard_retail',
    'active', `Added manually by ${user.name} on ${now.slice(0, 10)}.`, body.locationId ?? 'p57-blr-vmr', Number(body.price), body.priceType ?? 'fixed-price',
    body.duration ?? null, body.durationUnit ?? null, body.durationDays ?? null, body.credits ?? null, body.complimentaryCredits ?? null,
    body.unlimitedAccess ? 1 : 0, body.privateSessionCount ?? null, body.isIntroOffer ? 1 : 0, body.audienceRestriction ?? 'general_public',
    body.description ?? '', JSON.stringify(body.benefits ?? []), JSON.stringify(body.policies ?? {}),
    JSON.stringify({ newClientsOnly: Boolean(body.isIntroOffer), firstPurchaseOnly: Boolean(body.isIntroOffer), locationRestricted: true, allowedLocationIds: [body.locationId ?? 'p57-blr-vmr'], exclusiveAudience: null }),
    null, JSON.stringify(['manually-added']), now, now, JSON.stringify(body.warnings ?? []), 'high', body.manualReviewNote ?? null);
  logActivity({ actorId: user.id, action: 'created_catalogue_product', entityType: 'catalogue', entityId: id, entityLabel: String(body.name), detail: `Added manually at ₹${Number(body.price).toLocaleString('en-IN')}.` });
  return NextResponse.json({ product: listCatalogue({ includeNonRetail: true }).find(p => p.id === id) });
}
