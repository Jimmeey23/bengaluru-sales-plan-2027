import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { buildAnalytics } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json(buildAnalytics());
}
