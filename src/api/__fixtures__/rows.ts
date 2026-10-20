// Typical PostgREST rows (snake_case) for the supabase tests. Fictional data only.
export const JOB_ROW = {
  user_id: 'u1',
  id: 'abcdef0123456789',
  title: 'Platform Engineer',
  company: 'Acme',
  location: 'Amsterdam',
  url: 'https://jobs.example.com/1',
  source: 'greenhouse:acme',
  description: 'd',
  posted_at: '2026-05-01T00:00:00+00:00',
  first_seen_at: '2026-05-02T00:00:00+00:00',
  status: 'new',
  fit: 4,
  category: 'A',
  hybrid: 'quoted',
  hybrid_quote: 'two days',
  language: 'english',
  recommended_document_ids: ['d1'],
  updated_at: '2026-05-02T00:00:00+00:00',
};

export const APPLICATION_ROW = {
  id: 'a1',
  user_id: 'u1',
  job_id: 'abcdef0123456789',
  applied_at: '2026-05-03T00:00:00+00:00',
  cv_document_id: 'd1',
  letter_document_id: null,
  cv_label: 'CV',
  notes: 'n',
  stage: 'interview',
};

export const DOCUMENT_ROW = {
  id: 'd1',
  user_id: 'u1',
  job_id: null,
  kind: 'cv',
  filename: 'cv.pdf',
  mime: 'application/pdf',
  size_bytes: 1024,
  storage_path: 'u1/d1/cv.pdf',
  created_at: '2026-05-01T00:00:00+00:00',
  expires_at: '2026-11-01T00:00:00+00:00',
};

export const PROFILE_ROW = {
  user_id: 'u1',
  display_name: 'Alex Example',
  headline: 'Engineer',
  summary: 'Fictional.',
  cv: { contact: { name: 'Alex Example', email: 'alex@example.com', phone: '', location: 'Amsterdam' } },
  search_settings: { keywords: ['java'], cities: ['Amsterdam'], remote: 'any', englishOnly: false, minSeniority: 'senior' },
  updated_at: '2026-05-04T00:00:00+00:00',
};
