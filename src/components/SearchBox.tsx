import { useEffect, useState } from 'react';
import { useLatest } from '../hooks/useLatest';

export const DEBOUNCE_MS = 300;

interface SearchBoxProps {
  value: string;
  onCommit: (value: string) => void;
}

/** Text search that reports the typed value once typing paused for a moment. */
export function SearchBox({ value, onCommit }: Readonly<SearchBoxProps>) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const commitRef = useLatest(onCommit);

  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return undefined;
    const timer = setTimeout(() => commitRef.current(draft), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value, commitRef]);

  return (
    <label className="field field-grow">
      <span>Search</span>
      <input type="search" value={draft} placeholder="Company, title or place" onChange={(event) => setDraft(event.target.value)} />
    </label>
  );
}
