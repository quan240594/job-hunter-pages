export function Spinner({ label }: Readonly<{ label: string }>) {
  return (
    <output className="spinner-row">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </output>
  );
}
