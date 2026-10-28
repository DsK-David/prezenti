'use client';

import { useMemo } from 'react';
import { IconChip, Rings } from './ui';
import { ChartCard, ColumnChart, dayLong, dayShort, Legend, SERIES, Sparkline, StackBars, TrendChart, useCountUp, type Column, type StackRow, type TrendPoint } from './charts';
import type { TodayRow } from '@/lib/status';

export interface Stats {
  today: string; late_after: string; min_exit_time: string; enrolled: number;
  days: { date: string; present: number; late: number; lunch: number; incidents: number }[];
  arrivals: { minutes: number; late: boolean }[];
}

const HERO = { onTime: '#ffffff', late: '#ffc85a', left: 'rgba(255,255,255,0.45)' } as const;

const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function Delta({ diff, unit, goodWhen }: { diff: number | null; unit: string; goodWhen: 'up' | 'down' }) {
  if (diff === null) return <span className="text-xs text-muted">sem dia anterior</span>;
  if (diff === 0) return <span className="text-xs text-muted">igual ao dia anterior</span>;
  const good = goodWhen === 'up' ? diff > 0 : diff < 0;
  return (
    <span className="text-xs font-medium tabular-nums" style={{ color: good ? 'var(--ok)' : 'var(--bad)' }}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}{unit} <span className="font-normal text-muted">vs. dia anterior</span>
    </span>
  );
}

function Tile({ label, icon, value, unit, delta, spark, hint, delay }: {
  label: string; icon: React.ReactNode; value: number; unit?: string; delta?: React.ReactNode; spark: number[]; hint?: string; delay: number;
}) {
  const v = useCountUp(value, 600);
  return (
    <div className="card anim-rise flex flex-col justify-between gap-3 p-4" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-2.5 text-sm text-muted"><IconChip>{icon}</IconChip>{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="font-display text-4xl leading-none">{v}{unit && <span className="ml-0.5 text-xl text-muted">{unit}</span>}</p>
        <Sparkline values={spark} />
      </div>
      <div className="min-h-4">{delta ?? (hint && <span className="text-xs text-muted">{hint}</span>)}</div>
    </div>
  );
}

export function Overview({ rows, stats }: { rows: TodayRow[] | null; stats: Stats | null }) {
  const d = useMemo(() => {
    if (!rows || !stats) return null;
    const total = rows.length;
    const count = (f: (r: TodayRow) => boolean) => rows.filter(f).length;
    const attended = count((r) => r.status !== 'absent');
    const lateRows = count((r) => r.late && r.status !== 'absent');
    const left = count((r) => r.status === 'left');
    const here = attended - left;
    const absent = total - attended;
    const days = stats.days.filter((x) => x.present > 0);
    const todayRec = stats.days.find((x) => x.date === stats.today) ?? { date: stats.today, present: 0, late: 0, lunch: 0, incidents: 0 };
    const prev = [...days].reverse().find((x) => x.date < stats.today) ?? null;
    const rate = (x: { present: number }) => pct(x.present, stats.enrolled);

    // Chegadas de hoje por quarto de hora, de 07:30 (ou antes, se houver) até 09:00 (ou depois).
    const lateAt = toMin(stats.late_after);
    const mins = stats.arrivals.map((a) => a.minutes);
    const start = Math.min(450, mins.length ? Math.floor(Math.min(...mins) / 15) * 15 : 450);
    const end = Math.max(555, mins.length ? Math.floor(Math.max(...mins) / 15) * 15 + 15 : 555);
    const buckets: Column[] = [];
    for (let s = start; s < end; s += 15) {
      const inB = stats.arrivals.filter((a) => a.minutes >= s && a.minutes < s + 15);
      const n = inB.length, lateN = inB.filter((a) => a.late).length;
      buckets.push({
        key: String(s), label: hm(s), value: n, color: SERIES.present,
        parts: [{ value: n - lateN, color: SERIES.present }, { value: lateN, color: SERIES.late }],
        tip: [`${n} ${n === 1 ? 'chegada' : 'chegadas'}`, `${hm(s)} a ${hm(s + 15)}`, `${n - lateN} a tempo · ${lateN} em atraso`],
      });
    }

    const trend: TrendPoint[] = days.map((x) => ({ key: x.date, label: dayShort(x.date), value: rate(x), tip: [`${rate(x)}%`, dayLong(x.date), `${x.present} de ${stats.enrolled} alunos`] }));
    const lates: Column[] = days.map((x) => ({ key: x.date, label: dayShort(x.date), value: x.late, color: SERIES.late, tip: [`${x.late} ${x.late === 1 ? 'atraso' : 'atrasos'}`, dayLong(x.date), `de ${x.present} presentes`] }));

    const byClass = new Map<string, StackRow>();
    rows.forEach((r) => {
      const k = r.class_name ?? 'Sem turma';
      const c = byClass.get(k) ?? { key: k, label: k, total: 0, present: 0, late: 0 };
      c.total++;
      if (r.status !== 'absent') { if (r.late) c.late++; else c.present++; }
      byClass.set(k, c);
    });
    const classes = [...byClass.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt'));

    const last7 = days.slice(-7);
    return { total, attended, lateRows, left, here, absent, todayRec, prev, rate, lateAt, buckets, trend, lates, classes, last7, arrivalsToday: stats.arrivals.length };
  }, [rows, stats]);

  const here = useCountUp(d?.here ?? 0, 700);

  if (!d || !stats) {
    return (
      <div className="grid gap-4 lg:grid-cols-4" aria-busy="true">
        <div className="card skeleton h-56 lg:col-span-2 lg:row-span-2" />
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card skeleton h-[104px]" />)}
        <div className="card skeleton h-72 lg:col-span-2" /><div className="card skeleton h-72 lg:col-span-2" />
      </div>
    );
  }

  const presRate = d.rate(d.todayRec);
  const prevRate = d.prev ? d.rate(d.prev) : null;
  const lateHere = rowsLateHere(rows!);
  const onTime = d.here - lateHere;
  const seg = (n: number) => `${d.total ? (n / d.total) * 100 : 0}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Figura principal: quantos alunos estão na escola agora. Veste a marca: azul, ondas e ciano. */}
        <section className="anim-rise relative flex flex-col justify-between gap-7 overflow-hidden rounded-[var(--radius-lg)] bg-linear-to-br from-[#2a52e0] via-[#3461ee] to-[#4a78f5] p-6 text-white lg:col-span-2 lg:row-span-2" style={{ border: 'none', boxShadow: '0 28px 56px -28px rgb(42 82 224 / 0.6)' }} aria-label="Na escola agora">
          <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 text-white/[0.16]"><Rings size={460} count={4} /></div>
          <div className="relative">
            <p className="text-sm font-medium text-white/80">Na escola agora</p>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="font-display text-[clamp(4.5rem,9vw,7rem)] leading-none">{here}</span>
              <span className="text-lg text-white/80">de {d.total} alunos</span>
            </p>
            <p className="mt-3 font-display text-xl text-accent">{d.attended === 0 ? 'Ainda ninguém chegou hoje.' : `${d.attended} ${d.attended === 1 ? 'chegou' : 'chegaram'} bem hoje.`}</p>
          </div>
          <div className="relative">
            <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-white/[0.18]" role="img" aria-label={`${onTime} a tempo, ${lateHere} em atraso, ${d.left} já saíram, ${d.absent} ausentes`}>
              {[{ n: onTime, c: HERO.onTime }, { n: lateHere, c: HERO.late }, { n: d.left, c: HERO.left }].map((s2, i) => (
                <div key={i} className="viz-hbar h-full" style={{ width: seg(s2.n), background: s2.c, marginRight: s2.n ? 2 : 0, animationDelay: `${i * 90}ms`, borderRadius: '0 4px 4px 0', transition: 'width 500ms var(--ease)' }} />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {[
                { l: 'A tempo', n: onTime, c: HERO.onTime },
                { l: 'Atrasados', n: lateHere, c: HERO.late },
                { l: 'Já saíram', n: d.left, c: HERO.left },
                { l: 'Ausentes', n: d.absent, c: 'rgba(255,255,255,0.18)' },
              ].map((s2) => (
                <li key={s2.l}>
                  <p className="flex items-center gap-1.5 text-xs text-white/75"><span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-white/30" style={{ background: s2.c }} aria-hidden />{s2.l}</p>
                  <p className="font-display text-2xl tabular-nums leading-tight">{s2.n}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Tile delay={60} label="Presença hoje" icon={<path d="M5 12.5l4.5 4.5L19 7.5" />} value={presRate} unit="%" spark={d.last7.map((x) => d.rate(x))}
          delta={<Delta diff={prevRate === null ? null : presRate - prevRate} unit=" pp" goodWhen="up" />} />
        <Tile delay={110} label="Atrasos hoje" icon={<path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />} value={d.todayRec.late} spark={d.last7.map((x) => x.late)}
          delta={<Delta diff={d.prev ? d.todayRec.late - d.prev.late : null} unit="" goodWhen="down" />} />
        <Tile delay={160} label="Almoços hoje" icon={<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3" />} value={d.todayRec.lunch} spark={d.last7.map((x) => x.lunch)}
          hint={d.todayRec.present ? `${pct(d.todayRec.lunch, d.todayRec.present)}% dos presentes` : 'ainda sem presentes'} />
        <Tile delay={210} label="Ocorrências hoje" icon={<path d="M12 4l9 16H3L12 4Zm0 6v4.5m0 3h.01" />} value={d.todayRec.incidents} spark={d.last7.map((x) => x.incidents)}
          hint={d.todayRec.incidents ? 'veja o detalhe no histórico' : 'nenhuma até agora'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Presença diária" icon={<path d="M3 17l5-5 4 3 8-9" />} subtitle={`Últimos ${stats.days.length} dias, só dias letivos`}
          table={{ head: ['Dia', 'Presentes', 'Presença', 'Atrasos'], rows: d.trend.length ? stats.days.filter((x) => x.present > 0).map((x) => [dayLong(x.date), x.present, `${d.rate(x)}%`, x.late]) : [] }}>
          {d.trend.length > 1
            ? <TrendChart points={d.trend} ariaLabel={`Presença diária, últimos ${stats.days.length} dias`} />
            : <p className="flex h-[230px] items-center justify-center text-sm text-muted">A tendência aparece a partir do segundo dia letivo com registos.</p>}
        </ChartCard>

        <ChartCard title="Chegadas de hoje" icon={<path d="M12 12h.01M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />} subtitle={`${d.arrivalsToday} ${d.arrivalsToday === 1 ? 'chegada' : 'chegadas'}, por quarto de hora`}
          legend={<Legend items={[{ label: 'A tempo', color: SERIES.present }, { label: `Atraso (depois das ${stats.late_after})`, color: SERIES.late }]} />}
          table={{ head: ['Intervalo', 'Chegadas'], rows: d.buckets.filter((b) => b.value > 0).map((b) => [`${hm(Number(b.key))} a ${hm(Number(b.key) + 15)}`, b.value]) }}>
          <ColumnChart items={d.buckets} ariaLabel="Chegadas de hoje por quarto de hora" emptyText="Ainda sem chegadas hoje"
            marker={{ at: (d.lateAt - Number(d.buckets[0].key)) / 15, label: `Atraso ${stats.late_after}` }} />
        </ChartCard>

        <ChartCard title="Presença por turma" icon={<path d="M4 6h12M4 12h16M4 18h9" />} subtitle="Hoje, em relação ao total de cada turma"
          legend={<Legend items={[{ label: 'A tempo', color: SERIES.present }, { label: 'Atraso', color: SERIES.late }, { label: 'Ausentes', color: 'var(--surface-2)' }]} />}
          table={{ head: ['Turma', 'A tempo', 'Atraso', 'Ausentes', 'Total'], rows: d.classes.map((c) => [c.label, c.present, c.late, c.total - c.present - c.late, c.total]) }}>
          {d.classes.length ? <StackBars rows={d.classes} /> : <p className="text-sm text-muted">Sem turmas com alunos.</p>}
        </ChartCard>

        <ChartCard title="Atrasos por dia" icon={<path d="M6 20v-8M12 20V5M18 20v-6" />} subtitle={`Últimos ${stats.days.length} dias, só dias letivos`}
          table={{ head: ['Dia', 'Atrasos', 'Presentes'], rows: stats.days.filter((x) => x.present > 0).map((x) => [dayLong(x.date), x.late, x.present]) }}>
          <ColumnChart items={d.lates} ariaLabel="Atrasos por dia" emptyText="Sem dias letivos neste período" />
        </ChartCard>
      </div>
    </div>
  );
}

function rowsLateHere(rows: TodayRow[]) {
  return rows.filter((r) => r.late && r.status !== 'absent' && r.status !== 'left').length;
}

