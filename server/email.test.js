import assert from 'node:assert/strict';
import test from 'node:test';

import { createSmtpEmailSender } from './email.js';

test('SMTP sender uses the Gmail account and removes spaces from the app password', async () => {
  const messages = [];
  let transportOptions;
  const sender = createSmtpEmailSender({
    user: 'sender@gmail.com',
    password: 'abcd efgh ijkl mnop',
    from: 'Equipe <sender@gmail.com>',
    publicAppUrl: 'https://escala.test',
    transportFactory(options) {
      transportOptions = options;
      return {
        async sendMail(message) {
          messages.push(message);
          return { messageId: 'smtp-message-1' };
        }
      };
    }
  });

  const delivery = await sender.sendServiceConfirmation({
    to: 'volunteer@example.org',
    volunteerName: 'Ana',
    date: '2026-08-16',
    shift: 'MORNING',
    role: 'VMIX',
    confirmationUrl: 'https://escala.test/confirmar-presenca?token=test'
  });

  assert.equal(delivery.id, 'smtp-message-1');
  assert.equal(transportOptions.auth.pass, 'abcdefghijklmnop');
  assert.equal(transportOptions.secure, true);
  assert.equal(messages[0].from, 'Equipe <sender@gmail.com>');
  assert.deepEqual(messages[0].to, ['volunteer@example.org']);
  assert.match(messages[0].subject, /Confirme sua presença/);
  assert.match(messages[0].html, /confirmar-presenca/);
});
