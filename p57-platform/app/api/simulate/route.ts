import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getEvidence, getOffer, getSettings, listCatalogue, listOffers } from '@/lib/data';
import { computeOfferMetrics, simulateScenarios } from '@/lib/engine';
import { SIMULATOR_PRESETS as PRESETS } from '@/lib/engine/simulator';
import type { SimulationAssumptions } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = getSettings();
  const evidence = getEvidence();
  return NextResponse.json({
    simulation: settings.simulation,
    presets: PRESETS,
    observedReferences: {
      leadToMemberPct: evidence.funnel?.byStudio?.[0]?.conversionOfLeadsPct ?? null,
      trialToMemberPct: evidence.funnel?.byStudio?.[0]?.conversionOfTrialsPct ?? null,
      studioLabel: evidence.funnel?.byStudio?.[0]?.studio ?? null,
      medianVisitsPerMonth: evidence.customerBase?.behaviour?.avgSessionsPerMonth?.median ?? null,
      lapsedRecords: evidence.customerBase?.statusCounts?.Lapsed ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const settings = getSettings();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const allOffers = listOffers({ status: 'all', includeArchived: true });

  // Either an existing offer, or draft terms coming straight from the editor.
  let offer = body?.offerId ? getOffer(String(body.offerId)) : null;
  if (!offer && body?.draft) {
    const { saveOffer } = await import('@/lib/data/offers');
    // Drafts are simulated without persisting when the user has no edit rights.
    offer = {
      ...(body.draft as any), id: 'draft', code: 'DRAFT', version: 1,
      approvedVersion: null, requiresReapproval: false, favourite: false, pinned: false,
      archivedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      publishedAt: null, collaboratorIds: [], campaignId: null, tags: [], collectionIds: [],
      ownerId: user.id, conceptOnly: true, metricsSnapshot: null, generationContext: null,
      internalNotes: '', promoCopy: '', internalTitle: null, expiresOn: null,
      baseProductName: catalogue.find(p => p.id === body.draft?.baseProductId)?.name ?? null,
      status: 'draft', origin: 'manual',
    } as any;
    void saveOffer;
  }
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });

  const { metrics, economics } = computeOfferMetrics(offer, {
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers,
  });

  const overrides: Partial<SimulationAssumptions> = body?.assumptions ?? {};
  const assumptions: SimulationAssumptions = { ...settings.simulation, ...overrides };

  const observed = getEvidence();
  const funnelRow = observed.funnel?.byStudio?.[0];

  const result = simulateScenarios({
    economics,
    assumptions,
    buyersOverride: body?.buyers ?? null,
    observedConversion: body?.showObservedReference !== false && funnelRow
      ? {
        pct: funnelRow.trialToMemberPct ?? funnelRow.conversionOfLeadsPct,
        label: `trial → member conversion observed at ${funnelRow.studio} (historical, all offers combined)`,
        source: 'CRM lead export',
      }
      : null,
    baseProduct: catalogue.find(p => p.id === offer!.baseProductId) ?? null,
  });

  // Extra-class vs discount comparison, computed by the engine rather than described.
  const extraClassComparison = (() => {
    const base = catalogue.find(p => p.id === offer!.baseProductId);
    if (!base || base.unlimitedAccess || base.price == null || base.credits == null) return null;
    const rate = base.price / base.credits;
    const oneCreditCost = Math.round(rate);
    const discountForSameMoney = Math.round((oneCreditCost / base.price) * 1000) / 10;
    return {
      creditValue: oneCreditCost,
      equivalentDiscountPct: discountForSameMoney,
      verdict: discountForSameMoney > settings.guardrails.maxDiscountPct
        ? `One extra class is worth the same to the member as a ${discountForSameMoney}% discount, which is above the configured ceiling of ${settings.guardrails.maxDiscountPct}%. The credit is the cheaper way to say yes.`
        : `One extra class is worth the same to the member as a ${discountForSameMoney}% discount — inside the configured ceiling.`,
      basis: `${base.name}: ₹${Math.round(rate).toLocaleString('en-IN')} per credit at list price.`,
    };
  })();

  return NextResponse.json({ offer: { id: offer.id, name: offer.name, code: offer.code }, metrics, assumptions, result, extraClassComparison });
}
