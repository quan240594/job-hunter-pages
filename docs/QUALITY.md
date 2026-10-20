# Quality standard

The app must stay at the "perfect" SonarCloud standard. Quality is a hard gate, not a nice-to-have: a change is not
done until it passes everything below. Every owner (UI, mock API, Supabase API, edge function, SQL) follows this file.

## 1. Target standard

| Area | Target |
| --- | --- |
| Quality gate | Sonar way: **OK** |
| Ratings | Reliability **A**, Security **A**, Maintainability **A** |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Code smells | 0 |
| Security hotspots | every hotspot **reviewed** (0 "to review") |
| Duplication | < 3 %, aiming for 0 % |
| Coverage | **100 %** on statements, branches, functions and lines, enforced by vitest (the run fails below it) |

SonarCloud project: `quan240594_job-hunter-pages` (organisation `quan240594`), configured in
[`../sonar-project.properties`](../sonar-project.properties). The repository and the Sonar project are public, so
analysis does not use the private-project lines-of-code quota.

## 2. Definition of Done (every change)

1. `npm run typecheck` is green.
2. `npm run lint` is green with **0 warnings**.
3. `npm run test:coverage` is green (100 % on all four metrics).
4. `npm run build` is green with the env of the real deployment (or `npm run build:mock` locally).

`npm run quality` runs 1-3 in one go. Never lower a threshold, add an `eslint-disable`, or widen a coverage exclusion
to get green. Fix the code or add tests.

## 3. Commands

| Command | What it does |
| --- | --- |
| `npm run quality` | typecheck + lint + test:coverage |
| `npm run build` / `npm run build:mock` | production build (supabase mode, needs env) / mock-mode build (no backend) |
| `scripts/sonar-scan.sh --coverage` | regenerates coverage, scans with `sonar-scanner`, fails if the quality gate fails |
| `scripts/sonar-status.sh` | prints gate, measures, open issues and hotspots from SonarCloud; exit 0 only if gate OK, 0 issues, 0 hotspots to review |
| `scripts/coverage.sh` | `npm run test:coverage` + `scripts/fix-lcov-paths.sh` |

Run npm with `npm_config_cache=$PWD/.npm-cache TMPDIR=$PWD/.tmp` so nothing is written outside the repo (both
directories are gitignored). `.npmrc` sets `omit-lockfile-registry-resolved=true` so `package-lock.json` never contains
a registry host name (no corporate mirror URLs in a public repo).

Tooling note: ESLint is pinned to v9 and TypeScript to 6.0.x. `typescript-eslint` needs the classic TypeScript API
(absent from TypeScript 7) and `eslint-plugin-jsx-a11y` does not support ESLint 10 yet. Revisit when both do.

## 4. Coding standard (Sonar-clean TypeScript/React)

ESLint (`sonarjs`, `typescript-eslint`, `react-hooks`, `jsx-a11y`) mirrors the main Sonar rules; the rules below cover
what the linter cannot see.

- Functions are small and do one thing. Cognitive complexity <= 15 (enforced as an error).
- No nested ternaries. Use early returns, lookup tables or small helpers.
- No duplicated string literals (3+ uses): extract a constant. No duplicated blocks: extract a function.
- No dead code, no commented-out code, no unused exports/imports/parameters (prefix intentionally unused ones with `_`).
- No `TODO`/`FIXME` left in the code. Track work in `CONTRACT-CHANGES.md` or the backlog instead.
- No `any` (use `unknown` and narrow). No non-null assertion (`!`) unless the invariant is guaranteed and commented;
  prefer a guard or `?? fallback`.
- React props are `Readonly<Props>`; other shared structures use `readonly` where they are never mutated.
- Prefer modern APIs: `Number.parseInt`/`Number.parseFloat`/`Number.isNaN`, `String#replaceAll`, `Array#at`,
  `structuredClone`, `Object.hasOwn`, optional chaining and `??`, `for...of` over index loops.
- Never call `Array#sort()` without a comparator and never mutate the input: use `toSorted((a, b) => ...)`.
- No `async` function without an `await`. No floating promises: `await` them, or return them, or explicitly `void`
  them with a handler for the failure. Every promise rejection is handled.
- No empty `catch` blocks: handle, log (without secrets) or rethrow with context.
- Imports of types use `import type` (`consistent-type-imports`); no `var`; `const` by default; `===` only.
- Every `DataApi` implementation rejects with an `ApiError` (`{code, message}`), never a bare `Error` or a raw
  Supabase error object. Map Supabase/network errors in one place.

## 5. Security rules (avoid Sonar vulnerabilities and hotspots)

- **Regular expressions** must be linear-time and bounded: no nested quantifiers or overlapping alternations, no
  unbounded `.*` between groups. Prefer string methods or a small parser. Regexes on untrusted text are the ReDoS
  hotspot S5852.
- **No `Math.random`** for anything. Use `crypto.randomUUID()` / `crypto.getRandomValues()` (inject them so tests stay
  hermetic).
- No `eval`, no `new Function`, no string arguments to `setTimeout`/`setInterval`.
- **No hard-coded credentials or tokens.** The Supabase URL and anon key come from the build environment
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), never from a committed file. The service-role key exists only as a
  GitHub Actions secret / Edge Function secret and never reaches the browser bundle or the repository. Tests use
  clearly fake placeholder values whose names do not look like secrets (no `password`, `secret`, `token`, `apiKey`
  variable names holding literal values).
- **`https://` URLs only**, except loopback (`127.0.0.1`, `localhost`).
- **No personal data in the repository** (it is public): no real names, emails, phone numbers, CVs or job data.
  Fixtures use the fictional "Alex Example" (`alex@example.com`).
- **Never log secrets** (tokens, keys, full request headers) or document contents.
- **Validate every input** at the boundary: file size (<= 10 MB) and mime (pdf/docx) before upload, edge-function
  request bodies before use, Supabase rows before they are trusted as typed data.
- **Privacy by RLS**: every table is protected by `user_id = auth.uid()`; the UI must never rely on client-side
  filtering for isolation. Admins see account metadata only (through the edge function), never other users' rows.
- HTML: rely on React escaping; never use `dangerouslySetInnerHTML`. Links to user-supplied URLs use
  `rel="noopener noreferrer"` and must be `http(s)` only.
- Signed URLs for documents live 60 seconds; never store or log them.

## 6. Testing standard

- Tests live next to the code as `*.test.ts` / `*.test.tsx`; fixtures live under `src/**/__fixtures__/`.
- Tests are hermetic: no network, no real clock, no real randomness. Inject clock, random and fetch; use fake timers.
  The Supabase client is injected or mocked; no test talks to a real project.
- Cover branches and error paths, not just the happy path. 100 % is the floor.
- React tests use Testing Library and query by role/label (`getByRole`, `getByLabelText`), then `user-event`.
- Test code is held to the same lint rules (only the duplicate-literal rule is relaxed, as in Sonar).

## 7. Coverage exclusion policy

Only thin entry points containing wiring (<= 30 lines, no logic), pure type declarations and test helpers may be
excluded. Currently:

- `src/main.tsx`, `src/vite-env.d.ts`, `src/test-setup.ts`
- everywhere: test files and `__fixtures__` (vitest: `**/*.test.*` and `**/__fixtures__/**` under `src/`, `scripts/`,
  `supabase/functions/`; Sonar: `sonar.test.inclusions` and `**/__fixtures__/**`)
- `scripts/*.ts` and `scripts/admin/*.ts`: command-line entry points that only wire arguments to the tested modules in
  deeper folders
- `supabase/functions/**/index.ts`: the Edge Function entry point (`Deno.serve` wiring); the logic is in `handler.ts`
- `supabase/tests/**`: SQL tests, run by `npm run test:db`; not part of the vitest coverage `include`, excluded from the
  Sonar coverage measure
- `e2e/`: Playwright specs run by `npm run test:e2e`; not in the Sonar sources nor the coverage `include`

`src/api/mockApi.ts` and `src/api/supabaseApi.ts` (with their helper modules) are real implementations covered at
100 %; there is no stub exclusion any more.

`src/api/types.ts` and `src/api/dataApi.ts` are interface-only and compile to nothing, so they report no executable
lines and need no exclusion.

The exclusion lists live in `vite.config.ts` (`coverage.exclude`, with `coverage.include` for what is measured) and
`sonar.coverage.exclusions` in `sonar-project.properties`. They must describe the same set of files. If an entry point
grows logic, move the logic into a tested module.

`src/api/types.ts` carries one scoped Sonar suppression (`typescript:S6564`, the documentary `ISODateTime` alias) in
`sonar.issue.ignore.multicriteria` and `eslint.config.js`. Do not add further suppressions.

## 8. First-time SonarCloud setup (owner)

1. In SonarCloud, organisation `quan240594`: import the GitHub repo, project key `quan240594_job-hunter-pages`
   (matches `sonar-project.properties`). Turn **Automatic Analysis off** (Administration > Analysis Method) so the CI
   analysis with coverage is used.
2. Create a SonarCloud token (My Account > Security) and add it as the repo secret, typed locally so it never appears
   in chat or logs: `gh secret set SONAR_TOKEN`.
3. Create `.env.sonar.local` at the repo root containing `SONAR_TOKEN=...` and `chmod 600 .env.sonar.local`
   (gitignored; the setup one-liner is at the top of `scripts/sonar-scan.sh`).
4. Enable the pre-push hook: `git config core.hooksPath .githooks`. It runs typecheck, lint, coverage and a scan on a
   clean tree. Emergency bypass: `SKIP_SONAR=1 git push`.
5. Install the scanner: `brew install sonar-scanner`.
