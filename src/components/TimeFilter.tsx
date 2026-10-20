import { CUSTOM, TIME_PRESETS } from '../lib/timeFilter';
import type { TimeFilterValue } from '../lib/timeFilter';
import { ToggleChip } from './Chip';

interface TimeFilterProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
  /** What the filter applies to, e.g. "first seen" or "applied". */
  basis: string;
}

export function TimeFilter({ value, onChange, basis }: Readonly<TimeFilterProps>) {
  return (
    <fieldset className="time-filter">
      <legend>Time range ({basis})</legend>
      <div className="chip-row">
        {TIME_PRESETS.map((preset) => (
          <ToggleChip
            key={preset.range}
            pressed={value.range === preset.range}
            onToggle={() => onChange({ range: preset.range, from: '', to: '' })}
          >
            {preset.label}
          </ToggleChip>
        ))}
        <ToggleChip pressed={value.range === CUSTOM} onToggle={() => onChange({ ...value, range: CUSTOM })}>
          Custom
        </ToggleChip>
      </div>
      {value.range === CUSTOM ? (
        <div className="date-range">
          <label className="field">
            <span>From date</span>
            <input
              type="date"
              value={value.from}
              max={value.to === '' ? undefined : value.to}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
            />
          </label>
          <label className="field">
            <span>To date</span>
            <input
              type="date"
              value={value.to}
              min={value.from === '' ? undefined : value.from}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
