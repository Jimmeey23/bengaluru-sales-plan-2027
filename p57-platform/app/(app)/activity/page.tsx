import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listActivity, listCatalogue, listOffers, listUsers } from '@/lib/data';
import { ActivityView } from '@/components/activity';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  getDb();
  const user = await currentUser();
  const entries = listActivity(400);
  const offers = listOffers({ includeArchived: true });

  return (
    <ActivityView
      entries={entries}
      users={listUsers().map(u => ({ id: u.id, name: u.name, role: u.role, title: u.title, avatarColor: u.avatarColor }))}
      offerIndex={offers.map(o => ({
        id: o.id, name: o.name, code: o.code, status: o.status,
        metricsSnapshot: { sellingPrice: o.metricsSnapshot?.sellingPrice ?? null },
      }))}
      catalogueCount={listCatalogue({ includeNonRetail: true }).length}
      currentUserId={user.id}
    />
  );
}
