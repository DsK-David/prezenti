'use client';

import { useEffect } from 'react';

/** Regista o service worker em toda a app: instalação como PWA, abrir sem rede e push. */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
