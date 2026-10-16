import { NextResponse, type NextRequest } from 'next/server';
import { can, currentUser } from '@/lib/auth';
import { getDb, nowIso } from '@/lib/db';
import { getCampaign, logActivity, notify } from '@/lib/data';

export const dynamic = 'force-dynamic';

const STATUSES = ['planned', 'in_review', 'approved', 'live', 'completed', 'cancelled'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  getDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(user, 'offer:edit')) return NextResponse.json({ error: 'Your role cannot edit campaigns.' }, { status: 403 });
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const now = nowIso();
  const db = getDb();

  if (body?.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Status must be one of: ${STATUSES.join(', ')}.` }, { status: 400 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body?.status) { fields.push('status = ?'); values.push(body.status); }
  if (body?.messaging != null) { fields.push('messaging = ?'); values.push(String(body.messaging)); }
  if (body?.description != null) { fields.push('description = ?'); values.push(String(body.description)); }
  if (body?.startDate) { fields.push('start_date = ?'); values.push(body.startDate); }
  if (body?.endDate) { fields.push('end_date = ?'); values.push(body.endDate); }
  if (body?.memberIds) { fields.push('member_ids = ?'); values.push(JSON.stringify(body.memberIds)); }
  if (body?.actuals) { fields.push('actuals_json = ?'); values.push(JSON.stringify(body.actuals)); }
  if (body?.offerIds) { fields.push('offer_ids = ?'); values.push(JSON.stringify(body.offerIds)); }
  if (!fields.length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  db.prepare(`UPDATE campaigns SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now, campaign.id);

  logActivity({
    actorId: user.id, action: body?.status ? `campaign_${body.status}` : 'updated_campaign',
    entityType: 'campaign', entityId: campaign.id, entityLabel: campaign.name,
    detail: body?.status ? `Status moved to ${body.status}.` : 'Campaign details updated.',
  });
  if (body?.status === 'live' && campaign.ownerId !== user.id) {
    notify(campaign.ownerId, 'Campaign is live', `${campaign.name} was moved live by ${user.name}.`, `/campaigns/${campaign.id}`);
  }

  return NextResponse.json({ campaign: getCampaign(campaign.id) });
}
