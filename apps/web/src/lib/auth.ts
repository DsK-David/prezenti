'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface SessionUser { id: number; name: string; role: 'super_admin' | 'admin' | 'teacher' | 'guardian'; school_id: number | null }
interface Session { token: string; user: SessionUser }

const KEY = 'prezenti.session';

export const homeFor = (role: SessionUser['role']) =>
  role === 'guardian' ? '/pais' : role === 'super_admin' ? '/plataforma' : '/painel';

export function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

export async function login(email: string, password: string) {
  const s = await api<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function logout() {
  localStorage.removeItem(KEY);
  window.location.href = '/login';
}

/** Lê a sessão no cliente; `ready` evita piscar o ecrã de login antes de ler o localStorage. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setSession(loadSession()); setReady(true); }, []);
  const call = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      try {
        return await api<T>(path, { ...init, token: session?.token });
      } catch (e) {
        if ((e as Error).message === 'unauthorized') logout();
        throw e;
      }
    },
    [session],
  );
  return { session, ready, call };
}
