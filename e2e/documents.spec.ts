import { expect, test } from '@playwright/test';
import { USER_EMAIL, openSection, pdfFile, signIn } from './support';

// The mock user already owns one template; the limit is 3 per user.
const FIRST_NEW_TEMPLATE = 'e2e-template-one.pdf';
const SECOND_NEW_TEMPLATE = 'e2e-template-two.pdf';

test.beforeEach(async ({ page }) => {
  await signIn(page, USER_EMAIL);
  await openSection(page, 'Documents');
});

test('templates are limited to three: the fourth is refused', async ({ page }) => {
  const upload = page.getByRole('form', { name: 'Upload a document' });
  const submit = upload.getByRole('button', { name: 'Upload' });
  await expect(upload.getByText('Templates: 1/3')).toBeVisible();

  await upload.getByLabel('Type').selectOption({ label: 'Template' });
  for (const [index, name] of [FIRST_NEW_TEMPLATE, SECOND_NEW_TEMPLATE].entries()) {
    await upload.getByLabel(/^File/).setInputFiles(pdfFile(name));
    await submit.click();
    await expect(page.getByText(`Uploaded ${name}.`)).toBeVisible();
    await expect(upload.getByText(`Templates: ${index + 2}/3`)).toBeVisible();
  }

  await expect(upload.getByText(/You have 3 templates/)).toBeVisible();
  await expect(submit).toBeDisabled();
});

test('a CV is accepted but a file of another type is rejected', async ({ page }) => {
  const upload = page.getByRole('form', { name: 'Upload a document' });
  const submit = upload.getByRole('button', { name: 'Upload' });

  await upload.getByLabel(/^File/).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await submit.click();
  await expect(upload.getByRole('alert')).toBeVisible();

  await upload.getByLabel(/^File/).setInputFiles(pdfFile('e2e-cv.pdf'));
  await submit.click();
  await expect(page.getByText('Uploaded e2e-cv.pdf.')).toBeVisible();
});
