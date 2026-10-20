import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDataApi } from './api';
import { loadConfig } from './config';
import type { RawEnv } from './config';
import { ConfigErrorScreen } from './pages/ConfigErrorScreen';

/** Validates the config, then renders either the error screen or the app. Never leaves the page blank. */
export async function bootstrap(container: HTMLElement | null, env: RawEnv): Promise<void> {
  if (container === null) throw new Error('Missing #root element');
  const root = createRoot(container);
  const result = loadConfig(env);
  if (!result.ok) {
    root.render(<ConfigErrorScreen message={result.error} />);
    return;
  }
  try {
    root.render(<App api={await createDataApi(result.config)} />);
  } catch (error) {
    root.render(<ConfigErrorScreen message={`The app could not start: ${(error as Error).message}`} />);
  }
}
