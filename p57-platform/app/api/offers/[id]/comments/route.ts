import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb, newId, nowIso } from '@/lib/db';
import { getOffer, listUsers, logActivity, notify, offerComments } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ comments: offerComments(id), users: listUsers().map(u => ({ id: u.id, name: u.name, role: u.role })) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const offer = getOffer(id);
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const text = String(body?.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'Comments are limited to 4,000 characters.' }, { status: 400 });

  const users = listUsers();
  const mentions = users
    .filter(u => text.toLowerCase().includes(`@${u.name.toLowerCase().split(' ')[0]}`) || text.toLowerCase().includes(`@${u.name.toLowerCase()}`))
    .map(u => u.id);

  const commentId = newId('cmt');
  getDb().prepare(`INSERT INTO comments (id,offer_id,author_id,body,mentions,parent_id,created_at,resolved_at)
    VALUES (?,?,?,?,?,?,?,NULL)`).run(
    commentId, offer.id, user.id, text, JSON.stringify(mentions), body?.parentId ?? null, nowIso());

  logActivity({
    actorId: user.id, action: 'commented', entityType: 'comment', entityId: offer.id,
    entityLabel: `${offer.name} (${offer.code})`, detail: text.slice(0, 160),
  });
  for (const mentioned of mentions) {
    if (mentioned === user.id) continue;
    notify(mentioned, `${user.name} mentioned you`, `${offer.name}: ${text.slice(0, 120)}`, `/offers/${offer.id}`);
  }
  if (mentions.length === 0 && offer.ownerId !== user.id) {
    notify(offer.ownerId, `New comment on ${offer.name}`, `${user.name}: ${text.slice(0, 120)}`, `/offers/${offer.id}`);
  }

  return NextResponse.json({ comments: offerComments(offer.id) });
}
