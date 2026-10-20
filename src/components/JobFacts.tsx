import type { ReactNode } from 'react';
import type { Job } from '../api';
import { formatDate } from '../lib/format';
import { HYBRID_LABELS, LANGUAGE_LABELS } from '../lib/labels';
import { safeHttpUrl } from '../lib/errors';
import { ADZUNA_SOURCE, sourceLabel } from '../lib/attribution';
import { AdzunaCredit } from './AdzunaCredit';
import { CategoryBadge } from './Badge';
import { FitStars } from './FitStars';

export function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function JobFacts({ job }: Readonly<{ job: Job }>) {
  return (
    <dl className="facts">
      <Fact label="Location">{job.location}</Fact>
      <Fact label="Category">
        <CategoryBadge category={job.category} withLabel />
      </Fact>
      <Fact label="Hybrid">
        {HYBRID_LABELS[job.hybrid]}
        {job.hybridQuote === undefined ? null : <blockquote className="quote">“{job.hybridQuote}”</blockquote>}
      </Fact>
      <Fact label="Language">{LANGUAGE_LABELS[job.language]}</Fact>
      <Fact label="Fit">
        <FitStars fit={job.fit} />
      </Fact>
      <Fact label="Source">{job.source === ADZUNA_SOURCE ? <AdzunaCredit /> : sourceLabel(job.source)}</Fact>
      <Fact label="First seen">{formatDate(job.firstSeenAt)}</Fact>
      <Fact label="Posted">{job.postedAt === undefined ? 'Unknown' : formatDate(job.postedAt)}</Fact>
    </dl>
  );
}

export function JobLink({ url }: Readonly<{ url: string | null }>) {
  const href = safeHttpUrl(url);
  if (href === null) return <span className="muted">No link to the posting</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      View posting<span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
