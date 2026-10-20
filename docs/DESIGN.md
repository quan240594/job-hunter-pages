# Design

Job Hunter Pages is a multi-user (friends & family) job-hunt tracker. Each user sees only their own data. It is a
static React app on GitHub Pages backed by Supabase (Auth, Postgres with Row Level Security, private Storage and one
Edge Function). The exact interfaces are in [`CONTRACT.md`](CONTRACT.md); coding/security rules are in
[`QUALITY.md`](QUALITY.md).

## 1. Architecture

```
Browser (GitHub Pages, static, HashRouter)
  React 19 UI  ->  DataApi (src/api/dataApi.ts)
                     |-- mockApi      (VITE_DATA_MODE=mock: in-memory, no backend)
                     '-- supabaseApi  (VITE_DATA_MODE=supabase)
                            |-- supabase-js (anon key + user JWT) -> Auth, Postgres (RLS), Storage (private bucket)
                            '-- POST /functions/v1/admin-users    -> Edge Function (service role, admin-checked)

GitHub Actions
  - ci.yml          typecheck, lint, 100% coverage, mock build, SonarCloud
  - deploy.yml      build with injected env, deploy to Pages
  - (DB/edge owners) set-admin-role.yml, document cleanup (cron), supabase deploy
Private job-hunter repo (OWNER's scraper) -- service role --> upsert jobs for the owner's user_id (insert-or-ignore)
```

- **Single package** (not a monorepo): Vite + React 19 + TypeScript at the repo root. `base = '/job-hunter-pages/'`.
- **One data seam**: the UI only talks to `DataApi`. `createDataApi(config)` (`src/api/index.ts`) lazily imports the
  mock or the Supabase implementation, so production bundles never load the mock.
- **Routing**: `HashRouter` (`#/new`, `#/found`, ...). GitHub Pages serves only files, so hash routes need no `404.html`
  fallback and deep links and reloads just work.
- **Auth state**: `AuthProvider` (loads the session, subscribes to `onAuthChange`) + `RouteGuard` (loading, error,
  anonymous -> `/login`, forced password change -> `/change-password`, admin-only pages -> forbidden screen). Pages: `/login`, `/change-password`, `/new`, `/found`,
  `/applied`, `/profile`, `/documents`, `/account`, `/admin` (admin only).
- **Config**: `src/config.ts` validates `VITE_DATA_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; supabase
  mode without URL/key shows a clear "Configuration error" screen (`src/bootstrap.tsx`).

## 2. Decisions

| Decision | Why |
| --- | --- |
| Invite-only, email + password, top-level `[auth] enable_signup=false` (and `[auth.email] enable_signup=true`, which is the email+password provider switch, not "allow signups") | Friends & family only; no public registration surface or abuse. |
| Role in `app_metadata.role` (JWT) | Only the service role can write it, so it cannot be self-assigned; no extra roles table. |
| RLS `user_id = auth.uid()` on every table; admins get **no** row access | Privacy: even the admin sees only account metadata (via the edge function), never other people's jobs or CVs. |
| One Edge Function `admin-users` | Creating/banning/deleting auth users needs the service-role key, which must never reach the browser. It also serves `deleteSelf` for account deletion. |
| Private Storage bucket, 60 s signed URLs, per-user folder policy | Documents contain personal data; nothing is public. |
| CV/letter expire after 6 months, templates never (max 3 per user, DB trigger) | Data minimisation; templates are the user's long-lived base documents. Cleanup removes the storage object and row; applications keep `cvLabel`. |
| Built-in "Standard CV template" as static assets, not a DB row | Public, fictional, read-only reference; does not count toward the 3. |
| Frozen job-id scheme, PK `(user_id, id)`, ingest insert-or-ignore | Re-scraping never overwrites a user's status; the same job can exist for several users. |
| `ApiError` everywhere, one mapping place | UI handles a small closed set of error codes regardless of backend. |
| Mock mode as a first-class build (`build:mock`) | Demo/e2e without a backend; same pattern as the portfolio tracker's Pages demo. |
| 100 % coverage, SonarJS lint, Sonar project | Same "perfect" standard as the private tracker (see `QUALITY.md`). |
| `.npmrc: omit-lockfile-registry-resolved=true` | Public repo: no corporate registry URLs in `package-lock.json`. |

### Auth redirects and HashRouter (needs care from the Supabase owners)

Supabase's default implicit flow returns tokens in the URL **hash** (`#access_token=...`), which collides with
`HashRouter` (the hash is the route). Therefore:

- use `flowType: 'pkce'` (code arrives as `?code=...` in the query string, before the `#`), and
- for invite / recovery emails, customise the templates (`supabase/templates/*.html`, wired in `config.toml` only once
  custom SMTP exists, see `supabase/README.md`) to link to
  `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite` (or `recovery`), and have `supabaseApi` call
  `auth.verifyOtp({ token_hash, type })` at startup, then strip the query string.

**Email delivery without custom SMTP:** Supabase's default sender is heavily rate limited and may only deliver to
project/org team members, and email templates cannot be changed on the free tier with the default provider. So the
supported way to onboard friends is an admin-created user with a temporary password (no email); invite-by-email only
works once custom SMTP and the templates are configured.

`Site URL` / redirect allow-list = the Pages URL (`https://<user>.github.io/job-hunter-pages/`) plus
`http://localhost:5173` for development.

### Mock mode (`VITE_DATA_MODE=mock`)

`src/api/mockApi.ts` is a complete in-memory `DataApi` with fictional seed data (Alex Example: 12 jobs over six
months, a structured CV profile, 4 applications, 4 documents incl. one expired, two admin-list users), used by the
Pages demo (`build:mock`) and e2e. Log in as `alex@example.com` (role `user`) or `admin@example.com` (role `admin`)
with any non-empty password. It honours the contract's error codes and guards; nothing is persisted, a reload resets
it.

### Job source attribution (Adzuna)

Adzuna's API terms require attribution wherever its listings are shown. Jobs whose `source` is the plain string
`adzuna` show a hyperlinked "Jobs by Adzuna" credit (to `https://www.adzuna.nl/`, new tab, `rel="noopener noreferrer"`)
in the job cards, the job dialog and under the Found table; every authenticated screen has a footer line "Some job
listings are provided by Adzuna (adzuna.nl)." Jobs from `jooble` get a neutral "via Jooble" source label.

The credit is text until the owner adds the official logo: the logo is not in the repository (and must not be drawn or
invented). Put the file (at least 116x23 px) in `public/` and set `ADZUNA_LOGO_SRC` in `src/lib/attribution.ts`, e.g.
`` `${import.meta.env.BASE_URL}adzuna-logo.png` ``; `<AdzunaCredit>` then renders it as the link image. The component
also takes an optional `logoSrc` prop that overrides the constant.

## 3. Phasing

**Phase 1 (this build)**

- Auth and user management (invite, temporary password, roles, ban, delete; forced first-login password change).
- Per-user data isolation (RLS).
- UI: New, Found, Applied, Profile, Documents, Account, Admin.
- Documents with the 3-template cap, the built-in standard template and the 6-month cleanup.
- **Ingest of the OWNER's scraped jobs** from the private repo (service role, insert-or-ignore).
- **Manual job entry for everyone** (`jobs.addManual`).
- `Profile.searchSettings` is stored and editable, but **not used by anything yet**.

**Phase 2 (later)**

- Per-user automated scraping driven by each user's `searchSettings` (keywords, cities, remote preference,
  English-only, minimum seniority). Not part of this build; the contract only reserves the data.

## 4. Hosting facts

- **GitHub Pages**: public repository, deployed by the `deploy.yml` workflow (Settings > Pages > Source: GitHub
  Actions). The Supabase URL and anon key are injected at build time from repository secrets, never committed. The anon
  key is public by design; RLS protects the data.
- **Supabase free tier**: a project is **paused after about one week of inactivity** (needs a manual resume, or a
  scheduled ping). *Unverified, check the current Supabase pricing/limits docs before relying on it.* If it holds,
  the daily cleanup/ingest workflows' traffic should keep the project awake; verify that too.
- **SonarCloud**: the Sonar project for this public repository is public, so it does **not** use the private
  50k-lines-of-code quota of the private tracker. Project key `quan240594_job-hunter-pages`, organisation
  `quan240594`.

## 5. Delivery workflow

1. Scaffold (this commit): contract, tooling, stubs, route skeleton, tests at 100 %.
2. Parallel owners fill the stubs and pages against the contract; each removes its stub coverage exclusion.
3. DB owner: migrations, RLS, triggers, bucket, `config.toml`; edge function and workflows.
4. Deploy: set repository secrets, enable Pages, bootstrap the first admin with the workflow, invite users.
