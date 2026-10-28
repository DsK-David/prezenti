'use client';

import { useEffect } from 'react';
import { homeFor, loadSession } from '@/lib/auth';
import { RingMark } from '@/components/ui';

export default function Home() {
  useEffect(() => {
    const s = loadSession();
    window.location.replace(s ? homeFor(s.user.role) : '/login');
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center text-brand">
      <span className="anim-blink"><RingMark size={44} /></span>
    </main>
  );
}
