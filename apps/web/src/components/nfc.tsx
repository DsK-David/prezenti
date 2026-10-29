'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { RingMark } from './ui';
import { NFC_ERRORS, startNfc, useNfcSupport } from '@/lib/nfc';

type ScanState = 'idle' | 'scanning' | 'read';

/**
 * Campo do UID do cartão. Com NFC no telemóvel, "Ler cartão" preenche-o ao encostar o cartão;
 * sem NFC é um campo de texto normal. Envia o valor com `name` dentro do form.
 */
export function CardUidField({ name = 'card_uid', label = 'UID do cartão', defaultValue = '', optional, hint, placeholder = '04A1B2C3D4E5' }: {
  name?: string; label?: string; defaultValue?: string; optional?: boolean; hint?: string; placeholder?: string;
}) {
  const id = useId();
  const supported = useNfcSupport() === 'ok';
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<ScanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Ao fechar a janela, a leitura para.
  useEffect(() => () => abort.current?.abort(), []);

  const stop = () => { abort.current?.abort(); abort.current = null; setState('idle'); };

  async function scan() {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null); setState('scanning');
    const err = await startNfc({
      signal: ctrl.signal,
      onCard: (uid) => {
        setValue(uid); setState('read'); setError(null);
        navigator.vibrate?.(60);
        ctrl.abort();
      },
      onUnreadable: () => setError('Não foi possível ler o cartão. Encoste-o de novo, parado, atrás do telemóvel.'),
    });
    if (err) { setState('idle'); setError(NFC_ERRORS[err]); }
  }

  const note = error
    ? <span className="text-footnote text-bad" role="alert">{error}</span>
    : state === 'read'
      ? <span className="text-footnote text-ok" role="status">Cartão lido. Confirme e guarde.</span>
      : hint && <span className="text-footnote text-muted">{hint}</span>;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}{optional && <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      <div className="relative">
        <input
          id={id} name={name} value={value}
          onChange={(e) => { setValue(e.target.value); if (state === 'read') setState('idle'); }}
          autoComplete="off" spellCheck={false} placeholder={placeholder}
          className={`input font-mono ${supported ? 'pr-28' : ''} ${state === 'read' ? 'border-ok' : ''}`}
        />
        {supported && state !== 'scanning' && (
          <button type="button" onClick={scan} className="btn absolute right-1 top-1/2 -translate-y-1/2 gap-1.5 bg-brand-soft px-2.5 py-1 text-[13px] text-brand hover:bg-brand/15">
            <RingMark size={16} /> Ler cartão
          </button>
        )}
      </div>
      {state === 'scanning' && (
        <div className="anim-fade flex items-center gap-3 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2.5" role="status">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center text-brand">
            <span className="nfc-ring" style={{ width: 20, height: 20 }} aria-hidden />
            <span className="nfc-ring" style={{ width: 20, height: 20, animationDelay: '1.4s' }} aria-hidden />
            <RingMark size={18} />
          </span>
          <span className="min-w-0 flex-1 text-footnote text-ink">Encoste o cartão na parte de trás do telemóvel.</span>
          <button type="button" onClick={stop} className="btn btn-quiet shrink-0 text-[13px]">Cancelar</button>
        </div>
      )}
      {note}
    </div>
  );
}
