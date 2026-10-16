import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  getOffer, offerApprovals, offerComments, offerPerformance, offerVersions,
  listOffers, logActivity, notify, getSettings, listCatalogue,
} from '@/lib/data';
import { computeOfferMetrics } from '@/lib/engine';
import { saveOffer } from '@/lib/data/offers';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const offer = getOffer(id);
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });

  // Live recomputation so the panel never shows a stale snapshot after a settings change.
  const settings = getSettings();
  const catalogue = listCatalogue({ includeNonRetail: true });
  const all = listOffers({ status: 'all', includeArchived: true });
  const { metrics, economics } = computeOfferMetrics(offer, {
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: all,
  });

  return NextResponse.json({
    offer,
    metrics,
    economics,
    versions: offerVersions(offer.id),
    approvals: offerApprovals(offer.id),
    comments: offerComments(offer.id),
    performance: offerPerformance(offer.id),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const existing = getOffer(id);
  if (!existing) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  const result = saveOffer({ ...body, id: existing.id }, user);
  if (!result.ok) {
    if (result.status === 409) {
      notify(existing.ownerId, 'Concurrent edit blocked', `${existing.name} was re-saved while someone else had it open.`, `/offers/${existing.id}`);
    }
    return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.status });
  }
  return NextResponse.json({ offer: result.offer, warnings: result.warnings, requiresReapproval: result.requiresReapproval });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const offer = getOffer(id);
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  if (user.role !== 'admin' && offer.ownerId !== user.id) {
    return NextResponse.json({ error: 'Only the owner or an administrator can delete an offer. Archive it instead.' }, { status: 403 });
  }
  return NextResponse.json({ error: 'Offers are never hard-deleted — the audit trail is part of the record. Archive it instead.' }, { status: 409 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // action-style operations that are not full saves
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const offer = getOffer(id);
  if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');

  const db = getDb();
  if (action === 'restore_version') {
    const version = Number(body?.version ?? 0);
    const row = db.prepare(`SELECT * FROM offer_versions WHERE offer_id = ? AND version = ?`).get(offer.id, version) as any;
    if (!row) return NextResponse.json({ error: 'Version not found.' }, { status: 404 });
    const snapshot = JSON.parse(row.snapshot_json);
    const result = saveOffer({ ...snapshot, id: offer.id, expectedVersion: offer.version, restoreNote: `Restored from version ${version}` }, user);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    logActivity({
      actorId: user.id, action: 'restored_version', entityType: 'offer', entityId: offer.id,
      entityLabel: `${offer.name} (${offer.code})`, detail: `Restored to version ${version}.`,
    });
    return NextResponse.json({ offer: result.offer });
  }

  if (action === 'convert_to_template') {
    db.prepare(`UPDATE offers SET tags = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify([...new Set([...offer.tags, 'template'])].slice(0, 12)), new Date().toISOString(), offer.id);
    logActivity({
      actorId: user.id, action: 'converted_to_template', entityType: 'offer', entityId: offer.id,
      entityLabel: `${offer.name} (${offer.code})`, detail: 'Marked as a reusable template.',
    });
    return NextResponse.json({ offer: getOffer(offer.id) });
  }

  if (action === 'share' && body?.userId) {
    const collaboratorIds = [...new Set([...(offer.collaboratorIds ?? []), String(body.userId)])];
    db.prepare(`UPDATE offers SET collaborator_ids = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(collaboratorIds), new Date().toISOString(), offer.id);
    notify(String(body.userId), 'Added to an offer', `${user.name} added you to ${offer.name}.`, `/offers/${offer.id}`);
    logActivity({
      actorId: user.id, action: 'assigned_collaborator', entityType: 'offer', entityId: offer.id,
      entityLabel: `${offer.name} (${offer.code})`, detail: `Collaborator added.`,
    });
    return NextResponse.json({ offer: getOffer(offer.id) });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
