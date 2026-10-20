# Contract changes

Every change to `src/api/types.ts`, `src/api/dataApi.ts` or `docs/CONTRACT.md` is recorded here (newest first):
date, what changed, why, who must adapt. Owners never change the contract silently.

## 2026-10-20 - UI auth flows (UI-auth owner; no type/API change)

- The forced first-login password change lives on its own route `/change-password` (outside the nav shell), not on
  `/account`: while `Session.mustChangePassword` is true only that route is reachable. `/account` offers the same form
  afterwards. See `AUTH.md`.
- `/admin` for a role `'user'` renders a forbidden screen instead of redirecting home.
- The UI never shows raw `ApiError.message`; it maps `code` to text (`src/auth/apiError.ts`). Backends need no change.
- `AuthContextValue` gained `refresh()`; `useSession()` was added (UI-internal, not part of `DataApi`).

## 2026-10-20 - API implementations (API owner; no type/API change)

`mockApi.ts` and `supabaseApi.ts` are implemented; both stub coverage exclusions are gone. Clarifications, not
contract changes:

- Mock mode demo logins: `alex@example.com` (role `user`) and `admin@example.com` (role `admin`), each with any
  non-empty password. Users created through `admin.createUser` can sign in with any non-empty password and start with
  `mustChangePassword = true`. State is in memory only; a reload restores the seed (relative to the clock).
- `jobId()` (`src/api/jobId.ts`) is synchronous: a small SHA-1 implementation replaces `crypto.subtle` (async, and the
  ESLint `sonarjs/hashing` rule flags the Web Crypto call). It is tested against reference digests and produces the
  private tracker's ids.
- Uploads are rejected with `'validation'` also for empty files (the table has `size_bytes > 0`). The storage object
  key uses a sanitised file name (`[^A-Za-z0-9_.-]` becomes `_`); `DocumentMeta.filename` keeps the original name and
  `storagePath` is the sanitised key.
- `supabaseApi.documents.upload` inserts the row first (the trigger enforces the template cap and sets `expires_at`, so
  a rejected upload never transfers the file), then uploads the object; if the transfer fails the row is deleted again.
  `remove` deletes the object first, then the row.
- `applications.apply` is two writes (insert, then job status `'applied'`) with a compensating delete when the second
  fails; `remove` is delete + `status = 'new'` where the job was `'applied'`. A single RPC would make both atomic.
- Invite/recovery links are consumed in `auth.getSession()`: `?token_hash=...&type=invite|recovery` is verified once
  with `verifyOtp`, then removed from the query string (`DESIGN.md`, "Auth redirects and HashRouter").
- Foreign-key violations (an application pointing at a document that does not exist) map to `'validation'`; a missing
  job on `apply()` is `'not_found'`.

## Open follow-ups

- None. `src/api/notImplemented.ts` was deleted; `src/__fixtures__/fakeApi.ts` now has its own local "unavailable" base.

## 2026-10-20 - Initial contract (scaffold)

Resolved ambiguities in the brief (all documented in `CONTRACT.md`):

- `Session` type added (`userId`, `email`, `role`, `mustChangePassword`): `auth.getSession()` / `signIn()` return it.
- `Job` also carries `hybrid: HybridStatus` (ported with `hybridQuote`); `postedAt` / `hybridQuote` are optional and
  absent (not `null`) when unknown; `url` is `string | null`.
- `Fit` is `0 | 1 | 2 | 3 | 4 | 5`; 0 means "not scored" (manual entries). Manual job defaults: fit 0, category `'C'`,
  hybrid `'unclear'`, language `'unknown'`.
- The old server `Recommendation` object is not ported as a type: a recommendation is `Job.recommendedDocumentIds`.
- Manual job ids use the same frozen id scheme (sha1 of company|title|location) so a later ingest of the same job is a
  no-op; adding a duplicate rejects with `'conflict'`.
- `applications.apply()` also sets the job to `'applied'`; `applications.remove()` sets it back to `'new'`.
- `StandardTemplate` type added for `documents.standardTemplates()`.
- `ProfileInput` (= `Profile` without `userId`/`updatedAt`) is what `profile.save()` takes; `profile.get()` returns
  `null` before the first save.
- `createDataApi(config)` is async (lazy `import()` of the implementation) so a production bundle never loads the mock.
- `ApiError.code` is the union `ApiErrorCode`.
- `deleteMyAccount()` needs the service role, so the single `admin-users` function also serves `{action:'deleteSelf'}`
  for any authenticated user (the brief only listed admin actions). `AdminAction` has this extra variant.
- Invited users get `must_change_password = true` as well (no password exists until they choose one).
- Email links with HashRouter: see the "Auth redirects" decision in `DESIGN.md`.
