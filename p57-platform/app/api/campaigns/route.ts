import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { getDb, newId, nowIso } from '@/lib/db';
import { listCampaigns, listOffers, logActivity, notify } from '@/lib/data';
import { campaignSchema } from '@/lib/validation';
import type { Campaign } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const campaigns = listCampaigns();
  const offers = listOffers({ status: 'all', includeArchived: true });
  return NextResponse.json({
    campaigns: campaigns.map(c => ({ ...c, linkedOffers: offers.filter(o => o.campaignId === c.id).map(o => ({ id: o.id, name: o.name, code: o.code, status: o.status })) })),
    offers: offers.map(o => ({ id: o.id, name: o.name, code: o.code, campaignId: o.campaignId, status: o.status })),
  });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'offer:create')) return NextResponse.json({ error: 'Your role cannot create campaigns.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid campaign.' }, { status: 400 });
  const c = parsed.data as Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'offerIds'> & { offerIds?: string[] };
  const id = newId('cmp');
  const now = nowIso();
  getDb().prepare(`INSERT INTO campaigns (id,name,slug,objective,description,audience_segments,location_ids,start_date,end_date,status,offer_ids,owner_id,member_ids,messaging,expected_json,actuals_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, c.name, (c as any).slug ?? c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48),
    c.objective, c.description ?? '', JSON.stringify(c.audienceSegments ?? []), JSON.stringify(c.locationIds ?? []),
    c.startDate, c.endDate, c.status ?? 'planned', JSON.stringify(c.offerIds ?? []), user.id,
    JSON.stringify(c.memberIds ?? [user.id]), c.messaging ?? '',
    JSON.stringify(c.expectedOutcomes ?? []), c.actuals ? JSON.stringify(c.actuals) : null, now, now);
  logActivity({ actorId: user.id, action: 'created_campaign', entityType: 'campaign', entityId: id, entityLabel: c.name, detail: c.objective });
  return NextResponse.json({ campaign: listCampaigns().find(x => x.id === id) });
}
