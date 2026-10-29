'use client';

import { useSyncExternalStore } from 'react';

/**
 * Web NFC: só existe no Chrome para Android e só em HTTPS (ou localhost).
 * O iPhone não o tem em nenhum browser; aí o UID escreve-se à mão ou com um leitor USB.
 */

export type NfcSupport = 'ok' | 'insecure' | 'unsupported';

interface NdefReadingEvent { serialNumber?: string }
interface NdefReader {
  scan(opts?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((e: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}

export function nfcSupport(): NfcSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if ('NDEFReader' in window) return 'ok';
  // Em HTTP o Chrome esconde a API: distinguir ajuda a explicar o problema.
  return window.isSecureContext ? 'unsupported' : 'insecure';
}

const noop = () => () => {};
export function useNfcSupport(): NfcSupport {
  return useSyncExternalStore(noop, nfcSupport, () => 'unsupported');
}

/** "04:a1:b2…" → "04A1B2…", o formato guardado na base. */
export const normalizeUid = (v: string) => v.replace(/[:\s-]/g, '').toUpperCase();

/** Com a permissão já dada, o Chrome deixa ler sem um toque no ecrã (o kiosk arranca sozinho). */
export async function nfcPermission(): Promise<PermissionState | 'unknown'> {
  try { return (await navigator.permissions.query({ name: 'nfc' as PermissionName })).state; }
  catch { return 'unknown'; }
}

export type NfcError = 'denied' | 'unavailable';

/**
 * Começa a ler cartões até `signal` abortar. Cada cartão chama `onCard` com o UID normalizado;
 * cartões sem número de série chamam `onUnreadable`.
 */
export async function startNfc(opts: {
  signal: AbortSignal; onCard: (uid: string) => void; onUnreadable?: () => void;
}): Promise<NfcError | null> {
  try {
    const reader = new (window as unknown as { NDEFReader: new () => NdefReader }).NDEFReader();
    reader.onreading = (e) => {
      if (opts.signal.aborted) return;
      const uid = normalizeUid(e.serialNumber ?? '');
      if (uid) opts.onCard(uid); else opts.onUnreadable?.();
    };
    reader.onreadingerror = () => { if (!opts.signal.aborted) opts.onUnreadable?.(); };
    await reader.scan({ signal: opts.signal });
    return null;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    return (err as Error).name === 'NotAllowedError' ? 'denied' : 'unavailable';
  }
}

export const NFC_ERRORS: Record<NfcError, string> = {
  denied: 'O Chrome não tem permissão para usar o NFC. Permita-o nas definições do site e tente de novo.',
  unavailable: 'O NFC está desligado ou indisponível. Ligue-o nas definições do telemóvel.',
};

export const NFC_SUPPORT_TEXT: Record<Exclude<NfcSupport, 'ok'>, string> = {
  insecure: 'O NFC só funciona com ligação segura (https://). Abra o Prezenti pelo endereço com https.',
  unsupported: 'Este navegador não lê cartões. Use o Chrome num telemóvel Android com NFC.',
};
