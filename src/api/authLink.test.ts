import type { SupabaseClient } from '@supabase/supabase-js';
import { browserAuthLinkEnv, consumeAuthLink } from './authLink';

function fakeClient() {
  const verifyOtp = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  return { client: { auth: { verifyOtp } } as unknown as Pick<SupabaseClient, 'auth'>, verifyOtp };
}

function envFor(href: string) {
  const replace = vi.fn();
  return { env: { href: () => href, replace }, replace };
}

describe('consumeAuthLink', () => {
  it.each(['invite', 'recovery'])('verifies a %s link and strips the token from the query, keeping the route', async (type) => {
    const { client, verifyOtp } = fakeClient();
    const { env, replace } = envFor(`https://user.github.io/job-hunter-pages/?token_hash=abc123&type=${type}&keep=1#/account`);
    await consumeAuthLink(client, env);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type });
    expect(replace).toHaveBeenCalledWith('https://user.github.io/job-hunter-pages/?keep=1#/account');
  });

  it.each([
    'https://user.github.io/job-hunter-pages/#/login',
    'https://user.github.io/job-hunter-pages/?token_hash=abc&type=magiclink',
    'https://user.github.io/job-hunter-pages/?token_hash=abc',
    'https://user.github.io/job-hunter-pages/?type=invite',
  ])('ignores %s', async (href) => {
    const { client, verifyOtp } = fakeClient();
    const { env, replace } = envFor(href);
    await consumeAuthLink(client, env);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('still strips the token when the verification fails', async () => {
    const { client, verifyOtp } = fakeClient();
    verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: 'expired' } as never });
    const { env, replace } = envFor('https://user.github.io/?token_hash=old&type=invite');
    await consumeAuthLink(client, env);
    expect(replace).toHaveBeenCalledWith('https://user.github.io/');
  });
});

describe('browserAuthLinkEnv', () => {
  it('reads and rewrites the window location', () => {
    window.history.replaceState(null, '', '/?token_hash=h&type=invite#/x');
    expect(browserAuthLinkEnv.href()).toContain('token_hash=h');
    browserAuthLinkEnv.replace(`${window.location.origin}/#/x`);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/x');
  });
});
