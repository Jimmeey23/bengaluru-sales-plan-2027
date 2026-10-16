/**
 * Identity and authorisation.
 *
 * OPEN WORKSPACE MODE: there is no sign-in screen. Anyone opening the workspace is treated as the
 * studio director (Administrator) unless they switch to another team member from the account menu.
 * Switching only changes whose permissions and notifications are in play — it is not a security
 * boundary, and the workspace says so in the UI.
 *
 * The session mechanism underneath (a signed cookie in the workspace database) is real: if an
 * identity provider is added later, `login()` is the seam where it plugs in. No external identity
 * provider is claimed, and this mode must not be exposed publicly as-is.
 */
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb, newId, nowIso } from '@/lib/db';
import { getUser, getUserByEmail, listUsers } from '@/lib/data';
import { verifyPassword } from '@/lib/db/seed';
import type { Offer, OfferStatus, Role, User } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/roles';

export { ROLE_LABELS };

export const SESSION_COOKIE = 'p57_session';

export interface SessionUser extends User {}

/** The person the workspace opens as when nobody has switched. */
export const DEFAULT_USER_ID = 'usr_aarav';

/**
 * Resolves the acting user. In open workspace mode there is no null case: an unrecognised or
 * absent session falls back to the default administrator so every route is usable immediately.
 */
export async function currentUser(): Promise<SessionUser> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token) as any;
    if (row) {
      if (Date.parse(row.expires_at) < Date.now()) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
      else {
        const user = getUser(row.user_id);
        if (user) return user;
      }
    }
  }
  return getUser(DEFAULT_USER_ID) ?? listUsers()[0];
}

/** Switches the acting member. Used by the account menu; no password, and clearly not a gate. */
export function switchUser(userId: string): { token: string; user: User } | { error: string } {
  const found = getUser(userId);
  if (!found) return { error: 'That team member could not be found.' };
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(found.id);
  getDb().prepare(`INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)`).run(token, found.id, nowIso(), expires);
  return { token, user: found };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export function login(email: string, password: string): { token: string; user: User } | { error: string } {
  const found = getUserByEmail(email.trim());
  if (!found) return { error: 'No account found for that email address.' };
  if (!verifyPassword(password, found.passwordHash)) return { error: 'That password does not match our records.' };
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  getDb().prepare(`INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)`).run(token, found.id, nowIso(), expires);
  const { passwordHash, ...user } = found;
  return { token, user };
}

export function logout(token: string) {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}


// ---------------------------------------------------------------- permissions

export type Capability =
  | 'offer:create' | 'offer:edit' | 'offer:edit_pricing' | 'offer:delete' | 'offer:submit'
  | 'offer:approve' | 'offer:publish' | 'offer:override_guardrails' | 'offer:archive'
  | 'campaign:manage' | 'catalogue:edit' | 'catalogue:import' | 'settings:manage'
  | 'users:manage' | 'settings:ai' | 'comment:create' | 'performance:record' | 'offer:comment_only';

const MATRIX: Record<Role, Capability[]> = {
  admin: ['offer:create', 'offer:edit', 'offer:edit_pricing', 'offer:delete', 'offer:submit', 'offer:approve',
    'offer:publish', 'offer:override_guardrails', 'offer:archive', 'campaign:manage', 'catalogue:edit',
    'catalogue:import', 'settings:manage', 'users:manage', 'settings:ai', 'comment:create', 'performance:record'],
  manager: ['offer:create', 'offer:edit', 'offer:edit_pricing', 'offer:delete', 'offer:submit', 'offer:approve',
    'offer:publish', 'offer:archive', 'campaign:manage', 'catalogue:edit', 'catalogue:import', 'comment:create', 'performance:record'],
  sales: ['offer:create', 'offer:edit', 'offer:edit_pricing', 'offer:submit', 'comment:create'],
  viewer: [],
};

/** The role → capability matrix, exported so the settings page can render the permission grid. */
export const CAPABILITY_MATRIX: Record<Role, Capability[]> = MATRIX;

/** Every capability the platform understands, in a stable order for the permission grid. */
export const ALL_CAPABILITIES: Capability[] = Array.from(
  new Set(Object.values(MATRIX).flat()),
).sort();

export function can(user: SessionUser | null, capability: Capability): boolean {
  if (!user) return false;
  return MATRIX[user.role]?.includes(capability) ?? false;
}

export function capabilities(user: SessionUser | null): Capability[] {
  return user ? MATRIX[user.role] ?? [] : [];
}

// ---------------------------------------------------------------- workflow

export const WORKFLOW: { status: OfferStatus; label: string; meaning: string }[] = [
  { status: 'draft', label: 'Draft', meaning: 'Being written. Not visible outside the owner and collaborators.' },
  { status: 'in_review', label: 'Submitted for review', meaning: 'Awaiting a manager or administrator decision.' },
  { status: 'changes_requested', label: 'Changes requested', meaning: 'A reviewer has asked for specific amendments.' },
  { status: 'approved', label: 'Approved', meaning: 'Commercially approved for the version shown. Not yet live.' },
  { status: 'published', label: 'Published', meaning: 'Live in market. Commercial edits trigger reapproval.' },
  { status: 'expired', label: 'Expired', meaning: 'Past its redemption or purchase window.' },
  { status: 'archived', label: 'Archived', meaning: 'Retired but retained for history and reporting.' },
];

export function allowedTransitions(offer: Offer, user: SessionUser | null): { action: string; to: OfferStatus; label: string; requiresCapability?: Capability }[] {
  if (!user) return [];
  const isReviewer = can(user, 'offer:approve');
  const isOwner = offer.ownerId === user.id || offer.collaboratorIds.includes(user.id);
  const out: { action: string; to: OfferStatus; label: string; requiresCapability?: Capability }[] = [];
  if (offer.status === 'draft' || offer.status === 'changes_requested') {
    if (isOwner || isReviewer) out.push({ action: 'submit', to: 'in_review', label: 'Submit for review', requiresCapability: 'offer:submit' });
  }
  if (offer.status === 'in_review' && isReviewer) {
    out.push({ action: 'approve', to: 'approved', label: 'Approve', requiresCapability: 'offer:approve' });
    out.push({ action: 'request_changes', to: 'changes_requested', label: 'Request changes', requiresCapability: 'offer:approve' });
    out.push({ action: 'reject', to: 'draft', label: 'Reject back to draft', requiresCapability: 'offer:approve' });
  }
  if (offer.status === 'approved' && isReviewer) {
    out.push({ action: 'publish', to: 'published', label: 'Publish', requiresCapability: 'offer:publish' });
    out.push({ action: 'reopen', to: 'draft', label: 'Reopen as draft', requiresCapability: 'offer:approve' });
  }
  if (offer.status === 'published' && isReviewer) {
    out.push({ action: 'expire', to: 'expired', label: 'Mark expired', requiresCapability: 'offer:publish' });
  }
  if (offer.status === 'expired' && isReviewer) {
    out.push({ action: 'archive', to: 'archived', label: 'Archive', requiresCapability: 'offer:archive' });
    out.push({ action: 'reopen', to: 'draft', label: 'Reopen as draft', requiresCapability: 'offer:approve' });
  }
  if (['approved', 'published', 'in_review'].includes(offer.status) && isReviewer) {
    out.push({ action: 'archive', to: 'archived', label: 'Archive', requiresCapability: 'offer:archive' });
  }
  return out;
}

/** A commercial change to an approved/published offer requires reapproval when configured. */
export function detectCommercialChange(before: Offer, after: Partial<Offer>, reapprovalRequired: boolean): boolean {
  if (!reapprovalRequired) return false;
  if (!['approved', 'published'].includes(before.status)) return false;
  const termsChanged = JSON.stringify(before.terms) !== JSON.stringify({ ...before.terms, ...(after.terms ?? {}) });
  const baseChanged = (after.baseProductId ?? before.baseProductId) !== before.baseProductId;
  const componentsChanged = after.components ? JSON.stringify(after.components) !== JSON.stringify(before.components) : false;
  const eligibilityChanged = after.eligibility ? JSON.stringify(after.eligibility) !== JSON.stringify(before.eligibility) : false;
  return termsChanged || baseChanged || componentsChanged || eligibilityChanged;
}
