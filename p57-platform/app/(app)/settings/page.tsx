import { CAPABILITY_MATRIX, can, currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ensureSettingsRows, getEvidence, getSettings, listCatalogue, listImports, listUsers } from '@/lib/data';
import { SettingsView } from '@/components/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  getDb();
  const user = await currentUser();
  const settings = getSettings();
  const evidence = getEvidence();
  const catalogue = listCatalogue({ includeNonRetail: true });

  // Locations come from the catalogue records themselves (the studio the product was sold at),
  // never inferred from a price. Location-exclusive products stay scoped to their own studio.
  const seen = new Map<string, string>();
  catalogue.forEach(p => { if (p.locationId && !seen.has(p.locationId)) seen.set(p.locationId, p.locationName || p.locationId); });
  const locations = Array.from(seen, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  const classes = Array.from(new Set(catalogue.map(p => p.productClass))).sort();

  return (
    <SettingsView
      settings={settings}
      users={listUsers()}
      imports={listImports(12).map((i: any) => ({
        id: i.id, filename: i.filename, kind: i.kind, rows: i.rows, inserted: i.inserted,
        updated: i.updated, flagged: i.flagged, status: i.status, createdAt: i.created_at,
        rejected: (i.report ?? []).filter((r: any) => r?.rejected).length,
      }))}
      capabilityMatrix={CAPABILITY_MATRIX}
      observedAssumptions={{
        medianVisitsPerMonth: evidence.customerBase?.behaviour?.avgSessionsPerMonth?.median ?? null,
        medianDaysSinceLastVisit: evidence.customerBase?.behaviour?.daysSinceLastVisit?.median ?? null,
        membersTracked: evidence.customerBase?.uniqueMembers ?? null,
        conversionRatePct: evidence.funnel?.byStudio?.[0]?.conversionOfTrialsPct ?? null,
        poolNote: 'Derived from the supplied CRM lead and membership exports for Bengaluru. Displayed here so any figure the simulator pre-fills can be traced to the file it came from.',
      }}
      locations={locations}
      productClasses={classes}
      catalogueCount={catalogue.length}
      currentUserId={user.id}
      canManage={can(user, 'settings:manage')}
      canManageUsers={can(user, 'users:manage')}
      canManageAi={can(user, 'settings:ai')}
    />
  );
}
