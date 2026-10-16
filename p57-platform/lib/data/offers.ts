/**
 * Offer write-path: create/update with optimistic concurrency, versioning, guardrail-aware
 * reapproval and full audit trail. Every write recomputes metrics through the pricing engine.
 */
import crypto from 'node:crypto';
import { getDb, newId, nowIso } from '@/lib/db';
import { computeOfferMetrics } from '@/lib/engine';
import { can, detectCommercialChange, type SessionUser } from '@/lib/auth';
import { getOffer, getSettings, listCatalogue, listOffers, logActivity, notify, nextOfferCode } from '@/lib/data';
import type { Offer, OfferStatus } from '@/lib/types';

export interface SaveResult {
  ok: boolean;
  status: number;
  offer?: Offer;
  error?: string;
  conflicts?: { field: string; current: unknown; submitted: unknown }[];
  warnings?: string[];
  requiresReapproval?: boolean;
}

export function saveOffer(payload: any, user: SessionUser): SaveResult {
  const db = getDb();
  const settings = getSettings();
  const catalogue = listCatalogue();
  const existing = payload.id ? getOffer(payload.id) : null;

  if (!existing && !can(user, 'offer:create')) {
    return { ok: false, status: 403, error: 'Your role cannot create offers.' };
  }
  if (existing && !can(user, 'offer:edit')) {
    return { ok: false, status: 403, error: 'Your role cannot edit offers.' };
  }

  // ---- optimistic concurrency -------------------------------------------------
  if (existing && payload.expectedVersion != null && payload.expectedVersion !== existing.version) {
    const current = existing;
    const conflicts = (['name', 'terms', 'audienceSegments', 'eligibility'] as const)
      .filter(f => JSON.stringify((current as any)[f]) !== JSON.stringify(payload[f]))
      .map(f => ({ field: f, current: (current as any)[f], submitted: payload[f] }));
    return {
      ok: false, status: 409,
      error: `This offer was updated by someone else (now version ${current.version}). Reload to see the latest version before saving.`,
      conflicts,
    };
  }

  const warnings: string[] = [];
  const base = payload.baseProductId ? catalogue.find(p => p.id === payload.baseProductId) ?? null : null;
  if (payload.baseProductId && !base) {
    return { ok: false, status: 400, error: 'The selected catalogue product no longer exists.' };
  }
  if (base) {
    const locationMismatch = payload.locationIds?.length && !payload.locationIds.includes(base.locationId);
    if (locationMismatch) {
      warnings.push(`${base.name} is sold at ${base.locationName}. Serving it at another studio needs manager approval.`);
    }
    if (base.productClass === 'complimentary' || base.productClass === 'operational' || base.productClass === 'internal') {
      warnings.push(`${base.name} is a ${base.productClass.replace(/_/g, ' ')} record in the source export, not a retail product. Confirm before using it as an offer basis.`);
    }
    if (base.parseConfidence !== 'high') {
      warnings.push(`${base.name} was parsed with ${base.parseConfidence} confidence — review the source record before publishing.`);
    }
  }

  const id = existing?.id ?? newId('off');
  const code = existing?.code ?? nextOfferCode();
  const now = nowIso();
  const version = existing ? existing.version + 1 : 1;

  const draft: Offer = {
    id, code,
    name: payload.name,
    internalTitle: payload.internalTitle ?? null,
    description: payload.description ?? '',
    promoCopy: payload.promoCopy ?? '',
    status: payload.status ?? 'draft',
    origin: payload.origin ?? 'manual',
    baseProductId: payload.baseProductId ?? null,
    baseProductName: base?.name ?? null,
    locationIds: payload.locationIds ?? base?.eligibility.allowedLocationIds ?? ['p57-blr-vmr'],
    components: payload.components ?? [],
    audienceSegments: payload.audienceSegments ?? [],
    objectives: payload.objectives ?? [],
    eligibility: payload.eligibility,
    terms: payload.terms,
    tags: payload.tags ?? [],
    collectionIds: payload.collectionIds ?? [],
    campaignId: payload.campaignId ?? null,
    ownerId: existing?.ownerId ?? user.id,
    collaboratorIds: payload.collaboratorIds ?? existing?.collaboratorIds ?? [],
    internalNotes: payload.internalNotes ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: existing?.publishedAt ?? null,
    expiresOn: payload.expiresOn ?? existing?.expiresOn ?? null,
    version,
    approvedVersion: existing?.approvedVersion ?? null,
    requiresReapproval: false,
    favourite: payload.favourite ?? existing?.favourite ?? false,
    pinned: payload.pinned ?? existing?.pinned ?? false,
    archivedAt: existing?.archivedAt ?? null,
    metricsSnapshot: null,
    generationContext: payload.generationContext ?? existing?.generationContext ?? null,
    conceptOnly: payload.conceptOnly ?? existing?.conceptOnly ?? true,
  };

  const needsReapproval = existing ? detectCommercialChange(existing, draft, settings.guardrails.reapprovalOnCommercialChange) : false;
  draft.requiresReapproval = needsReapproval;
  if (needsReapproval) {
    draft.approvedVersion = existing?.approvedVersion ?? null;
    warnings.push(`This offer was approved at version ${existing?.approvedVersion}. Commercial terms have changed, so approval must be renewed.`);
  }

  const allOffers = listOffers({ status: 'all', includeArchived: true }).filter(o => o.id !== id);
  const { metrics } = computeOfferMetrics(draft, {
    catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance,
    allOffers, locationLabel: draft.locationIds.join(', '),
  });
  draft.metricsSnapshot = metrics;

  const blockers = metrics.guardrails.filter(g => !g.passed && g.severity === 'blocker');
  const priceEditBlocked = blockers.some(b => b.ruleId === 'min_price_per_class' || b.ruleId === 'intro_protection') && !can(user, 'offer:override_guardrails');
  if (priceEditBlocked) {
    return {
      ok: false, status: 422,
      error: `Blocked by a commercial guardrail: ${blockers.map(b => `${b.label} — ${b.detail}`).join(' ')} ${can(user, 'offer:edit') ? 'A manager or administrator can override this in Settings if the policy allows.' : ''}`,
      warnings,
    };
  }

  const changedFields = existing ? diffFields(existing, draft) : [];

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(`UPDATE offers SET name=@name, internal_title=@internal_title, description=@description, promo_copy=@promo_copy,
        status=@status, origin=@origin, base_product_id=@base_product_id, base_product_name=@base_product_name,
        location_ids=@location_ids, components=@components, audience_segments=@audience_segments, objectives=@objectives,
        eligibility=@eligibility, terms=@terms, tags=@tags, collection_ids=@collection_ids, campaign_id=@campaign_id,
        collaborator_ids=@collaborator_ids, internal_notes=@internal_notes, updated_at=@updated_at, expires_on=@expires_on,
        version=@version, requires_reapproval=@requires_reapproval, favourite=@favourite, pinned=@pinned,
        metrics_json=@metrics_json, generation_json=@generation_json, concept_only=@concept_only WHERE id=@id`).run(row(draft));
    } else {
      db.prepare(`INSERT INTO offers (id, code, name, internal_title, description, promo_copy, status, origin,
        base_product_id, base_product_name, location_ids, components, audience_segments, objectives, eligibility, terms,
        tags, collection_ids, campaign_id, owner_id, collaborator_ids, internal_notes, created_at, updated_at,
        published_at, expires_on, version, approved_version, requires_reapproval, favourite, pinned, archived_at,
        metrics_json, generation_json, concept_only)
        VALUES (@id,@code,@name,@internal_title,@description,@promo_copy,@status,@origin,@base_product_id,@base_product_name,
        @location_ids,@components,@audience_segments,@objectives,@eligibility,@terms,@tags,@collection_ids,@campaign_id,
        @owner_id,@collaborator_ids,@internal_notes,@created_at,@updated_at,@published_at,@expires_on,@version,
        @approved_version,@requires_reapproval,@favourite,@pinned,@archived_at,@metrics_json,@generation_json,@concept_only)`).run(row(draft));
      db.prepare(`INSERT INTO offer_versions (id,offer_id,version,snapshot_json,change_summary,changed_fields,author_id,approval_state,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(newId('ver'), id, 1, JSON.stringify(draft), 'Offer created.', JSON.stringify([]), user.id, draft.status, now);
    }
    if (existing && changedFields.length) {
      db.prepare(`INSERT INTO offer_versions (id,offer_id,version,snapshot_json,change_summary,changed_fields,author_id,approval_state,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        newId('ver'), id, version, JSON.stringify(draft),
        `Edited: ${changedFields.join(', ')}.`,
        JSON.stringify(changedFields), user.id, draft.status, now);
    }
  });
  tx();

  logActivity({
    actorId: user.id, action: existing ? 'edited' : 'created', entityType: 'offer', entityId: id,
    entityLabel: `${draft.name} (${code})`,
    detail: existing ? `Updated ${changedFields.join(', ') || 'offer details'}.` : 'Created a new offer.',
    meta: { status: draft.status, discountPct: metrics.discountPct },
  });

  if (needsReapproval) {
    const approvers = ['usr_priya', 'usr_aarav'];
    for (const a of approvers) notify(a, 'Reapproval needed', `${draft.name} has commercial changes after approval.`, `/offers/${id}`);
  }

  return { ok: true, status: existing ? 200 : 201, offer: draft, warnings, requiresReapproval: needsReapproval };
}

function row(o: Offer) {
  return {
    id: o.id, code: o.code, name: o.name, internal_title: o.internalTitle, description: o.description,
    promo_copy: o.promoCopy, status: o.status, origin: o.origin, base_product_id: o.baseProductId,
    base_product_name: o.baseProductName, location_ids: JSON.stringify(o.locationIds),
    components: JSON.stringify(o.components), audience_segments: JSON.stringify(o.audienceSegments),
    objectives: JSON.stringify(o.objectives), eligibility: JSON.stringify(o.eligibility), terms: JSON.stringify(o.terms),
    tags: JSON.stringify(o.tags), collection_ids: JSON.stringify(o.collectionIds), campaign_id: o.campaignId,
    owner_id: o.ownerId, collaborator_ids: JSON.stringify(o.collaboratorIds), internal_notes: o.internalNotes,
    created_at: o.createdAt, updated_at: o.updatedAt, published_at: o.publishedAt, expires_on: o.expiresOn,
    version: o.version, approved_version: o.approvedVersion, requires_reapproval: o.requiresReapproval ? 1 : 0,
    favourite: o.favourite ? 1 : 0, pinned: o.pinned ? 1 : 0, archived_at: o.archivedAt,
    metrics_json: JSON.stringify(o.metricsSnapshot), generation_json: JSON.stringify(o.generationContext),
    concept_only: o.conceptOnly ? 1 : 0,
  };
}

function diffFields(before: Offer, after: Offer): string[] {
  const fields: (keyof Offer)[] = ['name', 'internalTitle', 'description', 'promoCopy', 'baseProductId', 'locationIds',
    'components', 'audienceSegments', 'objectives', 'eligibility', 'terms', 'tags', 'collectionIds', 'campaignId',
    'internalNotes', 'expiresOn', 'collaboratorIds'];
  return fields.filter(f => JSON.stringify(before[f]) !== JSON.stringify(after[f])).map(f => String(f));
}

export function applyWorkflowAction(args: {
  offerId: string; action: string; note?: string; version?: number; user: SessionUser;
}): { ok: boolean; status: number; offer?: Offer; error?: string } {
  const { offerId, action, note, user } = args;
  const offer = getOffer(offerId);
  if (!offer) return { ok: false, status: 404, error: 'Offer not found.' };
  const db = getDb();
  const settings = getSettings();

  const transition: Record<string, { to: OfferStatus; capability: 'offer:submit' | 'offer:approve' | 'offer:publish' | 'offer:archive'; verb: string }> = {
    submit: { to: 'in_review', capability: 'offer:submit', verb: 'Submitted for review' },
    approve: { to: 'approved', capability: 'offer:approve', verb: 'Approved' },
    request_changes: { to: 'changes_requested', capability: 'offer:approve', verb: 'Changes requested' },
    reject: { to: 'draft', capability: 'offer:approve', verb: 'Rejected back to draft' },
    publish: { to: 'published', capability: 'offer:publish', verb: 'Published' },
    expire: { to: 'expired', capability: 'offer:publish', verb: 'Marked expired' },
    archive: { to: 'archived', capability: 'offer:archive', verb: 'Archived' },
    reopen: { to: 'draft', capability: 'offer:approve', verb: 'Reopened as draft' },
  };
  const t = transition[action];
  if (!t) return { ok: false, status: 400, error: `Unknown action "${action}".` };
  if (!can(user, t.capability)) return { ok: false, status: 403, error: `Your role cannot ${action.replace('_', ' ')} offers.` };

  // Self-approval guard: an offer owner cannot approve their own offer unless they are an admin.
  if ((action === 'approve') && offer.ownerId === user.id && user.role !== 'admin') {
    return { ok: false, status: 403, error: 'You cannot approve an offer you own. Ask a manager or administrator to review it.' };
  }

  const blockers = (offer.metricsSnapshot?.guardrails ?? []).filter(g => !g.passed && g.severity === 'blocker');
  if (['submit', 'approve', 'publish'].includes(action) && blockers.length) {
    const override = can(user, 'offer:override_guardrails');
    if (!override) {
      return { ok: false, status: 422, error: `Cannot ${action}: ${blockers.map(b => b.detail).join(' ')}` };
    }
  }
  if (action === 'publish' && offer.status !== 'approved') {
    return { ok: false, status: 409, error: 'Only an approved offer can be published.' };
  }

  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE offers SET status=?, updated_at=?, published_at=?, archived_at=?, requires_reapproval=? WHERE id=?`).run(
      t.to, now,
      action === 'publish' ? now : offer.publishedAt,
      t.to === 'archived' ? now : null,
      action === 'approve' || action === 'publish' ? 0 : offer.requiresReapproval ? 1 : 0,
      offer.id);
    db.prepare(`INSERT INTO approvals (id,offer_id,version,action,actor_id,note,created_at) VALUES (?,?,?,?,?,?,?)`).run(
      newId('apr'), offer.id, args.version ?? offer.version, action, user.id, note ?? null, now);
    const updated = { ...offer, status: t.to, updatedAt: now, requirementsPatch: undefined } as Offer;
    if (action === 'approve') updated.approvedVersion = offer.version;
    if (action === 'publish') updated.publishedAt = now;
    db.prepare(`INSERT INTO offer_versions (id,offer_id,version,snapshot_json,change_summary,changed_fields,author_id,approval_state,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(newId('ver'), offer.id, offer.version, JSON.stringify(updated),
      `${t.verb}${note ? `: ${note}` : ''}.`, JSON.stringify(['status']), user.id, t.to, now);
  });
  tx();

  logActivity({
    actorId: user.id, action: action === 'request_changes' ? 'requested_changes' : action,
    entityType: 'offer', entityId: offer.id, entityLabel: `${offer.name} (${offer.code})`,
    detail: `${t.verb}${note ? ` — ${note}` : ''}`, meta: { from: offer.status, to: t.to, version: offer.version },
  });

  if (action === 'approve') notify(offer.ownerId, 'Offer approved', `${offer.name} was approved by ${user.name}.`, `/offers/${offer.id}`);
  if (action === 'request_changes') notify(offer.ownerId, 'Changes requested', `${user.name} asked for changes on ${offer.name}.`, `/offers/${offer.id}`);
  if (action === 'submit') notify('usr_priya', 'Offer awaiting review', `${offer.name} was submitted by ${user.name}.`, `/offers/${offer.id}`);
  if (action === 'publish') notify(offer.ownerId, 'Offer published', `${offer.name} is now live.`, `/offers/${offer.id}`);

  return { ok: true, status: 200, offer: getOffer(offer.id) ?? undefined };
}

export function duplicateOffer(offerId: string, user: SessionUser, nameOverride?: string): Offer | null {
  const source = getOffer(offerId);
  if (!source) return null;
  const payload = { ...source, id: undefined, name: nameOverride ?? `${source.name} (copy)`, expectedVersion: undefined };
  const res = saveOffer({ ...payload, id: undefined }, user);
  return res.offer ?? null;
}

export function remixOfferToOffer(proposal: any, user: SessionUser, extra: { collectionIds?: string[]; campaignId?: string | null } = {}): Offer | null {
  const payload = {
    name: proposal.name,
    internalTitle: proposal.internalTitle,
    description: proposal.concept,
    promoCopy: '',
    status: 'draft',
    origin: 'remix',
    baseProductId: proposal.baseProductId,
    locationIds: proposal.locationIds,
    components: proposal.components,
    audienceSegments: proposal.audienceSegments,
    objectives: proposal.objectives,
    eligibility: proposal.eligibility,
    terms: proposal.terms,
    tags: proposal.tags,
    collectionIds: extra.collectionIds ?? [proposal.collectionId],
    campaignId: extra.campaignId ?? null,
    collaboratorIds: [],
    internalNotes: '',
    conceptOnly: true,
    generationContext: {
      engine: 'local_strategist', engineVersion: proposal.strategy ? '1.4.0' : '1.4.0', mode: 'remix',
      provider: 'local_strategist',
      providerLabel: 'Local strategist engine (deterministic, catalogue-driven — no external model connected)',
      controls: {}, notes: [proposal.strategy?.concept ?? ''],
      generatedAt: nowIso(),
    },
  };
  const res = saveOffer(payload, user);
  return res.offer ?? null;
}
