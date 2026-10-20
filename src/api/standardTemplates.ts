import type { StandardTemplate } from './types';

/** The built-in read-only template: static assets under the Pages base URL, not a row in `documents`. */
export function standardTemplatesFor(baseUrl: string): StandardTemplate[] {
  return [
    {
      id: 'standard-cv-template',
      title: 'Standard CV template',
      description: 'A fictional reference CV (Alex Example) you can use as a starting point.',
      pdfUrl: `${baseUrl}templates/standard-cv-template.pdf`,
      docxUrl: `${baseUrl}templates/standard-cv-template.docx`,
    },
  ];
}

export function standardTemplates(): StandardTemplate[] {
  return standardTemplatesFor(import.meta.env.BASE_URL);
}
