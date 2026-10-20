import { expect, test } from '@playwright/test';
import { USER_EMAIL, openSection, signIn } from './support';

const SENIOR_BACKEND = 'Senior Backend Engineer';
const CV_FILE = 'alex-cv-java.pdf';

test.beforeEach(async ({ page }) => {
  await signIn(page, USER_EMAIL);
});

test('New lists the jobs waiting for a decision', async ({ page }) => {
  await openSection(page, 'New');
  await expect(page.getByRole('heading', { level: 1, name: 'New' })).toBeVisible();
  await expect(page.getByRole('article', { name: SENIOR_BACKEND })).toBeVisible();
});

test('Found lists every job', async ({ page }) => {
  await openSection(page, 'Found');
  await expect(page.getByRole('heading', { level: 1, name: 'Found' })).toBeVisible();
  await expect(page.getByRole('table').getByText(SENIOR_BACKEND)).toBeVisible();
});

test('Applied lists the applications', async ({ page }) => {
  await openSection(page, 'Applied');
  await expect(page.getByRole('heading', { level: 1, name: 'Applied' })).toBeVisible();
  await expect(page.getByRole('table').getByText('Dijk Data')).toBeVisible();
});

test('Profile shows the profile form', async ({ page }) => {
  await openSection(page, 'Profile');
  await expect(page.getByRole('heading', { name: /profile/i }).first()).toBeVisible();
});

test('Documents shows the uploaded documents and the built-in standard template', async ({ page }) => {
  await openSection(page, 'Documents');
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  await expect(page.getByText(CV_FILE).first()).toBeVisible();
  await expect(page.getByText('alex-base-cv.pdf').first()).toBeVisible();
  await expect(page.getByText(/standard cv template/i).first()).toBeVisible();
});

test('marking a job applied with a chosen CV moves it to Applied', async ({ page }) => {
  await openSection(page, 'New');
  const card = page.getByRole('article', { name: SENIOR_BACKEND });
  await card.getByRole('button', { name: 'Mark applied' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('CV used').selectOption({ label: CV_FILE });
  await dialog.getByRole('button', { name: 'Save application' }).click();

  await expect(page.getByText(`Marked ${SENIOR_BACKEND} at Polder Payments as applied.`)).toBeVisible();
  await expect(page.getByRole('article', { name: SENIOR_BACKEND })).toHaveCount(0);

  await openSection(page, 'Applied');
  const row = page.getByRole('row').filter({ hasText: 'Polder Payments' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(CV_FILE);
});
