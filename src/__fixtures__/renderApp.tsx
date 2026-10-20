import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { DataApi } from '../api/dataApi';
import { AuthProvider } from '../auth/AuthProvider';
import type { FakeAdminApi } from './adminFake';

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
}

export const withAdmin = (api: DataApi, admin: FakeAdminApi): DataApi => ({ ...api, admin });

/** Renders the real route table (guards, layout, pages) at a path, with a probe that shows the current location. */
export function renderApp(path: string, api: DataApi) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider api={api}>
        <AppRoutes />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
}
