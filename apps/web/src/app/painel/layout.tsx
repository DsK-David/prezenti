'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const COLLAPSED_KEY = 'prezenti.menu-recolhido';
import { homeFor, logout, useSession } from '@/lib/auth';
import { Avatar, RingMark } from '@/components/ui';

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function Glyph({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
  );
}
const SIDEBAR = 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm5-2v16';
const MENU = 'M4 7h16M4 12h16M4 17h16';
const CLOSE = 'M6 6l12 12M18 6 6 18';
const LOGOUT = 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4';

const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { session, ready, call } = useSession();
  const path = usePathname();
  const [school, setSchool] = useState<string | null>(null);
  // Recolhido só no computador; a escolha fica neste navegador.
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!session) window.location.replace('/');
    else if (session.user.role === 'guardian' || session.user.role === 'super_admin') window.location.replace(homeFor(session.user.role));
  }, [ready, session]);

  useEffect(() => {
    if (!ready || !session) return;
    void call<{ school_name: string | null }>('/me').then((m) => setSchool(m.school_name)).catch(() => {});
  }, [ready, session, call]);

  // A gaveta fecha com Esc.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  if (!session || session.user.role === 'guardian' || session.user.role === 'super_admin') return null;
  const { user } = session;
  const groups = GROUPS(user.role === 'admin');
  const main = groups.slice(0, -1);
  const footer = groups[groups.length - 1];
  const schoolName = school ?? 'Prezenti';

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
  };

  // `mini`: só ícones, com o nome numa etiqueta ao passar o rato ou focar.
  const link = (t: Item, mini: boolean) => {
    const on = path === t.href;
    return (
      <Link
        key={t.href}
        href={t.href}
        onClick={() => setDrawer(false)}
        aria-current={on ? 'page' : undefined}
        aria-label={mini ? t.label : undefined}
        className={`group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium transition-colors ${mini ? 'justify-center' : 'px-3'} ${on
          ? 'bg-nav-active font-semibold text-white [&_svg]:text-accent'
          : 'text-nav-ink hover:bg-white/[0.06] hover:text-white'}`}
      >
        <Icon d={t.icon} />
        {mini
          ? <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-footnote font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{t.label}</span>
          : <span className="truncate">{t.label}</span>}
      </Link>
    );
  };

  const group = (g: { title: string; items: Item[] }, mini: boolean) => (
    <div key={g.title}>
      {mini
        ? <div className="mx-3 mb-2 h-px bg-white/10" aria-hidden />
        : <p className="mb-1.5 px-3 text-caption font-medium text-nav-ink/60">{g.title}</p>}
      <nav aria-label={g.title} className="flex flex-col gap-0.5">{g.items.map((t) => link(t, mini))}</nav>
    </div>
  );

  // O mesmo menu serve o computador (fixo, recolhível) e o telemóvel (gaveta, sempre completo).
  const menu = (mini: boolean, onClose?: () => void) => (
    <div className={`flex h-full flex-col bg-nav px-3 pb-3 pt-3 text-nav-ink ${mini ? '' : 'overflow-hidden'}`}>
      <div className={`flex items-center gap-2 ${mini ? 'flex-col' : ''}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl ${mini ? 'justify-center p-1' : 'border border-white/[0.08] bg-white/[0.05] p-2'}`} title={schoolName}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent font-display text-[12px] font-bold text-nav" aria-hidden>{school ? initials(school) : <RingMark size={18} />}</span>
          {!mini && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold text-white">{schoolName}</p>
              <p className="flex items-center gap-1 text-caption text-nav-ink/80"><span className="text-accent"><RingMark size={11} /></span>Prezenti</p>
            </div>
          )}
        </div>
        {onClose ? (
          <button onClick={onClose} aria-label="Fechar menu" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nav-ink hover:bg-white/[0.08] hover:text-white"><Glyph d={CLOSE} /></button>
        ) : (
          <button onClick={toggle} aria-label={mini ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!mini} title={mini ? 'Expandir menu' : 'Recolher menu'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nav-ink hover:bg-white/[0.08] hover:text-white"><Glyph d={SIDEBAR} /></button>
        )}
      </div>

      <div className={`mt-5 flex flex-1 flex-col gap-5 ${mini ? '' : 'overflow-y-auto [scrollbar-width:none]'}`}>
        {main.map((g) => group(g, mini))}
        <div className="mt-auto">{group(footer, mini)}</div>
      </div>

      <div className={`mt-3 flex items-center gap-2.5 border-t border-white/10 pt-3 ${mini ? 'flex-col' : 'px-1'}`}>
        <span title={mini ? `${user.name}, ${ROLE[user.role]}` : undefined} className="rounded-full ring-2 ring-white/10"><Avatar name={user.name} size={30} /></span>
        {!mini && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="text-caption text-nav-ink">{ROLE[user.role]}</p>
          </div>
        )}
        <button onClick={logout} aria-label="Sair" title="Sair" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nav-ink hover:bg-white/[0.08] hover:text-white"><Glyph d={LOGOUT} size={17} /></button>
      </div>
    </div>
  );

  const current = groups.flatMap((g) => g.items).find((t) => t.href === path);

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className="sticky top-0 z-30 hidden h-screen shrink-0 transition-[width] duration-200 ease-[var(--ease)] lg:block"
        style={{ width: collapsed ? 'var(--sidebar-w-mini)' : 'var(--sidebar-w)' }}
      >
        {menu(collapsed)}
      </aside>

      {/* Telemóvel: barra de cima com o botão do menu; o menu abre como gaveta por cima do conteúdo. */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-bg/90 px-2 backdrop-blur lg:hidden">
        <button onClick={() => setDrawer(true)} aria-label="Abrir menu" aria-expanded={drawer} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-2"><Glyph d={MENU} size={20} /></button>
        <span className="text-brand"><RingMark size={22} /></span>
        <span className="truncate text-[15px] font-semibold">{current?.label ?? 'Prezenti'}</span>
      </header>
      <div className={`fixed inset-0 z-40 lg:hidden ${drawer ? '' : 'pointer-events-none'}`} inert={!drawer}>
        <div onClick={() => setDrawer(false)} className={`absolute inset-0 bg-[rgb(15_30_61/0.45)] transition-opacity duration-200 ${drawer ? 'opacity-100' : 'opacity-0'}`} />
        <div role="dialog" aria-modal="true" aria-label="Menu" className={`absolute inset-y-0 left-0 w-[280px] max-w-[85vw] transition-transform duration-200 ease-[var(--ease)] ${drawer ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
          {menu(false, () => setDrawer(false))}
        </div>
      </div>

      <div className="min-w-0 flex-1 lg:py-2 lg:pl-2 lg:pr-2">
        {/* A folha: uma superfície branca por página, a largura toda, até ao fundo do ecrã. */}
        <main className="relative w-full overflow-x-clip text-body lg:min-h-[calc(100vh-1rem)] lg:rounded-[14px] lg:border lg:border-line lg:bg-surface">
          <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
