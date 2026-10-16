import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listOffers, listCollections, listCampaigns } from '@/lib/data';
import { saveOffer } from '@/lib/data/offers';
import type { OfferStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const offers = listOffers({
    status: (p.get('status') as OfferStatus | 'all') ?? 'all',
    collectionId: p.get('collection') ?? undefined,
    campaignId: p.get('campaign') ?? undefined,
    ownerId: p.get('owner') ?? undefined,
    search: p.get('search') ?? p.get('q') ?? undefined,
    tag: p.get('tag') ?? undefined,
    favourite: p.get('favourite') === '1' ? true : undefined,
    audience: p.get('audience') ?? undefined,
    includeArchived: p.get('includeArchived') === '1',
    conceptOnly: p.get('conceptOnly') === '1' ? true : p.get('conceptOnly') === '0' ? false : undefined,
    limit: p.get('limit') ? Number(p.get('limit')) : undefined,
  });
  return NextResponse.json({ offers, collections: listCollections(), campaigns: listCampaigns() });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const result = saveOffer(body, user);
  if (!result.ok) return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.status });
  return NextResponse.json({ offer: result.offer, warnings: result.warnings, requiresReapproval: result.requiresReapproval });
}
