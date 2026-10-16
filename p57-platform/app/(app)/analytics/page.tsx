import { currentUser } from '@/lib/auth';
import { buildAnalytics, listGenerations, listImports, listOffers } from '@/lib/data';
import { AnalyticsView } from '@/components/analytics';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  await currentUser();
  const analytics = buildAnalytics();
  const offers = listOffers({ status: 'all', includeArchived: true, limit: 400 });

  return (
    <AnalyticsView
      evidence={{
        sales: analytics.sales,
        funnel: analytics.funnel,
        customerBase: analytics.customerBase,
        capacity: analytics.capacity,
      }}
      catalogueStats={analytics.catalogueStats}
      offerStats={analytics.offerStats}
      generations={listGenerations(12)}
      imports={listImports(10)}
      offers={offers}
    />
  );
}
