import { useStandardTemplates } from '../hooks/useData';
import { safeHttpUrl } from '../lib/errors';
import { DataState } from './DataState';

function DownloadLink({ href, label, title }: Readonly<{ href: string; label: string; title: string }>) {
  const safe = safeHttpUrl(href);
  if (safe === null) return null;
  return (
    <a className="btn btn-small" href={safe} download>
      {label}
      <span className="visually-hidden"> {title}</span>
    </a>
  );
}

/** The built-in, read-only reference CV (static files). It does not count toward the 3 templates. */
export function StandardTemplateCard() {
  const state = useStandardTemplates();
  return (
    <section className="card" aria-labelledby="standard-template-heading">
      <h2 id="standard-template-heading">Standard CV template</h2>
      <p className="muted">
        A built-in reference layout with a fictional person. It is read-only and does not count toward your 3 templates.
      </p>
      <DataState state={state} loadingLabel="Loading the standard template…">
        {(templates) =>
          templates.map((template) => (
            <div key={template.id} className="doc-row">
              <h3>{template.title}</h3>
              <p>{template.description}</p>
              <div className="card-actions">
                <DownloadLink href={template.pdfUrl} label="Download PDF" title={template.title} />
                <DownloadLink href={template.docxUrl} label="Download DOCX" title={template.title} />
              </div>
            </div>
          ))
        }
      </DataState>
    </section>
  );
}
