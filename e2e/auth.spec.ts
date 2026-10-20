import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, USER_EMAIL, mainNav, openSection, signIn, signOut } from './support';

const SECTIONS = ['New', 'Found', 'Applied', 'Profile', 'Documents', 'Account'];

test.describe('sign-in', () => {
  test('shows the sign-in form and offers no registration', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Job Hunter' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|register|create account/i })).toHaveCount(0);
  });

  test('sends a signed-out visitor of a deep link to the sign-in form', async ({ page }) => {
    await page.goto('./#/documents');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible();
  });

  test('requires an email and a password', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Email').fill(USER_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(mainNav(page)).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible();
  });

  test('a normal user sees every section except Admin, and can sign out', async ({ page }) => {
    await signIn(page, USER_EMAIL);
    for (const section of SECTIONS) {
      await expect(mainNav(page).getByRole('link', { name: section, exact: true })).toBeVisible();
    }
    await expect(mainNav(page).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

    await signOut(page);
    await expect(mainNav(page)).toHaveCount(0);
  });

  test('every section opens from the menu', async ({ page }) => {
    await signIn(page, USER_EMAIL);
    for (const section of SECTIONS) {
      await openSection(page, section);
      await expect(page).toHaveURL(new RegExp(`#/${section.toLowerCase()}$`));
      await expect(page.getByRole('main')).toBeVisible();
    }
  });
});

test.describe('role', () => {
  test('an admin also gets the Admin section', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await openSection(page, 'Admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Users' })).toBeVisible();
  });
});
