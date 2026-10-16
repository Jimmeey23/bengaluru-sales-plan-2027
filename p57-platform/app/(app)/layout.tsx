import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSettings, listNotifications, listOffers, listUsers } from '@/lib/data';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  getDb();
  // Open workspace mode: this always resolves — the session holder, or the default administrator.
  const user = await currentUser();
  const team = listUsers().map(u => ({
    id: u.id, name: u.name, role: u.role, title: u.title, avatarColor: u.avatarColor,
  }));
  const settings = getSettings();
  const notifications = listNotifications(user.id);
  const pending = listOffers({ status: 'in_review' }).length + listOffers({ status: 'changes_requested' }).length;
  const aiConnected = settings.ai.provider !== 'local_strategist' && settings.ai.keyConfigured;
  const aiLabel = aiConnected
    ? `${settings.ai.provider} · ${settings.ai.model} connected (server-side key)`
    : 'Local strategist engine — no external model connected';

  return (
    <Shell
      user={user}
      team={team}
      aiLabel={aiLabel}
      aiConnected={aiConnected}
      pendingApprovals={pending}
      notifications={notifications.map((n: any) => ({ id: n.id, title: n.title, body: n.body, href: n.href, createdAt: n.created_at, readAt: n.read_at }))}
    >
      {children}
    </Shell>
  );
}
