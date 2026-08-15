interface PublicRegistrationInput {
  readonly name?: unknown;
  readonly email?: unknown;
  readonly password?: unknown;
  readonly phone?: unknown;
}

interface PendingRegistrationChanges {
  name?: string;
  phone?: string;
}

export function normalizeRegistrationEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizeBrazilianPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  const ddd = Number(digits.slice(0, 2));
  if (![10, 11].includes(digits.length) || ddd < 11 || ddd > 99) {
    throw new Error('Informe um telefone brasileiro válido com DDD.');
  }
  if (digits.length === 11 && digits[2] !== '9') {
    throw new Error('Informe um celular brasileiro válido com DDD.');
  }
  return `+55${digits}`;
}

export function validatePublicRegistration(input: PublicRegistrationInput = {}) {
  const name = String(input.name || '').trim();
  const email = normalizeRegistrationEmail(input.email);
  const password = String(input.password || '');
  const phone = normalizeBrazilianPhone(input.phone);

  if (name.length < 3) throw new Error('Informe o nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (password.length < 8) throw new Error('A senha deve conter pelo menos 8 caracteres.');

  return { name, email, phone, password };
}

export function validatePendingRegistrationChanges(input: PublicRegistrationInput = {}) {
  const changes: PendingRegistrationChanges = {};
  if (input.name !== undefined) {
    changes.name = String(input.name || '').trim();
    if (changes.name.length < 3) throw new Error('Informe o nome completo.');
  }
  if (input.phone !== undefined) changes.phone = normalizeBrazilianPhone(input.phone);
  if (input.email !== undefined) throw new Error('O e-mail não pode ser alterado durante a aprovação.');
  if (changes.name === undefined && changes.phone === undefined) throw new Error('Informe nome ou telefone para atualizar.');
  return changes;
}
