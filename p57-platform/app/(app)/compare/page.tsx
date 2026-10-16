import { currentUser } from '@/lib/auth';
import { getSettings, listCatalogue, listOffers, listUsers } from '@/lib/data';
import { Compare } from '@/components/compare';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  await currentUser();
  const settings = getSettings();
  return (
    <Compare
      offers={listOffers({ status: 'all', includeArchived: true, limit: 300 })}
      catalogue={listCatalogue({ includeNonRetail: true })}
      settings={{ guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, simulation: settings.simulation }}
      users={listUsers().map(u => ({ id: u.id, name: u.name }))}
    />
  );
}
