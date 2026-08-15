// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import { closeDatabase, getDatabase } from '../db/index.js';
import { createSmtpEmailSender } from '../email.js';
import { createServiceConfirmationModule } from '../serviceConfirmations.js';

async function main() {
  const db = getDatabase();
  await db.ready;
  const emailSender = createSmtpEmailSender();
  if (!emailSender) throw new Error('Configure Gmail SMTP antes de executar os lembretes.');
  const confirmations = createServiceConfirmationModule({
    db,
    emailSender,
    publicAppUrl: process.env.PUBLIC_APP_URL,
    timeZone: process.env.APP_TIME_ZONE || 'America/Sao_Paulo',
    tokenSecret: process.env.CONFIRMATION_TOKEN_SECRET
  });
  const result = await confirmations.dispatchDueReminders();
  console.log(JSON.stringify(result));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
