import type { ReactNode } from 'react';
import type { Tone } from './Badge';

export function Chip({ tone = 'neutral', children }: Readonly<{ tone?: Tone; children: ReactNode }>) {
  return <li className={`chip chip-${tone}`}>{children}</li>;
}

export function ChipList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul className="chip-list" aria-label={label}>
      {children}
    </ul>
  );
}

interface ToggleChipProps {
  pressed: boolean;
  onToggle: () => void;
  title?: string;
  children: ReactNode;
}

export function ToggleChip({ pressed, onToggle, title, children }: Readonly<ToggleChipProps>) {
  return (
    <button type="button" className="chip chip-toggle" aria-pressed={pressed} title={title} onClick={onToggle}>
      {children}
    </button>
  );
}
