import type { ReactNode } from 'react';

interface RepeatableListProps<T extends { key: string }> {
  legend: string;
  /** Singular name used in accessible labels, e.g. "Experience". */
  itemLabel: string;
  items: readonly T[];
  addLabel: string;
  onAdd: () => void;
  onRemove: (key: string) => void;
  children: (item: T) => ReactNode;
}

/** A group of repeatable rows with add and remove buttons (experience, education, languages, links). */
export function RepeatableList<T extends { key: string }>({
  legend,
  itemLabel,
  items,
  addLabel,
  onAdd,
  onRemove,
  children,
}: Readonly<RepeatableListProps<T>>) {
  return (
    <fieldset className="repeatable">
      <legend>{legend}</legend>
      {items.map((item, position) => (
        <div key={item.key} role="group" aria-label={`${itemLabel} ${position + 1}`} className="repeat-item">
          {children(item)}
          <div>
            <button
              type="button"
              className="btn btn-small btn-danger"
              aria-label={`Remove ${itemLabel.toLowerCase()} ${position + 1}`}
              onClick={() => onRemove(item.key)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-small" onClick={onAdd}>
          {addLabel}
        </button>
      </div>
    </fieldset>
  );
}
