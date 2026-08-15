import { expect, test } from '@playwright/test';

const awaiting = {
  id: 4,
  assignmentId: 7,
  volunteerId: 2,
  volunteerName: 'Ana',
  status: 'AWAITING',
  date: '2026-08-16',
  shift: 'MORNING',
  role: 'VMIX',
  isTrainee: false
};

const candidate = {
  assignmentId: 9,
  volunteerId: 3,
  volunteerName: 'Bia',
  date: '2026-08-23',
  shift: 'NIGHT',
  role: 'VMIX',
  isTrainee: false
};

test('voluntário confirma a presença sem informar motivo', async ({ page }) => {
  let status = 'AWAITING';
  await page.route('**/api/service-confirmations/test-token', (route) =>
    route.fulfill({
      json: {
        confirmation: { ...awaiting, status },
        candidates: status === 'AWAITING' ? [candidate] : []
      }
    })
  );
  await page.route('**/api/service-confirmations/test-token/confirm', (route) => {
    status = 'CONFIRMED';
    return route.fulfill({ json: { confirmation: { ...awaiting, status } } });
  });

  await page.goto('/confirmar-presenca?token=test-token');
  await expect(page.getByRole('heading', { name: 'Confirmação de serviço' })).toBeVisible();
  await expect(page.getByText('Manhã · VMIX')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar presença' }).click();
  await expect(page.getByText('Sua presença está confirmada.')).toBeVisible();
  await expect(page.getByLabel('Motivo')).toHaveCount(0);
});

test('troca exige motivo e envia a permuta de dia e turno escolhida', async ({ page }) => {
  let status = 'AWAITING';
  const requests: unknown[] = [];
  await page.route('**/api/service-confirmations/test-token', (route) =>
    route.fulfill({
      json: {
        confirmation: { ...awaiting, status },
        candidates: status === 'AWAITING' ? [candidate] : []
      }
    })
  );
  await page.route('**/api/service-confirmations/test-token/exchange', async (route) => {
    requests.push(route.request().postDataJSON());
    status = 'EXCHANGE_PENDING';
    return route.fulfill({
      status: 201,
      json: { exchange: { id: 11, status: 'PENDING', targetAssignmentId: 9 } }
    });
  });

  await page.goto('/confirmar-presenca?token=test-token');
  await page.getByRole('button', { name: 'Solicitar troca' }).click();
  await page.getByLabel('Trocar com').selectOption('9');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  expect(requests).toHaveLength(0);

  await page.getByLabel('Motivo').fill('Estarei viajando pela manhã.');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Sua solicitação de troca está aguardando resposta.')).toBeVisible();
  expect(requests).toEqual([{ targetAssignmentId: 9, reason: 'Estarei viajando pela manhã.' }]);
});
