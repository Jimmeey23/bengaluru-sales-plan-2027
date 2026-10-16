import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listNotifications, markNotificationsRead, unreadNotificationCount } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json({ notifications: listNotifications(user.id), unread: unreadNotificationCount(user.id) });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.action === 'mark_all_read' || !body?.action) markNotificationsRead(user.id);
  return NextResponse.json({ notifications: listNotifications(user.id), unread: unreadNotificationCount(user.id) });
}
