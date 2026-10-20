# Auth and admin flows

How sign-in, forced password change, account self-service and user administration work in the UI. The API shapes are
in [`CONTRACT.md`](CONTRACT.md); this file only describes what the screens do with them.

## Pieces

| Piece | File | Job |
| --- | --- | --- |
| `AuthProvider` / `useAuth` | `src/auth/AuthProvider.tsx`, `context.ts` | Loads the `Session` (`getSession`), subscribes to `onAuthChange` (unsubscribes on unmount), exposes `state` (`loading`, `anonymous`, `authenticated`, `error`), `signIn`, `signOut` and `refresh` (re-reads the session; never rejects). `useSession()` returns the session on guarded screens. |
| `RouteGuard` | `src/auth/RouteGuard.tsx` | Decides what a route renders (see below). |
| `describeError` | `src/auth/apiError.ts` | The one place that maps `ApiError.code` to friendly text. Raw server messages are never shown. Screens pass per-code overrides. |
| `PasswordForm` | `src/auth/PasswordForm.tsx` | Change-password form shared by `/change-password` and `/account`. |
| `TypedConfirmDialog` | `src/auth/TypedConfirmDialog.tsx` | Native `<dialog>` (`showModal()`); the destructive button unlocks after typing a phrase. |

The role comes from `Session.role` (the JWT claim `app_metadata.role`); the UI never decides roles by itself, and the
backend re-checks every admin call.

## Route guard

Checked in this order:

1. `loading` -> status "Loading..."; `error` (session check failed) -> alert with friendly text.
2. Anonymous -> `/login`, remembering where the visitor was heading (`state.from`).
3. `mustChangePassword` -> `/change-password` before anything else (also keeps `from`). Only `/change-password` is
   reachable until the flag is cleared.
4. `requireAdmin` and role `user` -> the **forbidden screen** (not a redirect), with a link home.

`/login` and `/change-password` render outside the nav shell. Everything else is inside it.

## Sign in (`/login`)

- Email + password; invite-only: no registration link, the page says accounts are created by an admin.
- After sign-in the user goes back to `state.from` (only plain in-app paths are accepted, see `returnPathFrom`), else
  `/new`. A signed-in visitor is redirected away from `/login`.
- All credential problems (`unauthenticated`, `forbidden`, `not_found`, `validation`, `conflict`) show the **same**
  sentence, so the page cannot be used to find out which emails have accounts or are banned. `network` and unexpected
  errors stay honest ("Cannot reach the server", "Something went wrong").
- Forgot password: ask an admin to set a temporary password (the contract exposes no recovery email flow).

## Forced password change (`/change-password`)

Shown when an admin created the account (temporary password or invite). The user must pick a password (minimum 12
characters, confirmation, strength hints), then `refresh()` re-reads the session (the flag is cleared by
`changePassword`) and the user continues to the page they wanted. A "Sign out" button is the only other way out.
A user who does not need it is sent to `/account`.

## Account (`/account`)

- Shows email and role.
- Change password: same form and rules as above.
- **Export my data**: `exportMyData()` returns a JSON Blob, saved as `job-hunter-export-YYYY-MM-DD.json`.
- **Delete my account and all my data**: opens a dialog; the user must type `DELETE`. Then `deleteMyAccount()` and
  `signOut()` (if sign-out fails, the session is re-read, which is anonymous). The last-admin guard (`forbidden`) is
  shown as "you are the last admin".

## Admin (`/admin`, admins only)

- Privacy note: admins manage accounts only and cannot see other users' jobs, CVs, letters or applications.
- Users table from `admin.listUsers()`: email, role, created, last sign-in, status (active/banned).
- **Create user**: email, role and how the person gets access. Default (recommended): **temporary password**, pre-filled
  with a random 20-character one ("Generate new password" makes another; min. 12 characters). The account is created with
  `must_change_password`, and the password is shown **once** with a copy button ("Hide password" removes it). Secondary
  option: **send invite email**, with the visible note "Requires custom SMTP to be configured; otherwise use a temporary
  password" (on the free Supabase tier with the default email provider, invites are rate-limited and may not be delivered).
- Row actions: promote/demote, ban/unban, delete (typed confirmation: the user's email). The admin's own row has no
  actions. The backend answers both guards (own account, last admin) with `forbidden`; the UI shows one sentence that
  explains both.
- No optimistic updates: after every action (successful or not) the list is refetched.

## Testing notes

- Tests use `createFakeApi` plus `src/__fixtures__/adminFake.ts` (in-memory `admin` API with the contract's guards) and
  `renderApp` (real route table + location probe). `installDialogPolyfill()` gives jsdom the `<dialog>` methods.
- Accessibility is asserted with roles and accessible names/descriptions (labels, `role="alert"` errors tied to inputs
  via `aria-describedby`, focus moved to the invalid field, focus in the dialog's input).
