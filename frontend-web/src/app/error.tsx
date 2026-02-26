'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to server silently
    fetch('/api/logs/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'react-boundary',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : '',
        ts: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-white mb-2">Ceva a mers prost</h1>
        <p className="text-slate-400 mb-6 text-sm">
          {error.message ?? 'Eroare necunoscută'}
        </p>
        {process.env.NODE_ENV !== 'production' && error.stack && (
          <details className="text-left bg-slate-900 border border-slate-700 rounded p-4 mb-6 text-xs text-slate-400 overflow-auto max-h-48">
            <summary className="cursor-pointer font-medium mb-2 text-slate-300">Stack trace</summary>
            <pre className="whitespace-pre-wrap">{error.stack}</pre>
          </details>
        )}
        <button
          onClick={reset}
          className="bg-violet-600 text-white px-6 py-2 rounded-lg hover:bg-violet-700 transition"
        >
          Reîncearcă
        </button>
      </div>
    </div>
  );
}
