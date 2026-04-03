import React from 'react';

interface PaginatorProps {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}

export function Paginator({ page, totalPages, onChange }: PaginatorProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '…')[] = [];
  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 4) pages.push('…');
    for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) pages.push(i);
    if (page < totalPages - 3) pages.push('…');
    pages.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    border: '1px solid #2d3748', minWidth: 36, textAlign: 'center',
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        style={{ ...btnBase, background: '#1a1d27', color: '#94a3b8', opacity: page === 1 ? 0.4 : 1 }}>←</button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '6px 4px', color: '#475569', fontSize: 13 }}>…</span>
          : <button key={p} onClick={() => onChange(p as number)} style={{
              ...btnBase,
              background: p === page ? '#7c3aed' : '#1a1d27',
              color: p === page ? '#fff' : '#94a3b8',
              border: `1px solid ${p === page ? '#7c3aed' : '#2d3748'}`,
              cursor: p === page ? 'default' : 'pointer',
            }}>{p}</button>
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
        style={{ ...btnBase, background: '#1a1d27', color: '#94a3b8', opacity: page === totalPages ? 0.4 : 1 }}>→</button>
    </div>
  );
}
