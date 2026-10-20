import { Link } from 'react-router-dom';
import { HOME_PATH } from './paths';

/** Shown instead of an admin-only page to a signed-in user without the admin role. */
export function ForbiddenScreen() {
  return (
    <section aria-labelledby="forbidden-title">
      <h1 id="forbidden-title">Not allowed</h1>
      <p role="alert">You need an admin account to open this page.</p>
      <p>
        <Link to={HOME_PATH}>Back to your jobs</Link>
      </p>
    </section>
  );
}
