interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'url' | 'date';
  required?: boolean;
  placeholder?: string;
  /** Focus this field when the surrounding dialog opens. */
  dialogAutofocus?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  dialogAutofocus = false,
}: Readonly<TextFieldProps>) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        data-autofocus={dialogAutofocus ? '' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
}

export function TextAreaField({ label, value, onChange, rows = 3, hint }: Readonly<TextAreaFieldProps>) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} value={value} placeholder={hint} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: Readonly<SelectFieldProps<T>>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
