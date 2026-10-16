import { can, currentUser } from '@/lib/auth';
import { listCampaigns, listCollections, listOffers, listUsers } from '@/lib/data';
import { OfferBank } from '@/components/offer-bank';

export const dynamic = 'force-dynamic';

export default async function OfferBankPage() {
  const user = await currentUser();
  const offers = listOffers({ status: 'all', includeArchived: true, limit: 500 });
  const collections = listCollections();
  const campaigns = listCampaigns();
  const users = listUsers().map(u => ({ id: u.id, name: u.name }));

  return (
    <OfferBank
      offers={offers}
      collections={collections}
      campaigns={campaigns.map(c => ({ ...c }))}
      users={users}
      canCreate={can(user, 'offer:create')}
    />
  );
}
