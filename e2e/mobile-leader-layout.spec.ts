import { expect, test } from '@playwright/test';

test.describe('layout mobile do painel do líder', () => {
  test('mantém o formulário de voluntário dentro da viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html');

    await page.getByRole('button', { name: 'Novo Voluntário' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cadastrar Novo Voluntário' });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);

    const nameInput = page.getByPlaceholder('Ex: João da Silva');
    await nameInput.fill('Novo voluntário');
    await expect(nameInput).toBeFocused();
  });

  test('não sobrepõe o nome da função e o nível de proficiência', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html?scenario=schedule');

    const roleName = page.getByText('FREEHAND', { exact: true }).first();
    const proficiency = page.getByText('Op N2', { exact: true }).first();
    const roleBox = await roleName.boundingBox();
    const proficiencyBox = await proficiency.boundingBox();

    expect(roleBox).not.toBeNull();
    expect(proficiencyBox).not.toBeNull();
    expect(roleBox!.x + roleBox!.width + 8).toBeLessThanOrEqual(proficiencyBox!.x);
  });

  test('mostra uma prévia legível sem expor o documento A4 largo', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html?scenario=pdf');

    const mobilePreview = page.getByRole('region', { name: 'Prévia mobile da escala' });
    await expect(mobilePreview).toBeVisible();

    const previewSizes = await mobilePreview.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(previewSizes.scrollWidth).toBeLessThanOrEqual(previewSizes.clientWidth);
    await expect(page.locator('#pdf-printable-document')).not.toBeInViewport();
  });

  test('mantém as ações acessíveis em um cabeçalho compacto', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html?scenario=header');

    await expect(page.getByText('Ações', { exact: true })).toBeVisible();
    const headerBox = await page.getByRole('banner').boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.height).toBeLessThanOrEqual(330);

    const statusSizes = await page
      .getByRole('button', { name: 'Publicada · Reabrir' })
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth
      }));
    expect(statusSizes.scrollWidth).toBeLessThanOrEqual(statusSizes.clientWidth);
    const statusIcon = await page
      .getByRole('button', { name: 'Publicada · Reabrir' })
      .locator('svg')
      .boundingBox();
    expect(statusIcon).not.toBeNull();
    expect(statusIcon!.width).toBeGreaterThanOrEqual(14);
  });

  test('recolhe os controles detalhados dos voluntários até serem solicitados', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html');

    const toggle = page.getByRole('button', { name: 'Mostrar detalhes de Voluntário de teste 01' });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole('button', { name: 'N1' }).first()).toBeHidden();

    await toggle.click();

    await expect(page.getByRole('button', { name: 'N1' }).first()).toBeVisible();
  });

  test('apresenta datas, turnos e funções sem códigos internos', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/e2e/fixtures/leader-mobile.html?scenario=labels');

    await expect(page.getByText('16/08/2026 · Manhã · Câmera Fixa')).toBeVisible();
    await expect(page.getByText('16/08/2026 · Manhã ↔ 30/08/2026 · Noite')).toBeVisible();
    await expect(page.getByText(/FIXED_CAM|MORNING|NIGHT/)).toHaveCount(0);
  });
});
