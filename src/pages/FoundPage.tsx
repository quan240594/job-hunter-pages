import { useState } from 'react';
import type { Job } from '../api';
import { AddJobDialog } from '../components/AddJobDialog';
import { DataState } from '../components/DataState';
import { EmptyState } from '../components/EmptyState';
import { JobDetailDialog } from '../components/JobDetailDialog';
import { JobFiltersBar } from '../components/JobFiltersBar';
import { JobsTable } from '../components/JobsTable';
import { Pagination } from '../components/Pagination';
import { useDocuments, useJobs, useNow } from '../hooks/useData';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { jobsQuery, pageOf, readJobFilters, sortJobs, writeJobFilters } from '../lib/jobFilters';
import type { JobFilterPatch } from '../lib/jobFilters';
import { PAGE_SIZE } from '../lib/labels';

export function FoundPage() {
  const { params, update, time, setTime } = useUrlFilters();
  const now = useNow();
  const filters = readJobFilters(params);
  const jobs = useJobs(jobsQuery(filters, time, now));
  const documents = useDocuments();
  const [open, setOpen] = useState<Job | null>(null);
  const [adding, setAdding] = useState(false);
  const change = (patch: JobFilterPatch) => update(writeJobFilters(params, patch));

  return (
    <section aria-labelledby="found-heading">
      <h1 id="found-heading">Found</h1>
      <p className="muted">Every job found so far. Filter by time and status, or search.</p>
      <div className="toolbar">
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add job manually
        </button>
      </div>
      <JobFiltersBar filters={filters} time={time} onChange={change} onTimeChange={setTime} />
      <DataState state={jobs} loadingLabel="Loading jobs…">
        {(data) => {
          const sorted = sortJobs(data, filters.sort, filters.order);
          const page = Math.min(filters.page, Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)));
          return sorted.length === 0 ? (
            <EmptyState title="No jobs match these filters" hint="Widen the time range or clear a filter." />
          ) : (
            <>
              <JobsTable jobs={pageOf(sorted, page)} onOpen={setOpen} />
              <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onPageChange={(next) => change({ page: next })} />
            </>
          );
        }}
      </DataState>
      {open === null ? null : (
        <JobDetailDialog job={open} documents={documents.data ?? []} onChanged={jobs.reload} onClose={() => setOpen(null)} />
      )}
      {adding ? (
        <AddJobDialog
          onAdded={() => {
            setAdding(false);
            jobs.reload();
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}
