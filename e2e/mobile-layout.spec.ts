import { expect, test, type Page } from '@playwright/test';

async function expectNoPageOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

async function expectMobileControlSizing(page: Page) {
  const controlSizes = await page.locator('input, select, textarea, .btn, .auth-link').evaluateAll(elements =>
    elements.filter(element => element.getClientRects().length > 0).map(element => ({
      tag: element.tagName,
      text: element.textContent?.trim() || element.getAttribute('aria-label') || '',
      height: element.getBoundingClientRect().height,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize)
    }))
  );

  for (const control of controlSizes) {
    expect(control.height, `${control.tag} "${control.text}" deve ter pelo menos 44px`).toBeGreaterThanOrEqual(44);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tag)) {
      expect(control.fontSize, `${control.tag} não deve causar zoom automático no iOS`).toBeGreaterThanOrEqual(16);
    }
  }
}

test.describe('layout mobile público', () => {
  test('login permanece utilizável entre 320px e 412px', async ({ page }) => {
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Escala de Transmissão' })).toBeVisible();
      await expectNoPageOverflow(page);
      await expectMobileControlSizing(page);
    }
  });

  test('cadastro e recuperação não criam rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });

    await page.goto('/cadastro');
    await expect(page.getByRole('heading', { name: 'Cadastro de voluntário' })).toBeVisible();
    await expectNoPageOverflow(page);
    await expectMobileControlSizing(page);

    await page.goto('/recuperar-senha');
    await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible();
    await expectNoPageOverflow(page);
    await expectMobileControlSizing(page);
  });
});
