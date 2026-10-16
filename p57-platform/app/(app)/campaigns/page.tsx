import { can, currentUser } from '@/lib/auth';
import { listCampaigns, listOffers, listUsers } from '@/lib/data';
import { Campaigns } from '@/components/campaigns';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const user = (await currentUser())!;
  return (
    <Campaigns
      campaigns={listCampaigns()}
      offers={listOffers({ status: 'all', includeArchived: false, limit: 300 })}
      users={listUsers().map(u => ({ id: u.id, name: u.name, avatarColor: u.avatarColor }))}
      canManage={can(user, 'campaign:manage')}
    />
  );
}
