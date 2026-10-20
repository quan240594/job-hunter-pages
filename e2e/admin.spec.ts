import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, USER_EMAIL, mainNav, signIn, signOut, submitSignIn } from './support';

const NEW_USER_EMAIL = 'new.hire@example.com';
const TEMPORARY_ENTRY = 'temporary-entry-value';
const CHOSEN_ENTRY = 'a-much-longer-chosen-phrase';

test('a normal user is blocked from the Admin page', async ({ page }) => {
  await signIn(page, USER_EMAIL);
  await page.evaluate(() => {
    globalThis.location.hash = '#/admin';
  });
  await expect(page.getByRole('heading', { name: 'Not allowed' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Users' })).toHaveCount(0);
});

test('a user created with a temporary password must choose their own before continuing', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await mainNav(page).getByRole('link', { name: 'Admin', exact: true }).click();

  const form = page.getByRole('region', { name: 'Create a user' });
  await form.getByLabel('Email', { exact: true }).fill(NEW_USER_EMAIL);
  await form.getByLabel('Temporary password', { exact: true }).fill(TEMPORARY_ENTRY);
  await form.getByRole('button', { name: 'Create user with temporary password' }).click();
  await expect(page.getByText(/Account created for/)).toBeVisible();
  await signOut(page);

  await submitSignIn(page, NEW_USER_EMAIL, TEMPORARY_ENTRY);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(mainNav(page)).toHaveCount(0);

  await page.getByLabel('New password', { exact: true }).fill(CHOSEN_ENTRY);
  await page.getByLabel('Confirm new password').fill(CHOSEN_ENTRY);
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toHaveCount(0);
});

test('the create-user form defaults to a pre-filled temporary password and rejects a short one', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await mainNav(page).getByRole('link', { name: 'Admin', exact: true }).click();

  const form = page.getByRole('region', { name: 'Create a user' });
  await expect(form.getByRole('radio', { name: /temporary password \(recommended\)/i })).toBeChecked();
  const password = form.getByLabel('Temporary password', { exact: true });
  await expect(password).toHaveValue(/^.{20}$/);
  await form.getByRole('button', { name: 'Generate new password' }).click();
  await expect(password).toHaveValue(/^.{20}$/);

  await form.getByLabel('Email', { exact: true }).fill(NEW_USER_EMAIL);
  await password.fill('short');
  await form.getByRole('button', { name: 'Create user with temporary password' }).click();
  await expect(form.getByRole('alert')).toContainText('at least 12 characters');
});
