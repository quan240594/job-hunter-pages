# Contract

**Single source of truth** for every owner (UI, mock API, Supabase API, edge function, SQL/migrations, workflows).
The TypeScript shapes live in [`src/api/types.ts`](../src/api/types.ts) and [`src/api/dataApi.ts`](../src/api/dataApi.ts)
and must match this document. Changing either requires an entry in [`CONTRACT-CHANGES.md`](CONTRACT-CHANGES.md).
TypeScript is camelCase; Postgres is snake_case (`firstSeenAt` <-> `first_seen_at`).

## 1. Roles and auth model

- `Role = 'admin' | 'user'`, read from the JWT claim `app_metadata.role`; a missing claim means `'user'`.
  `app_metadata` can only be written with the service-role key, so users cannot promote themselves.
- **Invite-only**: sign-ups are disabled (`enable_signup = false` in `supabase/config.toml`), login is email +
  password, and there is **no public registration page**. Users are created by an admin (section 7).
- **Admin bootstrap**: the first admin is granted by a GitHub Actions workflow (`set-admin-role.yml`, workflow_dispatch
  with an `email` input, modelled on the badminton app's workflow) that uses the service-role key
  (`SUPABASE_SERVICE_ROLE_KEY` secret) to set `app_metadata.role = 'admin'`.
- `Session = { userId, email, role, mustChangePassword }`. `mustChangePassword` mirrors
  `user_metadata.must_change_password`. While it is true, the UI only allows `/change-password` (route guard) until
  `auth.changePassword()` succeeded, which clears the flag.
- **Privacy**: admins do **not** get read access to other users' rows. An admin sees account metadata only
  (`AdminUser`), through the edge function.

## 2. Entities

| Entity | Shape (see `types.ts`) |
| --- | --- |
| `ApiError` | `{ code, message }`; `code` is one of `unauthenticated`, `forbidden`, `not_found`, `validation`, `template_limit`, `conflict`, `network`, `unknown` |
| `Profile` | `{ userId, displayName, headline, summary, cv: CvProfile, searchSettings: SearchSettings, updatedAt }` |
| `CvProfile` | `{ contact{name,email,phone,location}, experience[], education[], skills{has[],lacks[]}, languages[], links[] }` |
| `SearchSettings` | `{ keywords[], cities[], remote: 'hybrid-or-remote' \| 'any', englishOnly, minSeniority: 'any' \| 'mid' \| 'senior' \| 'staff' }`; `cities` defaults to `['Amsterdam','Rotterdam','Den Haag']` |
| `Job` | `{ id, userId, title, company, location, url, source, description, postedAt?, firstSeenAt, status, fit, category, hybrid, hybridQuote?, language, recommendedDocumentIds[] }` |
| `Application` | `{ id, userId, jobId, appliedAt, cvDocumentId, letterDocumentId, cvLabel, notes, stage }` |
| `DocumentMeta` | `{ id, userId, jobId, kind, filename, mime, sizeBytes, storagePath, createdAt, expiresAt }` |
| `AdminUser` | `{ id, email, role, createdAt, lastSignInAt, banned }` |

**`SearchSettings` is stored in phase 1 but NOT used by anything yet.** It is consumed by per-user automated scraping
in a *later* phase (phase 2, see `DESIGN.md`). In phase 1 the UI only lets the user edit and save it.

### Jobs

- `id`: stable string, unique **per user + job**; the frozen scheme is the first 16 hex chars of
  `sha1(norm(company) | norm(title) | norm(location))` (same as the private tracker). The primary key is
  `(user_id, id)`: two users can hold the same `id`.
- `status`: `'new' | 'applied' | 'skipped'`. `fit`: `0..5` (0 = not scored). `category`: `'A'|'B'|'C'|'D'`
  (A qualified, B Dutch needed, C hybrid unclear, D agency). `hybrid`: `'quoted'|'unclear'|'office-first'`.
  `language`: `'english'|'dutch'|'unknown'`. `location` is the city (`'Unknown'` when not known).
- `postedAt` and `hybridQuote` are **absent** (not `null`) when unknown; the API layer omits null columns.
- **Manual jobs** (`source = 'manual'`) are allowed for everyone through `jobs.addManual()`. Defaults: `fit` 0,
  `category` `'C'`, `hybrid` `'unclear'`, `language` `'unknown'`, `status` `'new'`, `firstSeenAt` = now,
  `recommendedDocumentIds` `[]`. The id uses the same scheme (computed with `crypto.subtle`), so adding the same
  company/title/location twice rejects with `'conflict'`, and a later scraper ingest of that job is a no-op.
- `recommendedDocumentIds` references documents of the same user; ids of expired/removed documents are ignored by the UI
  (no foreign key on the array).

### Applications

- `stage`: `'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn'`.
- At most one application per job (`unique (user_id, job_id)`); a second `apply()` rejects with `'conflict'`.
- `apply()` sets the job status to `'applied'`; `remove()` deletes the application and sets the job back to `'new'`
  if it was `'applied'`. The two writes may be one RPC/transaction in the Supabase implementation.
- `cvLabel` is plain text kept even when the document later expires. When the document is removed, `cvDocumentId` /
  `letterDocumentId` become `null` (`on delete set null`) and the UI shows **"document expired"** next to the label.

### Documents

- `kind`: `'cv' | 'letter' | 'template'`. `mime`: PDF (`application/pdf`) or DOCX
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) only. Maximum upload **10 MB**
  (10 485 760 bytes). Violations reject with `'validation'` (checked in the UI/API *and* enforced by the database /
  bucket limits).
- **Expiry**: `cv` and `letter` expire **6 months after `createdAt`** (`expiresAt = createdAt + 6 months`). `template`
  **never** expires (`expiresAt = null`). A trigger computes `expires_at`; the client never sets it.
- **At most 3 `template` documents per user**, enforced in the DB by a trigger and in the UI. The 4th upload is
  rejected with error code **`'template_limit'`**.
- **Built-in "Standard CV template"**: read-only, fictional person ("Alex Example"), shipped as the static assets
  `public/templates/standard-cv-template.pdf` and `.docx` (served under the Pages base URL, i.e.
  `${import.meta.env.BASE_URL}templates/standard-cv-template.pdf`). It is shown in the UI as the default reference,
  returned by `documents.standardTemplates()`, is not a row in `documents`, and does **not** count toward the 3.
- **Cleanup**: a scheduled workflow (service role) removes the storage object and the row of every document whose
  `expires_at < now()`. Applications keep `cvLabel`.
- `signedUrl(id)` returns a Storage signed URL valid for **60 seconds**.

## 3. DataApi (`src/api/dataApi.ts`)

All methods return promises and **reject with `ApiError`** (never a bare `Error`).

| Group | Methods |
| --- | --- |
| `auth` | `getSession()`, `onAuthChange(cb) -> unsubscribe`, `signIn(email, password)`, `signOut()`, `changePassword(newPassword)`, `deleteMyAccount()`, `exportMyData() -> JSON Blob` |
| `jobs` | `list({status?, since?, until?, search?})`, `get(id)`, `setStatus(id, status)`, `addManual(input)` |
| `applications` | `list({since?, until?})`, `apply({jobId, cvDocumentId, letterDocumentId, cvLabel, notes})`, `update(id, patch)`, `remove(id)` |
| `profile` | `get() -> Profile \| null`, `save(profile: ProfileInput)` |
| `documents` | `list({kind?})`, `upload(file, {kind, jobId?})`, `signedUrl(id)` (60 s), `remove(id)`, `standardTemplates()` |
| `admin` | `listUsers()`, `createUser({email, tempPassword?, role})`, `setRole(id, role)`, `setBanned(id, banned)`, `deleteUser(id)` |

Semantics:

- `jobs.list` filters `since`/`until` on `firstSeenAt` (inclusive, ISO 8601); `search` is a case-insensitive substring
  match on title, company and location. Results are ordered by `firstSeenAt` descending. `applications.list` filters on
  `appliedAt`, newest first.
- `jobs.get` / `setStatus` / `applications.update` / `documents.signedUrl` / `remove` on a row that does not exist *or
  belongs to someone else* reject with `'not_found'` (RLS makes both look identical).
- `deleteMyAccount()` deletes the auth user, all rows and all storage objects of the caller, then signs out. It is
  served by the edge function (action `deleteSelf`, section 4) because only the service role may delete auth users.
- `exportMyData()` runs client-side under RLS and returns a `Blob` (`application/json`) with `profile`, `jobs`,
  `applications` and `documents` (metadata only).
- `changePassword()` also sets `user_metadata.must_change_password = false`.
- `onAuthChange` fires for sign-in, sign-out and token refresh; the callback receives the new `Session` or `null`.
- Error mapping: no session / 401 -> `unauthenticated`; 403 / RLS violation -> `forbidden`; bad input ->
  `validation`; unique violation -> `conflict`; DB trigger `template_limit` -> `template_limit`; fetch failure ->
  `network`; anything else -> `unknown`.

## 4. Edge Function `admin-users`

The only Edge Function. `POST /functions/v1/admin-users`, JSON body `AdminAction` (see `types.ts`):

```json
{ "action": "listUsers" }
{ "action": "createUser", "email": "...", "tempPassword": "...", "role": "user" }
{ "action": "setRole", "id": "<uuid>", "role": "admin" }
{ "action": "setBanned", "id": "<uuid>", "banned": true }
{ "action": "deleteUser", "id": "<uuid>" }
{ "action": "deleteSelf" }
```

Response body is always `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message" } }`
(`AdminResponse<T>`); the HTTP status mirrors the code (200, 400 validation, 401 unauthenticated, 403 forbidden,
404 not_found, 409 conflict, 500 unknown). `data` is `AdminUser[]` for `listUsers`, `AdminUser` for `createUser` /
`setRole` / `setBanned`, and `null` for the delete actions.

Rules:

- The caller must send a JWT with `app_metadata.role === 'admin'`, **verified** by the function (and re-checked against
  the user record with the service-role client so a demotion or ban takes effect immediately). Every action except
  `deleteSelf` requires admin; `deleteSelf` works for any authenticated user and only affects the caller.
- Guards: an admin cannot demote, ban or delete **themselves** (`'forbidden'`), nor remove the **last admin**
  (demote / ban / delete the only remaining admin -> `'forbidden'`). The last-admin rule also applies to `deleteSelf`.
- `createUser` **without** `tempPassword` sends an invite email (`inviteUserByEmail`, `app_metadata.role = role`,
  `user_metadata.must_change_password = true` so the invited user is asked to choose a password at first login).
  **With** `tempPassword` the user is created email-confirmed (`email_confirm: true`) with
  `user_metadata.must_change_password = true`; the UI forces a password change at first login. Creating an existing
  email rejects with `'conflict'`.
- `deleteUser` and `deleteSelf` remove the user's storage objects (`documents/{user_id}/...`) through the Storage API,
  then the auth user; rows follow through `on delete cascade`.
- CORS: exact allow-list of origins (the Pages origin and `http://localhost:5173` / `http://127.0.0.1:5173`), never `*`.
- The service-role key is read from the function's environment; it is never sent to the browser.

## 5. Database contract (snake_case)

Every table has `user_id uuid not null references auth.users on delete cascade`, **RLS enabled**, and the policy
`user_id = auth.uid()` for `select`, `insert`, `update` and `delete` (role `authenticated`). No table is readable by
`anon`. **Admins get no extra read access** to other users' rows.

| Table | Columns |
| --- | --- |
| `profiles` | `user_id` **pk**, `display_name text`, `headline text`, `summary text`, `cv jsonb`, `search_settings jsonb`, `updated_at timestamptz` |
| `jobs` | pk `(user_id, id text)`, `title`, `company`, `location`, `url null`, `source`, `description`, `posted_at null`, `first_seen_at`, `status` (check new/applied/skipped), `fit smallint` (check 0..5), `category` (check A-D), `hybrid` (check), `hybrid_quote null`, `language` (check), `recommended_document_ids uuid[] default '{}'`, `updated_at` |
| `applications` | `id uuid pk`, `user_id`, `job_id text` (fk `(user_id, job_id)` -> `jobs` on delete cascade), `applied_at`, `cv_document_id uuid null` and `letter_document_id uuid null` (fk -> `documents` on delete set null), `cv_label text`, `notes text`, `stage` (check), `updated_at`, unique `(user_id, job_id)` |
| `documents` | `id uuid pk`, `user_id`, `job_id text null`, `kind` (check), `filename`, `mime` (check pdf/docx), `size_bytes int` (check `<= 10485760`), `storage_path text`, `created_at`, `expires_at null` |

- **Indexes**: `jobs (user_id, status, first_seen_at desc)`, `applications (user_id, applied_at desc)`,
  `documents (user_id, kind)`, `documents (expires_at) where expires_at is not null` (cleanup).
- **Triggers**: `updated_at` on `profiles`, `jobs`, `applications`; on `documents` insert, a trigger (a) sets
  `expires_at = created_at + interval '6 months'` for `cv`/`letter` and `null` for `template` (ignoring client
  values), and (b) rejects the 4th `template` per user with an exception whose message is `template_limit`.
- **Storage**: private bucket `documents` (not public), file size limit 10 MB, allowed mime types pdf/docx. Object path
  `{user_id}/{document_id}/{filename}`; storage RLS limits every operation to objects whose first path segment equals
  `auth.uid()::text`.
- **Service-role-only paths** (never reachable with the anon key):
  - *Scraper ingest*: the private repo upserts jobs for a given `user_id` with **insert-or-ignore** on `(user_id, id)`
    (`on conflict (user_id, id) do nothing`), so it never overwrites `status` or any user edit.
  - *Cleanup workflow*: scheduled (daily), deletes expired documents (storage objects first, then rows).
  - *Admin bootstrap workflow* and the `admin-users` function.

## 6. Static assets

`public/templates/standard-cv-template.pdf` and `.docx` (fictional "Alex Example"). Built to
`dist/templates/...`; URLs come from `import.meta.env.BASE_URL` so they work under `/job-hunter-pages/`.

## 7. Configuration

| Variable | Meaning |
| --- | --- |
| `VITE_DATA_MODE` | `mock` or `supabase` (default when unset or blank: `supabase`); anything else is a config error |
| `VITE_SUPABASE_URL` | `https://...` (http only for localhost); required in supabase mode |
| `VITE_SUPABASE_ANON_KEY` | public anon key; required in supabase mode |

`src/config.ts` validates these and exports `AppConfig`; a missing/invalid value renders the "Configuration error"
screen instead of a blank page. Only the anon key ever reaches the browser.

## 8. Ownership map

| Area | Files |
| --- | --- |
| Scaffold / contract | `docs/*`, `src/api/types.ts`, `src/api/dataApi.ts`, `src/api/index.ts`, `src/config.ts`, `src/App.tsx`, `src/auth/*`, tooling |
| Mock API | `src/api/mockApi.ts` (+ tests, fixtures) |
| Supabase API | `src/api/supabaseApi.ts` (+ tests) |
| UI pages | `src/pages/*Page.tsx` (one owner per page) |
| DB | `supabase/**` (config.toml, migrations, seed) |
| Edge function + workflows | `supabase/functions/admin-users/**`, `.github/workflows/{set-admin-role,cleanup}.yml` |
