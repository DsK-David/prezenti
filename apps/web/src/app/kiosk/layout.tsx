import type { Metadata, Viewport } from 'next';

// O kiosk instala-se como app própria: abre direto no leitor, em ecrã inteiro.
export const metadata: Metadata = {
  title: 'Prezenti Kiosk',
  manifest: '/kiosk.webmanifest',
  appleWebApp: { capable: true, title: 'Kiosk', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#f6f8fc',
  // O ecrã do kiosk não deve ampliar com toques acidentais.
  maximumScale: 1,
  userScalable: false,
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
