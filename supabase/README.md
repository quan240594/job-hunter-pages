# supabase/

Database, auth configuration and the `admin-users` Edge Function of Job Hunter Pages. The contract is
[`docs/CONTRACT.md`](../docs/CONTRACT.md) (sections 4 and 5); this folder implements it.

The Supabase CLI is a devDependency: always run it with `npx supabase ...`.

## Layout

| Path | What |
| --- | --- |
| `config.toml` | Project settings (`project_id = job-hunter-pages`): invite-only auth, password policy, redirect URLs, storage limit, `functions.admin-users.verify_jwt = true` (email templates are optional, see below). |
| `migrations/` | Timestamped SQL, applied in file-name order (see below). Every file is safe to run twice. |
| `templates/` | `invite.html`, `recovery.html`, `confirmation.html`: links of the form `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=...` for `auth.verifyOtp({ token_hash, type })` (HashRouter-friendly, see `docs/DESIGN.md`). `site_url` ends with a slash on purpose. |
| `functions/admin-users/` | The Edge Function. `handler.ts` holds all logic (injected client and clock, Node-testable); `index.ts` is the thin Deno entry point; `contract.ts` mirrors the shared types. |
| `tests/` | SQL tests (`*.sql.test.ts`, PGlite) plus the stand-in `auth`/`storage` schema (`stub.sql`). |
| `seed.sql` | Intentionally empty (public repo, no personal data). |

## Link, push, deploy

```sh
npx supabase login
npx supabase link --project-ref <ref>          # once; <ref> is the id in the dashboard URL
npx supabase db push                           # applies supabase/migrations to the linked project
npx supabase config push                       # applies [auth]/[api]/[storage] from config.toml (templates included)
npx supabase functions deploy admin-users      # deploys supabase/functions/admin-users
```

Edge Function environment: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform; never set them
yourself or commit them. Optional secret `ALLOWED_ORIGINS` (comma-separated, `https://` or loopback only) adds origins
(e.g. a custom domain) to the built-in allow-list: `https://quan240594.github.io`, `http://localhost:5173`,
`http://127.0.0.1:5173`. Set it with `npx supabase secrets set ALLOWED_ORIGINS=...`.

## Email without custom SMTP (default setup)

Supabase's default email sender is heavily rate limited and may only deliver to members of the project's team/org.
Therefore, **without custom SMTP the supported way to onboard friends is an admin-created user with a temporary
password** (`createUser` with `tempPassword`: no email is sent, the user must change the password at first login).
**Invite-by-email (`createUser` without `tempPassword`) and the HashRouter-friendly email links only work once custom
SMTP and the templates below are configured.** `config.toml` therefore contains no `[auth.email.template.*]` or
`[auth.smtp]` blocks: the free tier rejects `config push` when email templates are set on the default provider.

### Optional: custom SMTP and email templates

Enable only after configuring custom SMTP. Add to `config.toml` (secrets stay in the environment, never in the file):

```toml
[auth.email.smtp]
enabled = true
host = "env(SMTP_HOST)"
port = 587
user = "env(SMTP_USER)"
pass = "env(SMTP_PASS)"
admin_email = "env(SMTP_ADMIN_EMAIL)"
sender_name = "Job Hunter Pages"

[auth.email.template.invite]
subject = "You have been invited to Job Hunter Pages"
content_path = "./supabase/templates/invite.html"

[auth.email.template.recovery]
subject = "Reset your Job Hunter Pages password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.confirmation]
subject = "Confirm your email address for Job Hunter Pages"
content_path = "./supabase/templates/confirmation.html"
```

Then export the `SMTP_*` variables in the shell and run `npx supabase config push`. The `.html` files stay in
`supabase/templates/` meanwhile.

Password policy (`config.toml`): at least **12 characters** with lower case, upper case and digits
(`password_requirements = "lower_upper_letters_digits"`). The function applies the length rule (12 to 72 characters) to
admin-chosen temporary passwords and lets Auth enforce the character classes (rejected as `validation`).

## Migrations

| File | What it does |
| --- | --- |
| `20261020100000_core_tables.sql` | `set_updated_at()` trigger function; tables `profiles`, `jobs`, `documents`, `applications` with all column checks (status, fit 0-5, category, hybrid, language, stage, kind, mime, size <= 10 MiB, `storage_path` must start with `{user_id}/`), keys (`jobs` pk `(user_id, id)`, one application per `(user_id, job_id)`), composite foreign keys that keep applications pointing at the owner's own jobs/documents (`on delete set null (col)` for documents), the contract indexes and `updated_at` triggers. |
| `20261020100100_documents_rules.sql` | `BEFORE INSERT OR UPDATE` trigger on `documents`: derives `expires_at` (created_at + 6 months for `cv`/`letter`, `NULL` for `template`; the client value is ignored), forces `created_at = now()` for end users, and rejects a 4th template per user with message `template_limit` (SQLSTATE `P0001`; advisory lock per user against races). |
| `20261020100200_rls.sql` | RLS **enabled and forced** on all four tables; owner-only policies for select/insert/update/delete (`user_id = auth.uid()`, role `authenticated`); `anon` has no privileges; `service_role` has full access (bypasses RLS). Admins get no extra access. |
| `20261020100300_storage.sql` | Private bucket `documents` (10 485 760 bytes, PDF/DOCX only) and `storage.objects` policies: a user can select/insert/update/delete only objects whose first path segment is their own `auth.uid()`. |
| `20261020100400_cleanup.sql` | `public.expired_documents()` and `public.purge_expired_documents(uuid[])` for the cleanup workflow (service role only). |

## Interfaces for other owners

**Cleanup workflow** (service role only; `execute` is revoked from `public`, `anon` and `authenticated`):

- `public.expired_documents()` returns `table (id uuid, user_id uuid, storage_path text)`: documents with
  `expires_at < now()`. REST: `POST {SUPABASE_URL}/rest/v1/rpc/expired_documents` with body `{}`.
- Then delete each `storage_path` from the `documents` bucket through the Storage API (objects first), then call
  `public.purge_expired_documents(document_ids uuid[]) returns integer`, which deletes only rows that are still
  expired and returns how many were deleted. REST: `POST {SUPABASE_URL}/rest/v1/rpc/purge_expired_documents` with body
  `{"document_ids": ["<uuid>", ...]}`. Applications keep `cv_label`; their `cv_document_id` / `letter_document_id`
  become `null`.
- Headers for both: `apikey` and `Authorization: Bearer <SERVICE_ROLE_KEY>` (GitHub secret, never logged).

**Scraper ingest** (service role): insert-or-ignore, so existing user edits are never overwritten:
`POST /rest/v1/jobs?on_conflict=user_id,id` with `Prefer: resolution=ignore-duplicates`. Required columns: `user_id`,
`id`, `title`, `company`, `source`; everything else has the contract defaults.

**Admin bootstrap**: the first admin is `app_metadata.role = 'admin'` set through the Auth admin API,
`PUT {SUPABASE_URL}/auth/v1/admin/users/{id}` with `{"app_metadata": {"role": "admin"}}` (look the id up with
`GET /auth/v1/admin/users`); `app_metadata` is merged.

**Edge Function `admin-users`**: `POST {SUPABASE_URL}/functions/v1/admin-users`, headers `Authorization: Bearer <user
access token>` and `apikey: <anon key>`, JSON body per `AdminAction` in `src/api/types.ts`:
`listUsers`, `createUser {email, tempPassword?, role}`, `setRole {id, role}`, `setBanned {id, banned}`,
`deleteUser {id}`, `deleteSelf`. Answers `{ok:true,data}` / `{ok:false,error:{code,message}}` with HTTP 200 / 400 / 401 /
403 / 404 / 409 / 500 (`validation` / `unauthenticated` / `forbidden` / `not_found` / `conflict` / `unknown`).

**Error mapping for the API layer**: the template cap surfaces from PostgREST as HTTP 400 with `code: "P0001"` and
`message: "template_limit"` (match the message); unique violations are `23505` (`conflict`); RLS violations are `42501`
(`forbidden`); check violations are `23514` (`validation`). Generate the document id client-side and upload to
`{user_id}/{document_id}/{filename}`; insert the `documents` row first so a rejected 4th template leaves no orphan
object.

## Tests

`npm run test:db` runs the SQL tests with [PGlite](https://pglite.dev) (Postgres in WASM, no Docker). `tests/stub.sql`
creates the Supabase roles (`anon`, `authenticated`, `service_role` with `bypassrls`), `auth.users`, `auth.uid()`
(reads `request.jwt.claim.sub`) and `storage.buckets` / `storage.objects` / `storage.foldername()`; the real migrations
then run on top. They prove, per table, that user A cannot select, insert, update, delete or hand over user B's rows
and that anon sees nothing, plus the template cap, expiry derivation, column checks, cascades, `updated_at`, the
cleanup functions and the storage path policies. SQL is not measured by coverage.

The Edge Function logic is covered at 100 % by the normal `npm run test:coverage` (`handler.test.ts`, with an in-memory
fake of the service-role client in `functions/admin-users/__fixtures__/`).

PGlite stands in for Supabase's Postgres 17 and its own storage/auth schemas; the final proof is `npx supabase start`
(needs Docker) followed by `npx supabase db reset`, which applies the same migrations on the real images.
