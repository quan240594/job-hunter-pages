export function ConfigErrorScreen({ message }: Readonly<{ message: string }>) {
  return (
    <main className="login">
      <h1>Configuration error</h1>
      <p role="alert">{message}</p>
      <p className="muted">This build is missing its backend settings. Ask the site owner to redeploy it.</p>
    </main>
  );
}
