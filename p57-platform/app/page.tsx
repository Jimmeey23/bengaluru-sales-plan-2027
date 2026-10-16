import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The workspace opens straight into the command centre. There is no sign-in step: the platform runs
 * in open workspace mode, and the acting team member is chosen from the account menu in the header.
 * This call also brings the database up (and seeds it on first run).
 */
export default async function Root() {
  getDb();
  redirect('/command-centre');
}
