/**
 * Role vocabulary for the browser.
 *
 * Deliberately free of server-only imports (no `next/headers`, no database) so client components
 * can render role names and permission copy without dragging the server graph into the bundle.
 * The authoritative permission matrix lives in lib/auth.ts, which is server-side only.
 */
import type { Role } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  sales: 'Sales team member',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access — offers, pricing, catalogue, campaigns, AI provider and workspace settings, including guardrail overrides.',
  manager: 'Creates, edits, approves and publishes offers. Can configure guardrails, costs and imports.',
  sales: 'Builds and submits offers, comments and mentions colleagues, and shares approved propositions with members.',
  viewer: 'Read-only. Can follow offers, comment threads and results, but cannot change commercial terms.',
};

/**
 * Plain-language names for each capability, used by the permission grid in workspace settings.
 * Keys are capability strings rather than the `Capability` union so this file stays server-free.
 */
export const CAPABILITY_LABELS: Record<string, string> = {
  'offer:create': 'Create offers',
  'offer:edit': 'Edit drafts',
  'offer:edit_pricing': 'Change prices and discounts',
  'offer:delete': 'Delete drafts',
  'offer:submit': 'Submit for review',
  'offer:approve': 'Approve or request changes',
  'offer:publish': 'Publish approved offers',
  'offer:override_guardrails': 'Override guardrail blockers',
  'offer:archive': 'Archive offers',
  'campaign:manage': 'Plan and edit campaigns',
  'catalogue:edit': 'Edit catalogue pricing',
  'catalogue:import': 'Import price lists',
  'settings:manage': 'Change workspace settings',
  'users:manage': 'Change team roles',
  'settings:ai': 'Configure the AI provider',
  'comment:create': 'Comment and mention',
  'performance:record': 'Record campaign and offer results',
  'offer:comment_only': 'Comment without editing terms',
};

export const CAPABILITY_GROUPS: { group: string; capabilities: string[] }[] = [
  { group: 'Offers', capabilities: ['offer:create', 'offer:edit', 'offer:edit_pricing', 'offer:delete', 'offer:submit'] },
  { group: 'Approval and release', capabilities: ['offer:approve', 'offer:publish', 'offer:override_guardrails', 'offer:archive'] },
  { group: 'Catalogue and campaigns', capabilities: ['catalogue:edit', 'catalogue:import', 'campaign:manage', 'performance:record'] },
  { group: 'Workspace', capabilities: ['settings:manage', 'users:manage', 'settings:ai', 'comment:create'] },
];
