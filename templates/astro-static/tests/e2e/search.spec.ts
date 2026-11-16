import { expect, test } from '@playwright/test';

// Feature "search": the Pagefind index is built by `npm run build`.
test('search finds the home page', async ({ page }) => {
  await page.goto('/search?q=accueil');
  await expect(page.locator('#search-status')).toContainText('résultat');
  const response = await page.goto('/search?q=contenu');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#search-results a').first()).toBeVisible();
});
