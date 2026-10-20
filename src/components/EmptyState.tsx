import type { ReactNode } from 'react';

export function EmptyState({ title, hint, children }: Readonly<{ title: string; hint?: string; children?: ReactNode }>) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {hint === undefined ? null : <p className="state-hint">{hint}</p>}
      {children}
    </div>
  );
}
