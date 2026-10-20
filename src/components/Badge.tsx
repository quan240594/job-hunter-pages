import type { ReactNode } from 'react';
import type { ApplicationStage, Category, JobStatus, Role } from '../api';
import { CATEGORY_LABELS, STAGE_LABELS, STATUS_LABELS } from '../lib/labels';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export function Badge({ tone = 'neutral', title, children }: Readonly<{ tone?: Tone; title?: string; children: ReactNode }>) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

const CATEGORY_TONES: Record<Category, Tone> = { A: 'good', B: 'bad', C: 'warn', D: 'neutral' };
const STATUS_TONES: Record<JobStatus, Tone> = { new: 'info', applied: 'good', skipped: 'neutral' };
const STAGE_TONES: Record<ApplicationStage, Tone> = {
  applied: 'info',
  interview: 'warn',
  offer: 'good',
  rejected: 'bad',
  withdrawn: 'neutral',
};
const ROLE_TONES: Record<Role, Tone> = { admin: 'warn', user: 'neutral' };

export function StatusBadge({ status }: Readonly<{ status: JobStatus }>) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function StageBadge({ stage }: Readonly<{ stage: ApplicationStage }>) {
  return <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

export function RoleBadge({ role }: Readonly<{ role: Role }>) {
  return <Badge tone={ROLE_TONES[role]}>{role === 'admin' ? 'Admin' : 'User'}</Badge>;
}

export function CategoryBadge({ category, withLabel = false }: Readonly<{ category: Category; withLabel?: boolean }>) {
  return (
    <Badge tone={CATEGORY_TONES[category]} title={CATEGORY_LABELS[category]}>
      {category}
      {withLabel ? ` · ${CATEGORY_LABELS[category]}` : <span className="visually-hidden"> {CATEGORY_LABELS[category]}</span>}
    </Badge>
  );
}
