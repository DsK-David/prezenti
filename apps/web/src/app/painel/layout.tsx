'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, logout, useSession } from '@/lib/auth';
import { Avatar, Rings, Wordmark } from '@/components/ui';

const ROLE = { admin: 'Gestor', teacher: 'Professor', super_admin: 'Plataforma', guardian: 'Encarregado' } as const;

const ICONS = {
  today: <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 3h16M9 14.5l2 2 4-4" />,
  history: <path d="M12 7v5l3 2M4 12a8 8 0 1 0 2.4-5.7M4 5v4h4" />,
  cards: <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm5.5 3.5a1.8 1.8 0 1 0 0 .01M6 16c.6-1.4 1.6-2 2.5-2s1.9.6 2.5 2M14 11h4M14 14h3" />,
  classes: <path d="M3 9l9-4 9 4-9 4-9-4Zm4 2.5V15c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-3.5M21 9v5" />,
  family: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5M2.5 19c.5-3 2.7-5 5.5-5s5 2 5.5 5M15 14.5c2.6.1 4.5 1.9 5 4.5" />,
  device: <path d="M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3Zm5 15.5h.01M9.5 6.5h5" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5.1-1-.1-1 1.8-1.4-1.8-3.1-2.1.8a7 7 0 0 0-1.7-1l-.3-2.2h-3.6l-.3 2.2a7 7 0 0 0-1.7 1l-2.1-.8-1.8 3.1L6.6 10.5l-.1 1 .1 1-1.8 1.4 1.8 3.1 2.1-.8c.5.4 1.1.7 1.7 1l.3 2.2h3.6l.3-2.2c.6-.3 1.2-.6 1.7-1l2.1.8 1.8-3.1-1.8-1.4Z" />,
};
type IconKey = keyof typeof ICONS;

function Icon({ d }: { d: IconKey }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[d]}
    </svg>
  );
}

interface Item { href: string; label: string; icon: IconKey }
const GROUPS = (admin: boolean): Array<{ title: string; items: Item[] }> => [
  { title: 'Dia a dia', items: [{ href: '/painel', label: admin ? 'Hoje' : 'Minhas turmas', icon: admin ? 'today' : 'classes' }, { href: '/painel/historico', label: 'Histórico', icon: 'history' }] },
  ...(admin ? [
    { title: 'Gestão', items: [
      { href: '/painel/alunos', label: 'Alunos e cartões', icon: 'cards' as const },
      { href: '/painel/turmas', label: 'Turmas e professores', icon: 'classes' as const },
      { href: '/painel/encarregados', label: 'Encarregados', icon: 'family' as const },
    ] },
    { title: 'Sistema', items: [
      { href: '/painel/dispositivos', label: 'Dispositivos', icon: 'device' as const },
      { href: '/painel/definicoes', label: 'Definições', icon: 'settings' as const },
    ] },
  ] : [{ title: 'Conta', items: [{ href: '/painel/definicoes', label: 'Definições', icon: 'settings' as const }] }]),
];

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useSession();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!session) window.location.replace('/login');
    else if (session.user.role === 'guardian' || session.user.role === 'super_admin') window.location.replace(homeFor(session.user.role));
  }, [ready, session]);

  if (!session || session.user.role === 'guardian' || session.user.role === 'super_admin') return null;
  const { user } = session;
  const groups = GROUPS(user.role === 'admin');
  const all = groups.flatMap((g) => g.items);

  const link = (t: Item, compact = false) => {
    const on = path === t.href;
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={on ? 'page' : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${on ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink'} ${compact ? 'whitespace-nowrap' : ''}`}
      >
        <Icon d={t.icon} />{t.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sidebar-w)_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col justify-between overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
        <div className="flex flex-col gap-6">
          <div className="px-2 pt-1"><Wordmark /></div>
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g.title}</p>
              <nav aria-label={g.title} className="flex flex-col gap-0.5">{g.items.map((t) => link(t))}</nav>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <p className="mb-3 px-3 font-display text-[15px] leading-snug text-ink">Saiba que <span className="text-brand">chegaram bem.</span></p>
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <Avatar name={user.name} size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted">{ROLE[user.role]}</p>
          </div>
          <button onClick={logout} className="btn btn-quiet px-2 py-1 text-xs">Sair</button>
        </div>
        </div>
      </aside>

      <div className="relative min-w-0 overflow-x-clip">
        {/* Ondas da marca, quase invisíveis, atrás de todo o conteúdo. */}
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 hidden text-brand/[0.09] lg:block"><Rings size={640} count={4} /></div>
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Wordmark />
            <button onClick={logout} className="btn btn-ghost px-3 py-1.5 text-sm">Sair</button>
          </div>
          <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">{all.map((t) => link(t, true))}</nav>
        </header>
        <main className="relative mx-auto w-full max-w-[var(--content-max)] px-4 py-8 sm:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
