import { notFound } from 'next/navigation';
import { allowedTransitions, can, currentUser } from '@/lib/auth';
import {
  getOffer, getSettings, listCampaigns, listCatalogue, listCollections, listOffers, listUsers,
  offerApprovals, offerComments, offerPerformance, offerVersions,
} from '@/lib/data';
import { OfferWorkspace } from '@/components/offer-workspace';

export const dynamic = 'force-dynamic';

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const offer = getOffer(id);
  if (!offer) notFound();

  const settings = getSettings();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const allOffers = listOffers({ status: 'all', includeArchived: true, limit: 500 });

  return (
    <OfferWorkspace
      offer={offer}
      versions={offerVersions(offer.id)}
      approvals={offerApprovals(offer.id).map(a => ({ id: a.id, action: a.action, note: a.note, actorId: a.actorId, createdAt: a.createdAt, version: a.version }))}
      comments={offerComments(offer.id)}
      performance={offerPerformance(offer.id) as any[]}
      catalogue={catalogue}
      settings={{ guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, simulation: settings.simulation }}
      allOffers={allOffers}
      collections={listCollections()}
      campaigns={listCampaigns()}
      users={listUsers()}
      transitions={allowedTransitions(offer, user).map(t => ({ action: t.action, to: String(t.to), label: t.label }))}
      can={{
        edit: can(user, 'offer:edit'),
        approve: can(user, 'offer:approve'),
        publish: can(user, 'offer:publish'),
        simulate: true,
        create: can(user, 'offer:create'),
      }}
      commentsAllowed={can(user, 'comment:create')}
    />
  );
}
