import { can, currentUser } from '@/lib/auth';
import { listCatalogue, getSettings } from '@/lib/data';
import { Generator } from '@/components/generator';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const user = await currentUser();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const settings = getSettings();
  return (
    <>
      <Generator catalogue={catalogue} canCreate={can(user, 'offer:create')} />
      <p className="mx-auto mt-4 max-w-[1500px] text-2xs leading-relaxed text-muted">
        Guardrails currently in force: {settings.guardrails.maxDiscountPct}% general discount ceiling
        {Object.keys(settings.guardrails.maxDiscountPctByClass ?? {}).length
          ? ` (${Object.entries(settings.guardrails.maxDiscountPctByClass).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}%`).join(', ')})`
          : ''}, minimum {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(settings.guardrails.minEffectivePricePerClass)} per class,
        maximum {settings.guardrails.maxValidityExtensionDays} days of extra validity. These are your workspace values — change them in Settings.
      </p>
    </>
  );
}
