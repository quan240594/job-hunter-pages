# Setup (one time)

Exact, CLI-first steps to take the repository from "empty GitHub repo" to a running site. Everything secret lives in
one **local, gitignored** file and reaches GitHub through `gh secret set`, so no key is ever typed into a chat, pasted
into a command line history or printed. The repository is **public**: never commit keys, and read the
[privacy notes](#privacy-in-a-public-repository) before using the admin workflows.

Contents: [Prerequisites](#0-prerequisites) · [GitHub repository](#1-github-repository) ·
[Supabase project](#2-supabase-project) · [Local env file and secrets](#3-local-env-file-and-repository-secrets) ·
[Database, function and auth config](#4-database-edge-function-and-auth-config) · [Pages](#5-github-pages) ·
[First admin](#6-first-user-and-admin-exact-order) · [Friends and family](#7-inviting-friends-and-family) ·
[Retention and cleanup](#8-retention-and-cleanup) · [SonarCloud](#9-sonarcloud-public-project) ·
[Operations](#10-operations-and-troubleshooting)

## 0. Prerequisites

- Node 24 (`node -v`), `gh` logged in (`gh auth status`), a Supabase account, a SonarCloud account.
- `npm ci --no-audit --no-fund` in the repo root. The Supabase CLI is a devDependency: always run it as `npx supabase`.
- Use npm with the cache inside the repo, like the quality scripts do:
  `export npm_config_cache="$PWD/.npm-cache" TMPDIR="$PWD/.tmp"`.

## 1. GitHub repository

```bash
gh repo create job-hunter-pages --public --source=. --remote=origin   # --push once you are ready to publish
```

The Pages URL is `https://<your-user>.github.io/job-hunter-pages/` (the Vite `base` and `supabase/config.toml`
`site_url` assume the repository is named `job-hunter-pages`; if your GitHub user differs from the one in
`supabase/config.toml`, edit `site_url` and `additional_redirect_urls` there first).

## 2. Supabase project

```bash
npx supabase login                      # opens the browser, stores the CLI token locally
npx supabase orgs list                  # note your organisation id
```

Create the local env file `.env.deploy.local` in the repo root (it is covered by `.gitignore`: `.env.*` and `*.local`)
and lock it down. Create it with your editor; the first line is all it needs for now:

```bash
chmod 600 .env.deploy.local
printf 'SUPABASE_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env.deploy.local   # generated, never printed
```

Create the project (region `eu-central-1` = Frankfurt, closest to the Netherlands; pick another with `--region`):

```bash
set -a; . ./.env.deploy.local; set +a
npx supabase projects create job-hunter-pages --org-id <ORG_ID> --region eu-central-1 \
  --db-password "$SUPABASE_DB_PASSWORD"
npx supabase projects list              # note the project reference (the REFERENCE ID column)
```

Back the database password up in your password manager: it cannot be read back later (it can be reset in the
dashboard under Project Settings → Database).

## 3. Local env file and repository secrets

Add the rest of the values to `.env.deploy.local` (one `NAME=value` per line, no quotes). The URL is
`https://<project-ref>.supabase.co`. Supabase keys: Dashboard → Project Settings → API (anon/publishable key and
service-role/secret key), or via the CLI without echoing them:

```bash
set -a; . ./.env.deploy.local; set +a   # only needed if the project ref is already in the file
REF=<project-ref>
printf 'SUPABASE_PROJECT_REF=%s\nVITE_SUPABASE_URL=https://%s.supabase.co\n' "$REF" "$REF" >> .env.deploy.local
npx supabase projects api-keys --project-ref "$REF" --reveal -o json | node -e '
  const keys = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  const pick = (name) => keys.find((k) => k.name === name)?.api_key ?? "";
  process.stdout.write(`VITE_SUPABASE_ANON_KEY=${pick("anon")}\nSUPABASE_SERVICE_ROLE_KEY=${pick("service_role")}\n`);
' >> .env.deploy.local
```

(If a key comes out empty because the field names differ, copy it from the dashboard with your editor instead.)
Two more values come from the browsers, again added with your editor:

| Name | Where it comes from |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens → Generate new token (used by CI to run the CLI) |
| `SONAR_TOKEN` | SonarCloud → My Account → Security → Generate token (see [section 9](#9-sonarcloud-public-project)) |

The file now defines exactly these seven names:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SONAR_TOKEN`. Upload them all at once; `gh` encrypts locally and
prints only the names:

```bash
gh secret set --env-file .env.deploy.local
gh secret list                          # names and dates only, never values
```

| Secret | Used by |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `deploy.yml` (build), and the URL by the admin/cleanup workflows. The anon key is public by design (RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | `cleanup.yml`, `set-admin-role.yml`, `invite-user.yml`. **Never** leaves GitHub secrets; bypasses RLS |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | `supabase-deploy.yml` |
| `SONAR_TOKEN` | `ci.yml` (SonarCloud analysis) |

Every workflow starts with a check that fails with one clear message naming the missing secret(s).

## 4. Database, Edge Function and auth config

First deployment of everything under `supabase/` (migrations, the `admin-users` Edge Function, and the auth config
such as invite-only sign-up and the redirect URLs). `config push` has no dry-run, so read `supabase/config.toml` first:

```bash
gh workflow run supabase-deploy.yml -f push_config=true
gh run watch                            # pick the run
```

Afterwards a push that touches `supabase/**` re-applies migrations and the function automatically; the auth config
is only pushed by a manual run with `push_config=true`.

## 5. GitHub Pages

Settings → Pages → Source: **GitHub Actions**, or from the CLI:

```bash
gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow
gh workflow run deploy.yml              # also runs on every push to main
```

The deploy builds in `supabase` mode with the URL and anon key from the secrets and publishes `dist/`.

## 6. First user and admin (exact order)

Role changes require the user to **exist** first, so the order is: invite, accept, then (only if needed) promote.

1. **Invite yourself as an admin** (the role is applied at invite time, so no extra step is needed):

   ```bash
   gh workflow run invite-user.yml -f email=<your address> -f role=admin
   ```

   Open the email, follow the link, choose your password (the app forces that at first login).
2. Sign in on the Pages URL; the **Admin** menu item is there. From now on create and manage users in the app.

Alternative (no email): Supabase Dashboard → Authentication → Users → Add user → *Create new user* with *Auto
Confirm*, then promote that existing account:

```bash
gh workflow run set-admin-role.yml -f email=<your address>
```

`set-admin-role.yml` fails with a clear message when the account does not exist yet. Sign out and in again (the role
is in the JWT).

## 7. Inviting friends and family

Sign-up is disabled; accounts are created by an admin. Two ways, both from the **Admin** page:

- **Invite email** (leave the temporary password empty): the person gets a link and chooses their own password.
- **Temporary password**: the page generates one, shown once; tell the person over a private channel. They must
  choose their own password at first login.

> **Email delivery.** Supabase's built-in email sender is meant for testing: it is rate-limited and (at the time of
> writing, verify in the current Supabase docs) only delivers to addresses of your organisation's team members. For
> real invitations configure a custom SMTP provider (Dashboard → Authentication → SMTP Settings), or use the
> temporary-password route, which needs no email at all.

The same actions exist as workflows (`invite-user.yml`, `set-admin-role.yml`) and as local commands. The invite
workflow only ever **invites by email** and never generates or prints a password.

Local alternative (the address never touches GitHub):

```bash
set -a; . ./.env.deploy.local; set +a
SUPABASE_URL="$VITE_SUPABASE_URL" TARGET_EMAIL=<address> TARGET_ROLE=user node scripts/admin/invite-user.ts
SUPABASE_URL="$VITE_SUPABASE_URL" TARGET_EMAIL=<address> node scripts/admin/set-admin-role.ts
```

### Privacy in a public repository

Workflow **run logs and the inputs of manual runs are public** when the repository is public. Therefore:

- the admin workflows mask the address in the log (`::add-mask::`) and print no identifier, but the input itself can
  still be visible in the run metadata: use a local command (above) or the Admin page for addresses you want to keep
  private;
- no workflow ever prints a password, key or token; scripts report counts and HTTP status codes only;
- never put a real name, address or CV in the repository, an issue or a workflow input.

## 8. Retention and cleanup

- CVs and cover letters **expire 6 months after upload**; templates never expire (max. 3 per user).
- `cleanup.yml` runs **Monday and Thursday at 03:23 UTC** (two runs a week so the free-tier project also sees regular
  traffic, see below) and on demand. It calls `public.expired_documents()` with the service role, removes the storage
  objects through the Storage API in batches of 100, and **only after that succeeded** deletes the matching `documents`
  rows. Applications are kept: they retain `cvLabel`, and the UI shows "document expired".
- It logs **counts only** (never paths or emails). Preview without deleting:

  ```bash
  gh workflow run cleanup.yml -f dry_run=true
  gh run watch
  ```

- If the storage removal fails, no rows are deleted and the next run retries.

## 9. SonarCloud (public project)

1. SonarCloud → organisation `quan240594` → *Analyze new project* → import `job-hunter-pages` (project key
   `quan240594_job-hunter-pages`, matching `sonar-project.properties`). The repository is public, so the project is public
   and free of the private lines-of-code quota.
2. Administration → Analysis Method → switch **Automatic Analysis off** (CI analyses with coverage).
3. Add `SONAR_TOKEN` to `.env.deploy.local` (My Account → Security) and upload it with
   `gh secret set --env-file .env.deploy.local`. For local scans also create `.env.sonar.local` (see
   `docs/QUALITY.md`).
4. Pushes and PRs then run `ci.yml`: typecheck, lint, 100 % coverage, mock build, Playwright e2e and the Sonar quality
   gate. Fork PRs skip Sonar because they get no secrets.

## 10. Operations and troubleshooting

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push, PR | typecheck, lint, unit tests (100 %), mock build, Playwright e2e, Sonar |
| `deploy.yml` | push to `main`, manual | build in supabase mode, publish to Pages |
| `supabase-deploy.yml` | push to `supabase/**`, manual | migrations, Edge Function, optional auth config |
| `cleanup.yml` | Mon/Thu cron, manual | remove expired documents (`dry_run` input) |
| `invite-user.yml` | manual | invite a user by email (role `user`/`admin`) |
| `set-admin-role.yml` | manual | grant `app_metadata.role = 'admin'` to an existing user |

- **Run the e2e tests locally**: `npm run test:e2e` builds the mock bundle, serves it under `/job-hunter-pages/` and
  drives your installed Google Chrome (no browser download). Port `4180`, override with `E2E_PORT`.
- **Project paused**: Supabase free projects pause after about a week without activity (verify in the current docs);
  resume it in the dashboard. The Mon/Thu cleanup traffic normally keeps it awake.
- **Scheduled workflows stop after 60 days without repository activity** on public repositories: GitHub disables the
  cron and emails you; re-enable it under Actions (any commit also resets the timer).
- **"Missing required configuration: ..."** in a run: the named secret is not set; repeat
  `gh secret set --env-file .env.deploy.local`.
- **Rotating a key**: change it in `.env.deploy.local`, run `gh secret set --env-file .env.deploy.local` again, then
  `gh workflow run deploy.yml` for the anon key (it is baked into the bundle).
