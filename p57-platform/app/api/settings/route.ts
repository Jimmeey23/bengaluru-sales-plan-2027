import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roles';
import { getDb } from '@/lib/db';
import { ensureSettingsRows, getSettings, getUser, listUsers, logActivity, notify, recomputeAllOfferMetrics, listImports } from '@/lib/data';
import { PROVIDER_CATALOGUE, maskKey, resolveProvider } from '@/lib/ai/provider';
import { DEFAULT_GUARDRAILS, DEFAULT_ATTENDANCE, DEFAULT_SIMULATION } from '@/lib/engine';
import type { CostAssumptions, GuardrailConfig, IntegrationConfig, Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  ensureSettingsRows();
  const settings = getSettings();
  const resolution = resolveProvider(settings.ai);
  return NextResponse.json({
    settings: {
      ...settings,
      // The real key never leaves the server; the browser only ever sees a masked hint.
      ai: { ...settings.ai, keyHint: resolution.key ? maskKey(resolution.key) : null, keyConfigured: resolution.key != null },
    },
    connected: resolution.key != null,
    providerCatalogue: PROVIDER_CATALOGUE,
    defaults: { guardrails: DEFAULT_GUARDRAILS, attendance: DEFAULT_ATTENDANCE, simulation: DEFAULT_SIMULATION },
    users: listUsers(),
    imports: listImports(10),
    canManage: can(user, 'settings:manage'),
    canManageAi: can(user, 'settings:ai'),
    canManageUsers: can(user, 'users:manage'),
    currentUserId: user.id,
  });
}

export async function PATCH(req: NextRequest) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'settings:manage')) return NextResponse.json({ error: 'Your role cannot change workspace settings.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const settings = getSettings();
  ensureSettingsRows();
  const db = getDb();
  const now = new Date().toISOString();

  const write = (key: string, value: unknown, note: string) => {
    db.prepare(`INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .run(key, JSON.stringify(value), now, user.id);
    logActivity({
      actorId: user.id, action: 'updated_settings', entityType: 'settings', entityId: key, entityLabel: key,
      detail: note, meta: { key },
    });
  };

  let recompute = false;

  if (body?.guardrails) {
    const next = { ...settings.guardrails, ...body.guardrails };
    // Provenance is derived, never taken on trust: the moment any ceiling differs from the platform
    // set, these are the organisation's own numbers and every screen says so.
    const guardrailFields: (keyof GuardrailConfig)[] = [
      'maxDiscountPct', 'maxDiscountPctByClass', 'minEffectivePricePerClass', 'minEffectivePricePerClassBasis',
      'maxBonusCreditsPct', 'maxValidityExtensionDays', 'maxPrivateSessionDiscountPct',
      'blockDiscountOnIntroProducts', 'blockStacking', 'maxGuestPasses', 'maxCompClasses',
      'requireApprovalAboveDiscountPct', 'requireApprovalAboveValueAddPct', 'reapprovalOnCommercialChange',
      'maxDiscountOnUnlimitedPct', 'allowDiscountOnUnlimited', 'minValidityDays',
    ];
    const configured = guardrailFields.some(
      k => JSON.stringify(next[k]) !== JSON.stringify((DEFAULT_GUARDRAILS as any)[k]),
    );
    next.source = configured ? 'org_configured' : 'platform_defaults';
    next.updatedAt = now;
    next.updatedBy = user.id;
    if (next.maxDiscountPct < 0 || next.maxDiscountPct > 90) {
      return NextResponse.json({ error: 'A discount ceiling between 0% and 90% is required. The platform does not impose a universal limit — set what each product class can sustain.' }, { status: 400 });
    }
    write('guardrails', next, 'Guardrail ceilings updated. Every saved offer was recalculated against the new configuration.');
    recompute = true;
  }

  if (body?.costs) {
    const next = { ...settings.costs, ...body.costs } as CostAssumptions;
    // The engine gates every margin figure on this flag, so it is derived from the toggle rather
    // than trusted as a free-text field.
    const enabled = body.costs.source ? body.costs.source === 'org_configured' : next.source === 'org_configured';
    next.source = enabled ? 'org_configured' : 'not_configured';
    next.updatedAt = now;
    next.updatedBy = user.id;
    if (enabled && (next.deliveryCostPerStudioClass == null || next.deliveryCostPerStudioClass <= 0)) {
      return NextResponse.json({ error: 'Enter a real class delivery cost before switching margin calculations on, or leave costs switched off. The platform will not estimate a cost for you.' }, { status: 400 });
    }
    write('costs', next, enabled
      ? 'Delivery costs supplied by the business — contribution margin is now shown on every offer, with the basis stated.'
      : 'Cost data switched off (entered figures are kept but unused) — contribution margin stays hidden rather than estimated.');
    recompute = true;
  }

  if (body?.attendance) {
    const next = { ...settings.attendance, ...body.attendance };
    write('attendance', next, 'Attendance assumptions updated — unlimited memberships are repriced per visit on this basis.');
    recompute = true;
  }

  if (body?.simulation) {
    write('simulation', { ...settings.simulation, ...body.simulation }, 'Simulator defaults updated.');
  }

  if (body?.ai) {
    if (!can(user, 'settings:ai')) {
      return NextResponse.json({ error: 'Only an administrator can change the AI provider.' }, { status: 403 });
    }
    const current = settings.ai;
    const provider = body.ai.provider ?? current.provider;
    const incomingKey = typeof body.ai.apiKey === 'string' ? body.ai.apiKey.trim() : null;
    const clearKey = body.ai.clearKey === true;
    const next = {
      ...current,
      provider,
      model: body.ai.model ?? current.model,
      baseUrl: body.ai.baseUrl ?? current.baseUrl ?? null,
      // keyHint holds the real key server-side; it is never returned to the browser.
      keyHint: clearKey ? null : incomingKey && incomingKey.length > 8 ? incomingKey : current.keyHint,
      keyConfigured: clearKey ? false : Boolean(incomingKey && incomingKey.length > 8) || Boolean(current.keyHint),
      updatedAt: now,
      updatedBy: user.id,
    };
    if (provider === 'local_strategist') {
      next.model = 'rules-v1';
      next.keyConfigured = false;
      next.keyHint = null;
    }
    write('ai', next, provider === 'local_strategist'
      ? 'AI provider set to the local strategist engine (no external model).'
      : `${provider} configured. Keys are stored server-side and never returned to the browser.`);
  }

  if (body?.integrations) {
    const list = Array.isArray(body.integrations) ? (body.integrations as IntegrationConfig[]) : null;
    if (!list) return NextResponse.json({ error: 'Integrations must be sent as a list.' }, { status: 400 });
    for (const row of list) {
      // "Marked connected" is a human record, not a probe: it must carry an endpoint and an owner.
      if (row.status === 'connected' && !(typeof row.endpoint === 'string' && row.endpoint.trim())) {
        return NextResponse.json({ error: `${row.label || 'That integration'} cannot be marked connected without an endpoint. Nothing is tested automatically — record the endpoint you verified and who verified it.` }, { status: 400 });
      }
      if (row.status === 'connected' && !row.verifiedAt) {
        return NextResponse.json({ error: `${row.label || 'That integration'} cannot be marked connected until someone records that they verified it.` }, { status: 400 });
      }
      if (row.status === 'connected' && !row.verifiedBy) row.verifiedBy = user.id;
    }
    write('integrations', list, 'Integration records updated. Nothing is pushed anywhere automatically — statuses reflect what the business has actually connected and verified.');
  }

  if (Array.isArray(body?.users)) {
    if (!can(user, 'users:manage')) {
      return NextResponse.json({ error: 'Only an administrator can change team roles.' }, { status: 403 });
    }
    const db2 = getDb();
    let changed = 0;
    for (const row of body.users as { id?: string; role?: Role }[]) {
      if (!row?.id || !row?.role) continue;
      const target = getUser(row.id);
      if (!target) continue;
      if (!(row.role in ROLE_LABELS)) {
        return NextResponse.json({ error: `"${row.role}" is not a role in this workspace.` }, { status: 400 });
      }
      if (target.id === user.id && row.role !== target.role) {
        return NextResponse.json({ error: 'You cannot change your own role. Ask another administrator.' }, { status: 400 });
      }
      if (target.role === row.role) continue;
      db2.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(row.role, target.id);
      changed += 1;
      logActivity({
        actorId: user.id, action: 'changed_role', entityType: 'settings', entityId: target.id, entityLabel: target.name,
        detail: `${target.name} is now a ${ROLE_LABELS[row.role]}. Capabilities apply immediately — approvals waiting on them move with the role.`,
        meta: { from: target.role, to: row.role },
      });
      notify(target.id, 'Your role changed', `${user.name} set your workspace role to ${ROLE_LABELS[row.role]}.`, '/settings');
    }
    if (changed > 0) {
      return NextResponse.json({
        settings: getSettings(),
        users: listUsers(),
        message: `${changed} role change${changed === 1 ? '' : 's'} saved. Permissions apply on the next request.`,
      });
    }
  }

  const recalculated = recompute ? recomputeAllOfferMetrics() : 0;
  const fresh = getSettings();

  return NextResponse.json({
    settings: { ...fresh, ai: { ...fresh.ai, keyHint: fresh.ai.keyConfigured ? '••••••••' : null } },
    recalculated,
    message: recompute
      ? `Settings saved. ${recalculated} saved offer${recalculated === 1 ? '' : 's'} recalculated by the pricing engine.`
      : 'Settings saved.',
  });
}
