'use client';

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from 'recharts';

const AXIS = { fontSize: 10, fill: '#8E8779' } as const;
const inr = (v: number) => (v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);
const TOOLTIP = {
  contentStyle: {
    background: 'rgba(255,255,255,0.97)', border: '1px solid #E7E3DC', borderRadius: 10,
    fontSize: 12, boxShadow: '0 8px 24px -12px rgba(18,16,14,0.3)', padding: '8px 10px', color: '#12100E',
  },
  labelStyle: { fontSize: 10, color: '#8E8779', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 },
};

export function RevenueTrend({ data, height = 220 }: { data: { month: string; revenue: number; lines: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F6F6B" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#1F6F6B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E7E3DC" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / 8))} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inr} />
        <Tooltip {...TOOLTIP} formatter={(v: number, n) => [n === 'revenue' ? `₹${Math.round(v).toLocaleString('en-IN')}` : v, n === 'revenue' ? 'Revenue' : 'Sales lines']} />
        <Area type="monotone" dataKey="revenue" stroke="#1F6F6B" strokeWidth={1.8} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProductBar({ data, height = 300, colour = '#B4533A', label = 'Revenue' }: { data: { name: string; value: number }[]; height?: number; colour?: string; label?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#E7E3DC" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inr} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={150} />
        <Tooltip {...TOOLTIP} formatter={(v: number) => [`₹${Math.round(v).toLocaleString('en-IN')}`, label]} />
        <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelBars({ data }: { data: { label: string; value: number; colour?: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between text-[12px]">
            <span className="text-muted">{d.label}</span>
            <span className="num text-ink">{d.value.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.value / max) * 100}%`, background: d.colour ?? ['#BDB6AA', '#1F6F6B', '#B4533A'][i % 3] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscountCodeChart({ data, height = 240 }: { data: { code: string; revenue: number; discountGiven: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 12 }}>
        <CartesianGrid stroke="#E7E3DC" vertical={false} />
        <XAxis dataKey="code" tick={{ ...AXIS, fontSize: 9 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0} height={50} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inr} />
        <Tooltip {...TOOLTIP} formatter={(v: number, n) => [`₹${Math.round(v).toLocaleString('en-IN')}`, n === 'revenue' ? 'Revenue with code' : 'Discount given']} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8E8779' }} formatter={(v) => (v === 'revenue' ? 'Revenue' : 'Discount given')} />
        <Bar dataKey="revenue" stackId="a" fill="#1F6F6B" radius={[0, 0, 0, 0]} barSize={16} />
        <Bar dataKey="discountGiven" stackId="a" fill="#B4533A" radius={[3, 3, 0, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScenarioChart({ data, height = 240 }: { data: { scenario: string; revenue: number; incremental: number; contribution: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#E7E3DC" vertical={false} />
        <XAxis dataKey="scenario" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inr} />
        <Tooltip {...TOOLTIP} formatter={(v: number, n) => [`₹${Math.round(v).toLocaleString('en-IN')}`, String(n)]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="revenue" name="Gross revenue" fill="#BDB6AA" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="incremental" name="After displacement" fill="#1F6F6B" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="contribution" name="After delivery cost" fill="#B4533A" radius={[3, 3, 0, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreRadial({ score, size = 76, label }: { score: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, score / 10));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const colour = pct >= 0.75 ? '#1F6F6B' : pct >= 0.55 ? '#B08430' : '#B4533A';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
          className="text-ink-200 dark:text-ink-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num font-display text-[19px] leading-none text-ink">{score.toFixed(1)}</span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-muted">{label}</span>}
      </div>
    </div>
  );
}

export function ScoreBars({ dimensions }: { dimensions: { key: string; label: string; score: number; reasoning: string }[] }) {
  return (
    <div className="space-y-2.5">
      {dimensions.map(d => (
        <div key={d.key} title={d.reasoning}>
          <div className="flex items-baseline justify-between text-[11.5px]">
            <span className="text-muted">{d.label}</span>
            <span className="num text-ink">{d.score.toFixed(1)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(d.score / 10) * 100}%`, background: d.score >= 7.5 ? '#1F6F6B' : d.score >= 5.5 ? '#B08430' : '#B4533A' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UtilisationHeatmap({ rows }: { rows: { studio: string; day: string; timeBand: string; utilisationPct: number; capacity: number; checkedIn: number; sessions: number }[] }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const bands = Array.from(new Set(rows.map(r => r.timeBand)));
  const studio = rows[0]?.studio ?? '';
  const cell = (day: string, band: string) => rows.find(r => r.day === day && r.timeBand === band);
  const tone = (u: number | undefined) => {
    if (u == null) return 'bg-ink-100 dark:bg-ink-800 text-muted';
    if (u < 25) return 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300';
    if (u < 35) return 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200';
    if (u < 45) return 'bg-gold-100 dark:bg-gold-800/40 text-gold-700 dark:text-gold-200';
    return 'bg-clay-100 dark:bg-clay-900/40 text-clay-700 dark:text-clay-300';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-2xs font-medium uppercase tracking-[0.08em] text-muted">Band</th>
            {days.map(d => <th key={d} className="text-center text-2xs font-medium uppercase tracking-[0.08em] text-muted">{d.slice(0, 3)}</th>)}
          </tr>
        </thead>
        <tbody>
          {bands.map(band => (
            <tr key={band}>
              <td className="whitespace-nowrap pr-2 text-[11.5px] text-muted">{band}</td>
              {days.map(day => {
                const row = cell(day, band);
                return (
                  <td key={day}>
                    <div className={`flex h-10 flex-col items-center justify-center rounded-md text-[10.5px] ${tone(row?.utilisationPct)}`}
                      title={row ? `${row.studio} · ${day} ${band}: ${row.utilisationPct}% of ${row.capacity} places across ${row.sessions} sessions (observed)` : 'No sessions recorded'}>
                      <span className="num font-medium">{row ? `${Math.round(row.utilisationPct)}%` : '—'}</span>
                      {row && <span className="opacity-70">{row.sessions} sess</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-2xs text-muted">{studio} — observed capacity utilisation from the attendance export. Use it to target off-peak windows; it is historical, not a live fill rate.</p>
    </div>
  );
}

export function TinySpark({ data, colour = '#1F6F6B' }: { data: { month: string; revenue: number }[]; colour?: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line type="monotone" dataKey="revenue" stroke={colour} strokeWidth={1.6} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryMix({ data, height = 260 }: { data: { name: string; value: number; units?: number }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colours = ['#1F6F6B', '#B4533A', '#B08430', '#4F4A43', '#7CBCB8', '#E0A090', '#DCB865', '#8E8779', '#BDB6AA'];
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 24 }}>
          <CartesianGrid stroke="#E7E3DC" vertical={false} />
          <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 9 }} tickLine={false} axisLine={false} angle={-24} textAnchor="end" interval={0} height={56} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inr} />
          <Tooltip {...TOOLTIP} formatter={(v: number, _n, p: any) => [`₹${Math.round(v).toLocaleString('en-IN')} · ${p?.payload?.units ?? 0} units (${((v / total) * 100).toFixed(1)}% of revenue)`, 'Observed']} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={22}>
            {data.map((_, i) => <Cell key={i} fill={colours[i % colours.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
