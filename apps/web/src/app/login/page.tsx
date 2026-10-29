'use client';

import { useEffect } from 'react';

// O login vive na raiz; /login fica só para links antigos.
export default function LoginRedirect() {
  useEffect(() => { window.location.replace('/'); }, []);
  return null;
}
