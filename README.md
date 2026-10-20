# Job Hunter Pages

A small, invite-only job-hunt tracker for friends and family. Keep track of jobs you found, the ones you applied
for, your CV profile and your documents. Every user sees **only their own data**.

It is a static React app (hosted on GitHub Pages) backed by [Supabase](https://supabase.com): Auth, Postgres with Row
Level Security, private file Storage and one Edge Function for user management. There is no public sign-up: an admin
invites you.

> Work in progress. The data layer and most pages are still being built; see `docs/DESIGN.md` for the plan.

## Run it locally without a backend (mock mode)

Requires Node 24.

```sh
npm ci
npm run dev:mock        # http://127.0.0.1:5173/job-hunter-pages/ with in-memory fake data
```

Mock data only ever uses the fictional person "Alex Example" (`alex@example.com`).

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (SonarJS, jsx-a11y), zero warnings allowed |
| `npm test` / `npm run test:coverage` | Vitest (100 % coverage enforced) |
| `npm run build` | Production build (needs the Supabase env below) |
| `npm run build:mock` | Build with `VITE_DATA_MODE=mock` (no backend) |
| `npm run preview` | Serve the built bundle |

## Configuration

Copy `.env.example` to `.env.local` and fill it in; never commit real values.

| Variable | Meaning |
| --- | --- |
| `VITE_DATA_MODE` | `mock` or `supabase` (default `supabase`) |
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | the public anon key (data is protected by Row Level Security) |

In `supabase` mode a missing URL or key shows a clear configuration-error screen.

## How deployment works (high level)

1. A GitHub Actions workflow builds the app with the Supabase URL and anon key injected from repository secrets and
   publishes it to GitHub Pages under `/job-hunter-pages/`. The app uses hash routes, so no server fallback is needed.
2. The database schema, security policies, storage bucket and the `admin-users` Edge Function live in `supabase/` and
   are applied with the Supabase CLI (`npx supabase ...`).
3. Sign-ups are disabled. The first admin is granted by a manually triggered workflow; admins then invite everyone
   else from the Admin page (invite email, or an account with a temporary password that must be changed at first
   login).
4. Uploaded CVs and letters expire after 6 months and are removed by a scheduled cleanup; up to three templates per
   user never expire.

No secrets are stored in this repository.

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md): architecture, decisions, phasing, hosting notes
- [`docs/CONTRACT.md`](docs/CONTRACT.md): the single source of truth for types, the API, the database and the edge function
- [`docs/QUALITY.md`](docs/QUALITY.md): quality gate and coding/security rules
- [`docs/CONTRACT-CHANGES.md`](docs/CONTRACT-CHANGES.md): log of contract changes

## License

No license has been chosen yet; all rights reserved until one is added.
