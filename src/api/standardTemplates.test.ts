import { standardTemplates, standardTemplatesFor } from './standardTemplates';

describe('standardTemplates', () => {
  it('points at the static assets under the given base URL', () => {
    expect(standardTemplatesFor('/job-hunter-pages/')).toEqual([
      {
        id: 'standard-cv-template',
        title: 'Standard CV template',
        description: 'A fictional reference CV (Alex Example) you can use as a starting point.',
        pdfUrl: '/job-hunter-pages/templates/standard-cv-template.pdf',
        docxUrl: '/job-hunter-pages/templates/standard-cv-template.docx',
      },
    ]);
  });

  it('uses the Vite base URL by default', () => {
    expect(standardTemplates()[0].pdfUrl).toBe(`${import.meta.env.BASE_URL}templates/standard-cv-template.pdf`);
  });
});
