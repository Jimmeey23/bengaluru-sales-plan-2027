import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, currentUser, login, logout, switchUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // In open workspace mode this always resolves to someone: the session holder, or the default
  // administrator when no session exists.
  const user = await currentUser();
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  getDb();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? (body?.userId ? 'switch' : 'login'));

  if (action === 'logout' || action === 'reset') {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) logout(token);
    const res = NextResponse.json({ ok: true, user: await currentUser() });
    res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  if (action === 'switch') {
    const result = switchUser(String(body?.userId ?? ''));
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const res = NextResponse.json({ user: result.user });
    res.cookies.set(SESSION_COOKIE, result.token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400 });
    return res;
  }

  // Email/password sign-in is retained for the day a real identity provider is connected; nothing
  // in the workspace links to it.
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');
  if (!email || !password) {
    return NextResponse.json({ error: 'Provide a userId to switch member, or email and password to sign in.' }, { status: 400 });
  }

  const result = login(email, password);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 401 });

  const res = NextResponse.json({ user: result.user });
  res.cookies.set(SESSION_COOKIE, result.token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400 });
  return res;
}
