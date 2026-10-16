import { NextResponse, type NextRequest } from 'next/server';
import { allowedTransitions, currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getOffer } from '@/lib/data';
import { applyWorkflowAction } from '@/lib/data/offers';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const offer = getOffer(id);
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  return NextResponse.json({ transitions: allowedTransitions(offer, user) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = applyWorkflowAction({
    offerId: id, action: String(body?.action ?? ''), note: body?.note, version: body?.version, user,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ offer: result.offer });
}
