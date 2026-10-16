import { allowedTransitions, can, currentUser } from '@/lib/auth';
import { listOffers, listUsers, offerApprovals, offerComments } from '@/lib/data';
import { Approvals } from '@/components/approvals';
import type { ApprovalItem } from '@/components/approvals';

export const dynamic = 'force-dynamic';

const RELEVANT = new Set(['draft', 'submitted', 'changes_requested', 'approved', 'published', 'expired']);

export default async function ApprovalsPage() {
  const user = (await currentUser())!;
  const users = listUsers();
  const offers = listOffers({ status: 'all', includeArchived: false, limit: 300 }).filter(o => RELEVANT.has(o.status));
  const AS_OF = Date.parse('2026-10-16');

  const items: ApprovalItem[] = offers.map(o => {
    const events = offerApprovals(o.id);
    const submitEvent = [...events].reverse().find(e => e.action === 'submit');
    const lastDecision = [...events].reverse().find(e => e.action === 'request_changes' || e.action === 'reject' || e.action === 'approve');
    const waitingSince = submitEvent?.createdAt ?? null;
    return {
      offer: o,
      transitions: allowedTransitions(o, user).map(t => ({ action: t.action, to: String(t.to), label: t.label })),
      waitingSince,
      waitingDays: waitingSince ? Math.max(0, Math.round((AS_OF - Date.parse(waitingSince)) / 86_400_000)) : null,
      lastNote: lastDecision?.note ?? null,
      commentCount: offerComments(o.id).length,
    };
  });

  return (
    <Approvals
      items={items}
      users={users.map(u => ({ id: u.id, name: u.name, role: u.role, avatarColor: u.avatarColor }))}
      canApprove={can(user, 'offer:approve')}
      canPublish={can(user, 'offer:publish')}
      currentUserId={user.id}
    />
  );
}
