import Link from 'next/link';
import { RingMark } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="anim-rise flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="text-brand"><RingMark size={44} /></span>
        <h1 className="font-display text-3xl text-ink">Página não encontrada</h1>
        <p className="text-muted">O endereço que abriu não existe no Prezenti.</p>
        <Link href="/" className="btn btn-primary px-6 py-3">Ir para o início</Link>
      </div>
    </main>
  );
}
