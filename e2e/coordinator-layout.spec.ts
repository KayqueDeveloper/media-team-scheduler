import { expect, test } from '@playwright/test';

test('coordenador abre cobertura para vários elegíveis no celular', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/e2e/fixtures/coordinator-mobile.html');

  await expect(page.getByText('Preparação dos cultos')).toBeVisible();
  await page.getByRole('button', { name: 'Buscar cobertura' }).click();
  await expect(page.getByText('Convide até 5 voluntários elegíveis')).toBeVisible();

  await page.getByText('Candidata N3').click();
  await page.getByText('Candidato N2').click();
  await page.getByRole('button', { name: 'Enviar 2 convite(s)' }).click();

  await expect(page.getByText('Convide até 5 voluntários elegíveis')).toBeHidden();
  const request = await page.evaluate(() => JSON.parse(document.body.dataset.coverageRequest || '{}'));
  expect(request).toEqual({
    assignmentId: 10,
    reason: 'Não respondeu às tentativas de contato.',
    candidateIds: ['30', '31']
  });
  const viewport = await page.locator('body').evaluate((body) => ({
    clientWidth: body.clientWidth,
    scrollWidth: body.scrollWidth
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
});
