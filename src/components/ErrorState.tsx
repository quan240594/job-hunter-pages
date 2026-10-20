export function ErrorState({
  message,
  onRetry,
  title = 'Something went wrong',
}: Readonly<{ message: string; onRetry?: () => void; title?: string }>) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{title}</p>
      <p className="state-hint">{message}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
