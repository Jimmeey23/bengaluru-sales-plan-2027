/**
 * Seed version. Bump it whenever the seeded workspace changes shape or content: `getDb()` compares
 * this against the value stored in the database and re-seeds when they differ, so the workspace is
 * never left half-old. Kept in its own module so `seed.ts` can record it without a circular import.
 */
export const SEED_VERSION = '2026-10-16.6';

/**
 * Operational note: a change to the pricing engine that alters the figures stored in
 * `offers.metrics_json` ships together with a bump here, because the seeded workspace recalculates
 * as a whole. Once this workspace is pointed at live studio data, recalculation instead runs from
 * Settings (saving guardrails recalculates every saved offer) — re-seeding then must never be used
 * as a recalculation mechanism, since it discards records the studio created.
 */
