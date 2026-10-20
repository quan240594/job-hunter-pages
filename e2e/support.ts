import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const USER_EMAIL = 'alex@example.com';
export const ADMIN_EMAIL = 'admin@example.com';
// The mock accepts any non-empty value; this is not a real credential.
export const DEMO_ENTRY = 'demo-entry-value';

export const PDF_MIME = 'application/pdf';

export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' });
}

function signInForm(page: Page): Locator {
  return page.getByRole('form', { name: 'Sign in' });
}

/** Fills and submits the sign-in form, opening the app first unless the form is already showing (keeps mock state). */
export async function submitSignIn(page: Page, email: string, entry = DEMO_ENTRY): Promise<void> {
  if (!(await signInForm(page).isVisible())) {
    await page.goto('./');
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(entry);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signIn(page: Page, email: string, entry = DEMO_ENTRY): Promise<void> {
  await submitSignIn(page, email, entry);
  await expect(mainNav(page)).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(signInForm(page)).toBeVisible();
}

/** Opens a section through the menu (client-side navigation keeps the in-memory mock state). */
export async function openSection(page: Page, name: string): Promise<void> {
  await mainNav(page).getByRole('link', { name, exact: true }).click();
}

/** Selects the option of a <select> whose visible text contains `text` (the UI wording around it may change). */
export async function selectOptionContaining(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  expect(value, `an option containing "${text}"`).not.toBeNull();
  await select.selectOption(value ?? '');
}

export function pdfFile(name: string) {
  return { name, mimeType: PDF_MIME, buffer: Buffer.from('%PDF-1.4\n%%EOF\n') };
}
