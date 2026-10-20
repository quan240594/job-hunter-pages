import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/errors';

/** Runs one async action at a time, exposing a busy flag and the message of the last failure. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (error_) {
      setError(errorMessage(error_));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}
