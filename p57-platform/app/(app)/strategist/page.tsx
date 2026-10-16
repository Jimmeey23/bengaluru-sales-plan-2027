import { currentUser } from '@/lib/auth';
import { getSettings, listOffers } from '@/lib/data';
import { Strategist } from '@/components/strategist';

export const dynamic = 'force-dynamic';

export default async function StrategistPage() {
  await currentUser();
  const settings = getSettings();
  const offers = listOffers({ status: 'all', includeArchived: false, limit: 200 });
  const connected = settings.ai.provider !== 'local_strategist' && settings.ai.keyConfigured;
  return (
    <Strategist
      offers={offers}
      connected={connected}
      providerLabel={connected
        ? `${settings.ai.provider} · ${settings.ai.model} (connected)`
        : 'Local strategist engine — deterministic, catalogue-driven (no external model connected)'}
    />
  );
}
