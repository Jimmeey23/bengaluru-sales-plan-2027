'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, Badge, Button, Input, Modal, Tooltip, cn, useToast } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/roles';
import type { User } from '@/lib/types';

interface ShellProps {
  user: User;
  /** The team members this workspace can be viewed as. Open workspace mode: no sign-in step. */
  team: { id: string; name: string; role: User['role']; title: string; avatarColor: string }[];
  aiLabel: string;
  aiConnected: boolean;
  notifications: { id: string; title: string; body: string; href: string; createdAt: string; readAt: string | null }[];
  pendingApprovals: number;
  children: React.ReactNode;
}

const NAV: { section: string; items: { href: string; label: string; icon: string; badge?: 'approvals' }[] }[] = [
  {
    section: 'Workspace',
    items: [
      { href: '/command-centre', label: 'Command centre', icon: 'grid' },
      { href: '/generate', label: 'Offer generator', icon: 'spark' },
      { href: '/strategist', label: 'AI strategist', icon: 'compass' },
    ],
  },
  {
    section: 'Manage',
    items: [
      { href: '/offers', label: 'Offer bank', icon: 'book' },
      { href: '/approvals', label: 'Approvals', icon: 'check', badge: 'approvals' },
      { href: '/compare', label: 'Compare & simulate', icon: 'scales' },
      { href: '/campaigns', label: 'Campaign planner', icon: 'calendar' },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { href: '/catalogue', label: 'Memberships & pricing', icon: 'tag' },
      { href: '/analytics', label: 'Analytics & learning', icon: 'chart' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { href: '/activity', label: 'Activity & audit', icon: 'pulse' },
      { href: '/settings', label: 'Settings', icon: 'cog' },
    ],
  },
];

const ICONS: Record<string, React.ReactNode> = {
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.5 6.5l2.5 2.5m6 6 2.5 2.5m0-11-2.5 2.5m-6 6-2.5 2.5" />,
  compass: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm2.5-11.5-1.5 5-5 1.5 1.5-5 5-1.5Z" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5ZM19 18v3H6.5A2.5 2.5 0 0 1 4 18.5" />,
  check: <path d="M9 12.5l2.5 2.5L20 6M4 20h16" />,
  scales: <path d="M12 3v18M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6ZM8 21h8" />,
  calendar: <path d="M4 6h16v15H4zM8 3v4m8-4v4M4 11h16m-9 4h5" />,
  tag: <path d="M20.5 13.5 13 21a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 2.6 12l.4-7L10 4.6a2 2 0 0 1 1.5.6l9 9a2 2 0 0 1 0 2.8ZM7.5 8.5h.01" />,
  chart: <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
  pulse: <path d="M3 12h4l2.5-7 4 14 2.5-7h5" />,
  cog: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.1-1.3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.2-1.3L14.9 3H9.1l-.4 2.4a8 8 0 0 0-2.2 1.3l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 2.6l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.2 1.3l.4 2.4h5.8l.4-2.4a8 8 0 0 0 2.2-1.3l2.4 1 2-3.5-2-1.5c.07-.4.1-.9.1-1.3Z" />,
};

export function Shell({ user, team, aiLabel, aiConnected, notifications, pendingApprovals, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(false);
  const [commandResults, setCommandResults] = useState<{ id: string; name: string; code: string; status: string }[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('p57-theme') : null;
    const prefers = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefers;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleTheme = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      window.localStorage.setItem('p57-theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if (typing) return;
      if (e.key === '?') { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === 'g') { e.preventDefault(); router.push('/generate'); }
      if (e.key === 'b') { e.preventDefault(); router.push('/offers'); }
      if (e.key === 'c') { e.preventDefault(); router.push('/catalogue'); }
      if (e.key === 'Escape') { setPaletteOpen(false); setNotifOpen(false); setUserOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  useEffect(() => {
    if (!paletteOpen || query.trim().length < 2) { setCommandResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/offers?search=${encodeURIComponent(query)}&limit=8`);
        const json = await res.json();
        setCommandResults((json.offers ?? []).map((o: any) => ({ id: o.id, name: o.name, code: o.code, status: o.status })));
      } catch { setCommandResults([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [paletteOpen, query]);

  const unread = notifications.filter(n => !n.readAt).length;
  const activeHref = useMemo(() => {
    const all = NAV.flatMap(s => s.items.map(i => i.href)).sort((a, b) => b.length - a.length);
    return all.find(h => (h === '/command-centre' ? pathname === '/command-centre' : pathname.startsWith(h))) ?? '';
  }, [pathname]);

  async function switchMember(id: string) {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'switch', userId: id }) });
    if (!res.ok) { push({ title: 'Could not switch member', tone: 'danger' }); return; }
    const json = await res.json();
    setUserOpen(false);
    push({ title: `Now viewing as ${json.user?.name ?? 'another member'}`, description: 'Permissions, approvals and notifications follow this role.' });
    router.refresh();
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'mark_all_read' }) });
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ---------------- sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line surface transition-transform duration-200 lg:translate-x-0',
        mobileNav ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 text-[13px] font-semibold text-white dark:bg-ink-100 dark:text-ink-900">57</span>
          <div className="leading-tight">
            <p className="text-[13px] font-medium text-ink">Physique 57 India</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Offer workspace</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {NAV.map(section => (
            <div key={section.section} className="mb-4">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{section.section}</p>
              {section.items.map(item => {
                const active = activeHref === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNav(false)}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                      active ? 'bg-ink-100/90 font-medium text-ink dark:bg-ink-800/70' : 'text-ink-600 hover:bg-ink-100/60 dark:text-ink-300 dark:hover:bg-ink-800/40',
                    )}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      className={cn('shrink-0', active ? 'text-clay-500' : 'text-muted group-hover:text-ink-500')}>
                      {ICONS[item.icon]}
                    </svg>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge === 'approvals' && pendingApprovals > 0 && (
                      <span className="rounded-full bg-clay-500 px-1.5 py-0.5 text-[10px] font-medium text-white">{pendingApprovals}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="rounded-lg border border-line bg-ink-50/60 p-2.5 dark:bg-ink-800/40">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">AI mode</p>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-600 dark:text-ink-300">{aiLabel}</p>
            <Link href="/settings?section=ai" className="mt-1.5 inline-block text-[11px] text-clay-600 hover:underline dark:text-clay-400">
              {aiConnected ? 'Manage provider' : 'Connect a model (optional)'}
            </Link>
          </div>
        </div>
      </aside>

      {mobileNav && <div className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden" onClick={() => setMobileNav(false)} />}

      {/* ---------------- topbar */}
      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </Button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 flex-1 items-center gap-2 rounded-lg border border-line surface px-3 text-left text-[13px] text-muted transition-colors hover:border-ink-300 sm:max-w-md"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" /></svg>
            <span className="flex-1 truncate">Search offers, ask the strategist, jump anywhere…</span>
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip content="Keyboard shortcuts — ⌘K search · G generate · B bank · C catalogue · ? help">
              <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(true)} aria-label="Shortcuts">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 9h6v6H9z" /><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
              </Button>
            </Tooltip>
            <Tooltip content={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                {dark
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
              </Button>
            </Tooltip>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => { setNotifOpen(o => !o); setUserOpen(false); }} aria-label="Notifications">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-clay-500" />}
              </Button>
              {notifOpen && (
                <div className="absolute right-0 top-11 z-40 w-[min(92vw,23rem)] overflow-hidden rounded-xl border border-line surface shadow-pop">
                  <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
                    <p className="text-[13px] font-medium">Notifications</p>
                    {unread > 0
                      ? <button onClick={markAllRead} className="text-[11px] text-clay-600 hover:underline dark:text-clay-400">Mark all read</button>
                      : <span className="text-[11px] text-muted">All read</span>}
                  </div>
                  <div className="max-h-[22rem] overflow-y-auto scrollbar-thin">
                    {notifications.length === 0 && <p className="px-3.5 py-6 text-center text-[12px] text-muted">Nothing yet. Approvals, mentions and assignments land here.</p>}
                    {notifications.map(n => (
                      <Link key={n.id} href={n.href} onClick={() => setNotifOpen(false)}
                        className={cn('block border-b border-line/70 px-3.5 py-2.5 last:border-0 hover:bg-ink-50/70 dark:hover:bg-ink-800/40', !n.readAt && 'bg-clay-50/40 dark:bg-clay-950/20')}>
                        <div className="flex items-start gap-2">
                          {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay-500" />}
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-ink">{n.title}</p>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{n.body}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setUserOpen(o => !o); setNotifOpen(false); }} className="ml-1 flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-ink-100/70 dark:hover:bg-ink-800/60">
                <Avatar name={user.name} color={user.avatarColor} size={26} />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-line surface shadow-pop">
                  <div className="border-b border-line px-4 py-3">
                    <p className="text-[13px] font-medium text-ink">{user.name}</p>
                    <p className="text-[11.5px] text-muted">{user.email}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Badge tone="clay">{ROLE_LABELS[user.role]}</Badge>
                      <Badge tone="outline">{user.title}</Badge>
                    </div>
                  </div>
                  <div className="p-1">
                    <Link href="/settings" onClick={() => setUserOpen(false)} className="block rounded-md px-3 py-2 text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-800/50">Workspace settings</Link>
                    <Link href="/approvals" onClick={() => setUserOpen(false)} className="block rounded-md px-3 py-2 text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-800/50">My approvals</Link>
                    <Link href="/activity" onClick={() => setUserOpen(false)} className="block rounded-md px-3 py-2 text-[12.5px] hover:bg-ink-50 dark:hover:bg-ink-800/50">My activity</Link>
                  </div>
                  <div className="border-t border-line p-1">
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted">
                      Open workspace · view as
                    </p>
                    {team.map(m => (
                      <button key={m.id} onClick={() => switchMember(m.id)}
                        className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/50', m.id === user.id && 'bg-ink-50/70 dark:bg-ink-800/40')}>
                        <Avatar name={m.name} color={m.avatarColor} size={20} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ink">{m.name}</span>
                          <span className="block truncate text-[10.5px] text-muted">{ROLE_LABELS[m.role]} · {m.title}</span>
                        </span>
                        {m.id === user.id && <span className="text-[10px] uppercase tracking-[0.1em] text-clay-600 dark:text-clay-400">current</span>}
                      </button>
                    ))}
                    <p className="px-3 pb-1 pt-1.5 text-[10.5px] leading-relaxed text-muted">
                      No sign-in step: this workspace runs open, and switching only changes whose permissions and approvals you see.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full px-3 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>

      {/* ---------------- command palette */}
      <Modal open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Command palette" subtitle="Search the bank, jump to a workspace, or start something new" width="lg">
        <Input autoFocus placeholder="Type an offer name, tag, or a workspace…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="mt-3 max-h-[22rem] space-y-3 overflow-y-auto scrollbar-thin">
          {commandResults.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted">Offers</p>
              {commandResults.map(r => (
                <button key={r.id} onClick={() => { setPaletteOpen(false); router.push(`/offers/${r.id}`); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/50">
                  <span className="flex-1 truncate text-[13px] text-ink">{r.name}</span>
                  <span className="font-mono text-[11px] text-muted">{r.code}</span>
                  <Badge tone="outline">{r.status.replace(/_/g, ' ')}</Badge>
                </button>
              ))}
            </div>
          )}
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted">Go to</p>
            {NAV.flatMap(s => s.items).map(item => (
              <button key={item.href} onClick={() => { setPaletteOpen(false); router.push(item.href); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/50">
                <span className="text-[13px] text-ink">{item.label}</span>
                <span className="ml-auto text-[11px] text-muted">{item.href}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted">Start</p>
            {[
              { label: 'Guided offer builder', href: '/generate?mode=guided' },
              { label: 'Surprise me — random generator', href: '/generate?mode=random' },
              { label: 'Ask the AI strategist in plain English', href: '/generate?mode=nlq' },
              { label: 'Create from an existing package', href: '/generate?mode=existing' },
            ].map(s => (
              <button key={s.href} onClick={() => { setPaletteOpen(false); router.push(s.href); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800/50">
                <span className="text-[13px] text-ink">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-line bg-ink-50/60 p-3 text-[11.5px] leading-relaxed text-muted dark:bg-ink-800/40">
            <p className="font-medium text-ink">Keyboard</p>
            <p className="mt-1">⌘K / Ctrl-K palette · G generator · B offer bank · C catalogue · Esc close · ? this panel</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function TopBanner({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 rounded-xl border border-line bg-ink-50/70 px-4 py-2.5 text-[12.5px] text-ink-600 dark:bg-ink-800/40 dark:text-ink-300">{children}</div>;
}
