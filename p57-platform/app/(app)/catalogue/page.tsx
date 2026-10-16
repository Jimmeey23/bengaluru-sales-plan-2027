import { currentUser, can } from '@/lib/auth';
import { getSettings, listCatalogue, listImports } from '@/lib/data';
import { CatalogueView } from '@/components/catalogue-view';
import { ImportsLog } from '@/components/imports-log';

export const dynamic = 'force-dynamic';

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const settings = getSettings();
  const products = listCatalogue({ includeNonRetail: true });
  const counts = {
    all: products.length,
    sellable: products.filter(p => (p.price ?? 0) > 0 && ['standard_retail', 'promotional', 'introductory', 'partner'].includes(p.productClass)).length,
    review: products.filter(p => p.status === 'review').length,
    nonRetail: products.filter(p => ['complimentary', 'operational'].includes(p.productClass)).length,
    unlimited: products.filter(p => p.unlimitedAccess).length,
    intro: products.filter(p => p.isIntroOffer).length,
  };
  const imports = listImports(8).map((i: any) => ({
    id: i.id, filename: i.filename, kind: i.kind, rows: i.rows, inserted: i.inserted, updated: i.updated,
    flagged: i.flagged, status: i.status, createdAt: i.created_at,
    rejected: (i.report ?? []).filter((r: any) => r.status === 'rejected').length,
  }));

  return (
    <div className="space-y-4">
      <CatalogueView
        products={products}
        counts={counts}
        canEdit={can(user, 'catalogue:edit')}
        unlimitedAssumption={{ visitsPerMonth: settings.attendance.visitsPerMonthDefault ?? 0, source: settings.attendance.sourceNote }}
        initialStatus={typeof sp.status === 'string' ? sp.status : undefined}
      />
      <div className="mx-auto max-w-[1400px]">
        <ImportsLog imports={imports} />
      </div>
    </div>
  );
}
