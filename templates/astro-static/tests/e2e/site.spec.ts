import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Pages checked on every run; add the site's important pages here.
const pages = ['/'];

for (const path of pages) {
  test(`${path}: accessible, no overflow, no CSP violation`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content.Security.Policy/i.test(message.text())) violations.push(message.text());
    });
    // Third-party requests never leave the test machine.
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toBeTruthy();
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(violations).toEqual([]);
  });
}

test('unknown paths return the 404 page with status 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toBeVisible();
});
