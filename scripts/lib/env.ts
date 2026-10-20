export type Env = Readonly<Record<string, string | undefined>>;

/** Returns the trimmed values, or throws naming (never printing the values of) the missing variables. */
export function requireEnv<N extends string>(env: Env, names: readonly N[]): Record<N, string> {
  const values = {} as Record<N, string>;
  const missing: string[] = [];
  for (const name of names) {
    const value = (env[name] ?? '').trim();
    if (value === '') {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}. Set the repository secret(s) / environment variable(s) with exactly these names (see docs/SETUP.md).`,
    );
  }
  return values;
}

export function parseBool(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').trim().toLowerCase());
}
