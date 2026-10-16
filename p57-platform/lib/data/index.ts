/**
 * Data access layer. All SQL lives here so the rest of the app deals in domain objects and the
 * storage engine could be swapped without touching product code.
 */
import { getDb, jsonGet, newId, nowIso, readDerived } from '@/lib/db';
import { computeOfferMetrics, worstSeverity } from '@/lib/engine';
import { DEFAULT_ATTENDANCE, DEFAULT_COSTS, DEFAULT_GUARDRAILS, DEFAULT_SIMULATION, COLLECTIONS as COLLECTION_DEFS, ENGINE_VERSION } from '@/lib/engine/pricing';
import type {
  ActivityEntry, AIProviderConfig, AnalyticsBundle, ApprovalEvent, AttendanceAssumptions, Campaign,
  CatalogueProduct, Collection, Comment, CostAssumptions, GuardrailConfig, IntegrationConfig, Offer,
  OfferStatus, OfferVersion, Role, SettingsBundle, SimulationAssumptions, User,
} from '@/lib/types';

// ---------------------------------------------------------------- mappers

function mapUser(r: any): User {
  return { id: r.id, name: r.name, email: r.email, role: r.role, title: r.title, avatarColor: r.avatar_color, createdAt: r.created_at };
}

function mapProduct(r: any): CatalogueProduct {
  return {
    id: r.id, sourceId: r.source_id, sourceIdTail: null, sourceFile: r.source_file, sourceIndex: r.source_index,
    rawBlockHash: r.raw_block_hash, name: r.name, productClass: r.product_class, exclusionReason: r.exclusion_reason,
    status: r.status, statusBasis: r.status_basis, locationId: r.location_id,
    locationName: r.location_id === 'p57-blr-vmr' ? 'Physique 57 Bengaluru (Vittal Mallya Road)'
      : r.location_id === 'studio-cnc-indiranagar' ? 'Studio by Copper + Cloves, Indiranagar'
      : r.location_id === 'plash-pilates-sadashivnagar' ? 'Plash Pilates, Sadashivnagar'
      : r.location_id === 'virtual-online' ? 'Virtual / Online' : 'Hosted / off-site',
    price: r.price, priceType: r.price_type, duration: r.duration, durationUnit: r.duration_unit,
    credits: r.credits, complimentaryCredits: r.complimentary_credits, creditSource: r.credit_source,
    unlimitedAccess: Boolean(r.unlimited_access), privateSessionCount: r.private_session_count,
    isIntroOffer: Boolean(r.is_intro_offer), audienceRestriction: r.audience_restriction,
    description: r.description, benefits: jsonGet<string[]>(r, 'benefits_json', []),
    policies: jsonGet(r, 'policies_json', {}), eligibility: jsonGet(r, 'eligibility_json', {
      newClientsOnly: false, firstPurchaseOnly: false, locationRestricted: false,
      allowedLocationIds: [r.location_id], exclusiveAudience: null,
    } as any),
    createdAt: r.created_at, modifiedAt: r.modified_at, softDeletedInSource: Boolean(r.soft_deleted),
    parseConfidence: r.parse_confidence, warnings: jsonGet<string[]>(r, 'warnings_json', []),
    manualReviewNote: r.manual_review_note, tags: jsonGet<string[]>(r, 'tags_json', []),
    observed: jsonGet(r, 'observed_json', null),
  };
}

function mapOffer(r: any): Offer {
  return {
    id: r.id, code: r.code, name: r.name, internalTitle: r.internal_title, description: r.description,
    promoCopy: r.promo_copy, status: r.status, origin: r.origin, baseProductId: r.base_product_id,
    baseProductName: r.base_product_name, locationIds: jsonGet(r, 'location_ids', []),
    components: jsonGet(r, 'components', []), audienceSegments: jsonGet(r, 'audience_segments', []),
    objectives: jsonGet(r, 'objectives', []), eligibility: jsonGet(r, 'eligibility', {} as any),
    terms: jsonGet(r, 'terms', {} as any), tags: jsonGet(r, 'tags', []),
    collectionIds: jsonGet(r, 'collection_ids', []), campaignId: r.campaign_id, ownerId: r.owner_id,
    collaboratorIds: jsonGet(r, 'collaborator_ids', []), internalNotes: r.internal_notes,
    createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at, expiresOn: r.expires_on,
    version: r.version, approvedVersion: r.approved_version, requiresReapproval: Boolean(r.requires_reapproval),
    favourite: Boolean(r.favourite), pinned: Boolean(r.pinned), archivedAt: r.archived_at,
    metricsSnapshot: jsonGet(r, 'metrics_json', null), generationContext: jsonGet(r, 'generation_json', null),
    conceptOnly: Boolean(r.concept_only),
  };
}

function mapCampaign(r: any): Campaign {
  return {
    id: r.id, name: r.name, slug: r.slug, objective: r.objective, description: r.description,
    audienceSegments: jsonGet(r, 'audience_segments', []), locationIds: jsonGet(r, 'location_ids', []),
    startDate: r.start_date, endDate: r.end_date, status: r.status, offerIds: jsonGet(r, 'offer_ids', []),
    ownerId: r.owner_id, memberIds: jsonGet(r, 'member_ids', []), messaging: r.messaging,
    expectedOutcomes: jsonGet(r, 'expected_json', []), actuals: jsonGet(r, 'actuals_json', null),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------- reads

export function listUsers(): User[] {
  return (getDb().prepare(`SELECT * FROM users ORDER BY role, name`).all() as any[]).map(mapUser);
}

export function getUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const r = getDb().prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`).get(email) as any;
  return r ? { ...mapUser(r), passwordHash: r.password_hash } : null;
}

export function getUser(id: string): User | null {
  const r = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as any;
  return r ? mapUser(r) : null;
}

export function listCatalogue(filter: { includeNonRetail?: boolean } = {}): CatalogueProduct[] {
  const rows = getDb().prepare(`SELECT * FROM catalogue_products ORDER BY price DESC`).all() as any[];
  const mapped = rows.map(mapProduct);
  return filter.includeNonRetail ? mapped : mapped.filter(p => !['internal'].includes(p.productClass));
}

export function getProduct(id: string): CatalogueProduct | null {
  const r = getDb().prepare(`SELECT * FROM catalogue_products WHERE id = ?`).get(id) as any;
  return r ? mapProduct(r) : null;
}

export function productVersions(productId: string) {
  return (getDb().prepare(`SELECT * FROM catalogue_versions WHERE product_id = ? ORDER BY version DESC`).all(productId) as any[])
    .map(v => ({ id: v.id, version: v.version, changedFields: jsonGet<string[]>(v, 'changed_fields', []), note: v.note, authorId: v.author_id, createdAt: v.created_at, snapshot: jsonGet(v, 'snapshot_json', null) }));
}

export function listOffers(filter: {
  status?: OfferStatus | 'all'; collectionId?: string; campaignId?: string; ownerId?: string;
  search?: string; tag?: string; favourite?: boolean; audience?: string; includeArchived?: boolean;
  conceptOnly?: boolean; limit?: number;
} = {}): Offer[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (filter.status && filter.status !== 'all') { clauses.push(`status = ?`); params.push(filter.status); }
  else if (!filter.includeArchived) { clauses.push(`status != 'archived'`); }
  if (filter.collectionId) { clauses.push(`collection_ids LIKE ?`); params.push(`%"${filter.collectionId}"%`); }
  if (filter.campaignId) { clauses.push(`campaign_id = ?`); params.push(filter.campaignId); }
  if (filter.ownerId) { clauses.push(`owner_id = ?`); params.push(filter.ownerId); }
  if (filter.tag) { clauses.push(`tags LIKE ?`); params.push(`%"${filter.tag}"%`); }
  if (filter.favourite) clauses.push(`favourite = 1`);
  if (filter.audience) { clauses.push(`audience_segments LIKE ?`); params.push(`%"${filter.audience}"%`); }
  if (filter.conceptOnly != null) { clauses.push(`concept_only = ?`); params.push(filter.conceptOnly ? 1 : 0); }
  if (filter.search) {
    clauses.push(`(name LIKE ? OR internal_title LIKE ? OR description LIKE ? OR base_product_name LIKE ? OR code LIKE ? OR tags LIKE ?)`);
    const q = `%${filter.search}%`;
    params.push(q, q, q, q, q, q);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filter.limit ?? 400;
  const rows = getDb().prepare(`SELECT * FROM offers ${where} ORDER BY pinned DESC, updated_at DESC LIMIT ${limit}`).all(...params) as any[];
  return rows.map(mapOffer);
}

export function getOffer(id: string): Offer | null {
  const r = getDb().prepare(`SELECT * FROM offers WHERE id = ? OR code = ?`).get(id, id) as any;
  return r ? mapOffer(r) : null;
}

export function offerVersions(offerId: string): OfferVersion[] {
  return (getDb().prepare(`SELECT * FROM offer_versions WHERE offer_id = ? ORDER BY version DESC`).all(offerId) as any[]).map(v => ({
    id: v.id, offerId: v.offer_id, version: v.version, snapshot: jsonGet<Offer>(v, 'snapshot_json', null as unknown as Offer),
    changeSummary: v.change_summary, changedFields: jsonGet(v, 'changed_fields', []),
    authorId: v.author_id, createdAt: v.created_at, approvalState: v.approval_state,
  }));
}

export function offerApprovals(offerId: string): ApprovalEvent[] {
  return (getDb().prepare(`SELECT * FROM approvals WHERE offer_id = ? ORDER BY created_at DESC`).all(offerId) as any[]).map(a => ({
    id: a.id, offerId: a.offer_id, version: a.version, action: a.action, actorId: a.actor_id, note: a.note, createdAt: a.created_at,
  }));
}

export function offerComments(offerId: string): Comment[] {
  return (getDb().prepare(`SELECT * FROM comments WHERE offer_id = ? ORDER BY created_at ASC`).all(offerId) as any[]).map(c => ({
    id: c.id, offerId: c.offer_id, authorId: c.author_id, body: c.body, mentions: jsonGet(c, 'mentions', []),
    parentId: c.parent_id, createdAt: c.created_at, resolvedAt: c.resolved_at,
  }));
}

export function offerPerformance(offerId: string) {
  return getDb().prepare(`SELECT * FROM performance_records WHERE offer_id = ? ORDER BY metric`).all(offerId) as any[];
}

export function listCollections(): Collection[] {
  const rows = getDb().prepare(`SELECT * FROM collections`).all() as any[];
  const offers = listOffers({ status: 'all', includeArchived: true });
  return rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, description: r.description, accent: r.accent, kind: r.kind,
    offerIds: offers.filter(o => o.collectionIds.includes(r.id)).map(o => o.id),
  }));
}

export function listCampaigns(): Campaign[] {
  return (getDb().prepare(`SELECT * FROM campaigns ORDER BY start_date DESC`).all() as any[]).map(mapCampaign);
}

export function getCampaign(id: string): Campaign | null {
  const r = getDb().prepare(`SELECT * FROM campaigns WHERE id = ? OR slug = ?`).get(id, id) as any;
  return r ? mapCampaign(r) : null;
}

export function listActivity(limit = 40): ActivityEntry[] {
  return (getDb().prepare(`SELECT * FROM activity ORDER BY created_at DESC LIMIT ?`).all(limit) as any[]).map(a => ({
    id: a.id, actorId: a.actor_id, action: a.action, entityType: a.entity_type, entityId: a.entity_id,
    entityLabel: a.entity_label, detail: a.detail, createdAt: a.created_at, meta: jsonGet(a, 'meta_json', {}),
  }));
}

export function listNotifications(userId: string) {
  return getDb().prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(userId) as any[];
}

export function unreadNotificationCount(userId: string): number {
  const r = getDb().prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL`).get(userId) as any;
  return r?.c ?? 0;
}

export function getSettings(): SettingsBundle {
  const rows = getDb().prepare(`SELECT * FROM settings`).all() as any[];
  const map: Record<string, any> = {};
  rows.forEach(r => { map[r.key] = jsonGet(r, 'value_json', null); });
  return {
    guardrails: { ...DEFAULT_GUARDRAILS, ...(map.guardrails ?? {}) } as GuardrailConfig,
    costs: { ...DEFAULT_COSTS, ...(map.costs ?? {}) } as CostAssumptions,
    attendance: { ...DEFAULT_ATTENDANCE, ...(map.attendance ?? {}) } as AttendanceAssumptions,
    simulation: { ...DEFAULT_SIMULATION, ...(map.simulation ?? {}) } as SimulationAssumptions,
    ai: (map.ai ?? { provider: 'local_strategist', model: 'rules-v1', keyConfigured: false, keyHint: null, updatedAt: nowIso(), updatedBy: 'system' }) as AIProviderConfig,
    integrations: (map.integrations ?? []) as IntegrationConfig[],
  };
}

export function getEvidence() {
  return {
    sales: readDerived<any>('sales_performance.json'),
    funnel: readDerived<any>('lead_funnel.json'),
    customerBase: readDerived<any>('customer_base.json'),
    capacity: readDerived<any>('capacity_utilisation.json'),
  };
}

export function listImports(limit = 20) {
  return (getDb().prepare(`SELECT * FROM imports ORDER BY created_at DESC LIMIT ?`).all(limit) as any[]).map(r => ({
    ...r, report: jsonGet<any[]>(r, 'report_json', []),
  }));
}

export function listGenerations(limit = 25) {
  return (getDb().prepare(`SELECT * FROM ai_generations ORDER BY created_at DESC LIMIT ?`).all(limit) as any[]).map(r => ({
    id: r.id, mode: r.mode, provider: r.provider, providerLabel: r.provider_label,
    engineVersion: r.engine_version, prompt: r.prompt,
    inputs: jsonGet(r, 'inputs_json', {}), outputSummary: r.output_summary, offerIds: jsonGet(r, 'offer_ids_json', []),
    createdAt: r.created_at, createdBy: r.created_by, durationMs: r.duration_ms, fallbackReason: r.fallback_reason,
  }));
}

// ---------------------------------------------------------------- analytics

export function buildAnalytics(): AnalyticsBundle {
  const evidence = getEvidence();
  const catalogue = listCatalogue();
  const offers = listOffers({ status: 'all', includeArchived: true });
  const collections = listCollections();
  const now = Date.parse('2026-10-16');
  const byStatus: Record<string, number> = {};
  const byCollection: Record<string, number> = {};
  const byAudience: Record<string, number> = {};
  let discountSum = 0, discountN = 0, savingsSum = 0, savingsN = 0, opportunity = 0, opportunityN = 0;
  for (const o of offers) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    o.collectionIds.forEach(c => { byCollection[c] = (byCollection[c] ?? 0) + 1; });
    o.audienceSegments.forEach(a => { byAudience[a] = (byAudience[a] ?? 0) + 1; });
    const m = o.metricsSnapshot;
    if (m?.discountPct) { discountSum += m.discountPct; discountN++; }
    if (m?.customerSavingsPct) { savingsSum += m.customerSavingsPct; savingsN++; }
  }
  // Revenue opportunity is only reported where a campaign or offer has an explicit buyer assumption.
  for (const c of listCampaigns()) {
    for (const o of offers.filter(x => x.campaignId === c.id)) {
      const m = o.metricsSnapshot;
      if (m?.sellingPrice) { opportunity += m.sellingPrice; opportunityN++; }
    }
  }
  const byClass: Record<string, number> = {};
  const byLocation: Record<string, number> = {};
  catalogue.forEach(p => {
    byClass[p.productClass] = (byClass[p.productClass] ?? 0) + 1;
    byLocation[p.locationName] = (byLocation[p.locationName] ?? 0) + 1;
  });
  return {
    sales: evidence.sales, funnel: evidence.funnel, customerBase: evidence.customerBase, capacity: evidence.capacity,
    catalogueStats: {
      total: catalogue.length, sellable: catalogue.filter(p => ['standard_retail', 'promotional', 'introductory', 'partner'].includes(p.productClass) && (p.price ?? 0) > 0).length,
      byClass, byLocation,
      // Manual-review queue = records the parser could not resolve. Non-retail records
      // (comp classes, internal ops rows) are archived, not queued for review.
      review: catalogue.filter(p => p.status === 'review').length,
      withWarnings: catalogue.filter(p => p.warnings.length > 0).length,
      historical: catalogue.filter(p => p.status === 'historical').length,
      nonRetail: catalogue.filter(p => p.productClass === 'complimentary' || p.productClass === 'operational').length,
      unlimited: catalogue.filter(p => p.unlimitedAccess).length,
    },
    offerStats: {
      total: offers.length, byStatus, byCollection, byAudience,
      avgDiscountPct: discountN ? Math.round((discountSum / discountN) * 10) / 10 : null,
      avgSavingsPct: savingsN ? Math.round((savingsSum / savingsN) * 10) / 10 : null,
      // Explicitly a unit-revenue proxy, not a forecast: sum of one sale per campaign-linked offer.
      estimatedRevenueOpportunity: opportunityN ? opportunity : null,
      expiringSoon: offers.filter(o => o.expiresOn && Date.parse(o.expiresOn) >= now && Date.parse(o.expiresOn) <= now + 30 * 86400000),
      awaitingApproval: offers.filter(o => o.status === 'in_review' || o.status === 'changes_requested'),
    },
  };
}

// ---------------------------------------------------------------- mutations

export function logActivity(entry: {
  actorId: string; action: string; entityType: ActivityEntry['entityType']; entityId: string;
  entityLabel: string; detail?: string; meta?: Record<string, unknown>;
}) {
  getDb().prepare(`INSERT INTO activity (id,actor_id,action,entity_type,entity_id,entity_label,detail,meta_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    newId('act'), entry.actorId, entry.action, entry.entityType, entry.entityId, entry.entityLabel,
    entry.detail ?? null, JSON.stringify(entry.meta ?? {}), nowIso());
}

export function notify(userId: string, title: string, body: string, href: string) {
  getDb().prepare(`INSERT INTO notifications (id,user_id,title,body,href,created_at,read_at) VALUES (?,?,?,?,?,?,NULL)`)
    .run(newId('ntf'), userId, title, body, href, nowIso());
}

export function markNotificationsRead(userId: string) {
  getDb().prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`).run(nowIso(), userId);
}

export function ensureSettingsRows() {
  const db = getDb();
  const existing = db.prepare(`SELECT key FROM settings`).all() as any[];
  const have = new Set(existing.map(r => r.key));
  const defaults: Record<string, unknown> = {
    guardrails: DEFAULT_GUARDRAILS, costs: DEFAULT_COSTS, attendance: DEFAULT_ATTENDANCE,
    simulation: DEFAULT_SIMULATION,
    ai: { provider: 'local_strategist', model: 'rules-v1', keyConfigured: false, keyHint: null, updatedAt: nowIso(), updatedBy: 'system' },
    integrations: [],
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!have.has(k)) db.prepare(`INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)`).run(k, JSON.stringify(v), nowIso(), 'system');
  }
}

export function saveSettings(key: keyof SettingsBundle, value: unknown, userId: string) {
  getDb().prepare(`INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(key, JSON.stringify(value), nowIso(), userId);
}

export function recomputeAllOfferMetrics(): number {
  const db = getDb();
  const settings = getSettings();
  const catalogue = listCatalogue();
  const offers = listOffers({ status: 'all', includeArchived: true });
  let n = 0;
  for (const offer of offers) {
    const { metrics } = computeOfferMetrics(offer, { catalogue, guardrails: settings.guardrails, costs: settings.costs, attendance: settings.attendance, allOffers: offers });
    db.prepare(`UPDATE offers SET metrics_json = ? WHERE id = ?`).run(JSON.stringify(metrics), offer.id);
    n++;
  }
  return n;
}

export function nextOfferCode(): string {
  const row = getDb().prepare(`SELECT code FROM offers WHERE code LIKE 'P57-BLR-%' ORDER BY code DESC LIMIT 1`).get() as any;
  const n = row ? parseInt(String(row.code).split('-')[2] ?? '100', 10) : 100;
  return `P57-BLR-${n + 1}`;
}
