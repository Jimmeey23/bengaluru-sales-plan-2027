'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ Button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';
  const variants = {
    primary: 'bg-clay-500 text-white hover:bg-clay-600 shadow-card active:scale-[0.985]',
    secondary: 'surface border border-line text-ink hover:bg-ink-50 dark:hover:bg-ink-800/40 shadow-card',
    ghost: 'text-ink hover:bg-ink-100/70 dark:hover:bg-ink-800/60',
    subtle: 'bg-ink-100/70 dark:bg-ink-800/60 text-ink hover:bg-ink-200/60 dark:hover:bg-ink-700/60',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant];
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-9.5 px-3.5 text-sm h-[38px]', lg: 'h-11 px-5 text-[15px]', icon: 'h-9 w-9' }[size];
  return (
    <button className={cn(base, variants, sizes, className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface rounded-xl border border-line card-shadow', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className, dense }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string; dense?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line', dense ? 'px-4 py-3' : 'px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-muted">{children}</h2>
      {hint && <span className="text-2xs text-muted">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

const badgeTones: Record<string, string> = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200',
  clay: 'bg-clay-50 text-clay-700 dark:bg-clay-900/40 dark:text-clay-200',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
  gold: 'bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-200',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  danger: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
  outline: 'border border-line text-muted',
};

export function Badge({ children, tone = 'neutral', className, dot }: { children: React.ReactNode; tone?: keyof typeof badgeTones | string; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-2xs font-medium uppercase tracking-wide', badgeTones[tone] ?? badgeTones.neutral, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Inputs */

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('h-[38px] w-full rounded-lg border border-line bg-transparent px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-clay-400 focus:outline-none focus:ring-2 focus:ring-clay-500/15 disabled:opacity-60', className)}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted/70 transition-colors focus:border-clay-400 focus:outline-none focus:ring-2 focus:ring-clay-500/15', className)}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-[38px] w-full appearance-none rounded-lg border border-line bg-transparent bg-[url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'><path d=\'M2 4.5 6 8.5l4-4\' fill=\'none\' stroke=\'%236b645a\' stroke-width=\'1.5\' stroke-linecap=\'round\'/></svg>")] bg-[length:12px] bg-[right_10px_center] bg-no-repeat px-3 pr-8 text-sm text-ink focus:border-clay-400 focus:outline-none focus:ring-2 focus:ring-clay-500/15', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children, error, required }: { label: string; hint?: string; children: React.ReactNode; error?: string | null; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
        {label}
        {required && <span className="text-clay-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-2xs leading-relaxed text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-2xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/40', disabled && 'opacity-50')}
    >
      <span className={cn('mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors', checked ? 'bg-clay-500' : 'bg-ink-200 dark:bg-ink-700')}>
        <span className={cn('h-3 w-3 rounded-full bg-white transition-transform', checked && 'translate-x-3')} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, hint, suffix }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string; suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="num text-2xs text-muted">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-150 bg-ink-200 accent-clay-500 dark:bg-ink-700"
        style={{ accentColor: '#B4533A' }}
      />
      {hint && <p className="mt-1 text-2xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs({ tabs, value, onChange, size = 'md' }: {
  tabs: { key: string; label: string; count?: number; icon?: React.ReactNode }[];
  value: string; onChange: (k: string) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line p-0.5 surface">
      {tabs.map(t => (
        <button
          key={t.key} onClick={() => onChange(t.key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-[12.5px]' : 'px-3 py-1.5 text-[13px]',
            value === t.key ? 'bg-ink-900 text-white shadow-card dark:bg-ink-100 dark:text-ink-900' : 'text-muted hover:text-ink',
          )}
        >
          {t.icon}
          {t.label}
          {t.count != null && <span className={cn('num rounded px-1 text-2xs', value === t.key ? 'bg-white/20' : 'bg-ink-100 dark:bg-ink-800')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Overlays */

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'lg' }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-[2px] animate-fade-in sm:p-8">
      <div className={cn('surface my-4 w-full rounded-2xl border border-line shadow-pop animate-scale-in', widths)} role="dialog" aria-modal>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-lg tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden w-max max-w-xs -translate-x-1/2 rounded-lg border border-line bg-ink-900 px-2.5 py-1.5 text-2xs font-normal leading-relaxed text-white shadow-pop group-hover/tt:block dark:bg-ink-100 dark:text-ink-900">
        {content}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ Feedback */

export function EmptyState({ icon, title, description, action, className, compact }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string; compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {icon && <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-ink-50/70 text-muted dark:bg-ink-800/50">{icon}</div>}
      <p className={cn('font-display text-ink', compact ? 'text-[15px]' : 'text-[17px]')}>{title}</p>
      {description && <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-md bg-ink-100 dark:bg-ink-800', className)} />;
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const tones = {
    info: 'border-teal-200 bg-teal-50/70 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
    danger: 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100',
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100',
  }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed', tones)}>
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 font-medium">{title}</p>}
        <div className="[&_p]:leading-relaxed">{children}</div>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */

interface Toast { id: string; title: string; description?: string; tone?: 'default' | 'success' | 'error' | 'danger' | 'warning' | 'info' }
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={cn('pointer-events-auto animate-rise rounded-xl border px-3.5 py-3 shadow-pop surface',
            t.tone === 'error' ? 'border-red-200 dark:border-red-900' : t.tone === 'success' ? 'border-emerald-200 dark:border-emerald-900' : 'border-line')}>
            <p className="text-[13px] font-medium text-ink">{t.title}</p>
            {t.description && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ Data display */

export function StatTile({ label, value, delta, hint, tone = 'default', icon, onClick }: {
  label: string; value: React.ReactNode; delta?: string; hint?: string; tone?: 'default' | 'clay' | 'teal' | 'gold' | 'warning'; icon?: React.ReactNode; onClick?: () => void;
}) {
  const accent = { default: 'text-ink', clay: 'text-clay-600 dark:text-clay-300', teal: 'text-teal-600 dark:text-teal-300', gold: 'text-gold-600 dark:text-gold-300', warning: 'text-amber-600 dark:text-amber-300' }[tone];
  return (
    <div
      onClick={onClick}
      className={cn('surface rounded-xl border border-line p-4 card-shadow transition-all', onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lift')}
    >
      <div className="flex items-center justify-between">
        <p className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
        {icon && <span className={cn('opacity-70', accent)}>{icon}</span>}
      </div>
      <p className={cn('num mt-2 font-display text-[26px] leading-none tracking-tight', accent)}>{value}</p>
      {delta && <p className="mt-1.5 text-2xs text-muted">{delta}</p>}
      {hint && <p className="mt-1.5 text-2xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function KeyValue({ items, columns = 2, dense }: { items: { label: string; value: React.ReactNode; hint?: string }[]; columns?: 1 | 2 | 3; dense?: boolean }) {
  const cols = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid gap-x-6', cols, dense ? 'gap-y-2.5' : 'gap-y-3.5')}>
      {items.map(i => (
        <div key={i.label} className="min-w-0">
          <dt className="text-2xs uppercase tracking-[0.07em] text-muted">{i.label}</dt>
          <dd className="num mt-1 text-[13.5px] font-medium text-ink">{i.value}</dd>
          {i.hint && <p className="mt-0.5 text-2xs leading-relaxed text-muted">{i.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, max = 100, tone = 'clay', className, showLabel }: { value: number; max?: number; tone?: 'clay' | 'teal' | 'gold' | 'ink' | 'success' | 'warning'; className?: string; showLabel?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tones = { clay: 'bg-clay-500', teal: 'bg-teal-500', gold: 'bg-gold-500', ink: 'bg-ink-700 dark:bg-ink-300', success: 'bg-emerald-500', warning: 'bg-amber-500' }[tone];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div className={cn('h-full rounded-full transition-all duration-500', tones)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="num w-8 text-right text-2xs text-muted">{Math.round(pct)}%</span>}
    </div>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: color ?? '#B4533A', fontSize: size * 0.38 }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full min-w-[720px] border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = 'left' }: { children?: React.ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return <th className={cn('whitespace-nowrap border-b border-line px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.07em] text-muted', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</th>;
}

export function Td({ children, className, align = 'left' }: { children?: React.ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return <td className={cn('border-b border-line/70 px-3 py-2.5 align-middle text-ink', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</td>;
}

export function Tabs_({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-4 h-px w-full bg-line" />;
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
