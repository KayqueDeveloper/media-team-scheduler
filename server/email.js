import nodemailer from 'nodemailer';

const SHIFT_LABELS = { MORNING: 'Manhã', NIGHT: 'Noite' };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function emailLayout(title, content, actionLabel, actionUrl) {
  return `<!doctype html>
  <html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;color:#111827">
    <table role="presentation" style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:28px;width:100%">
      <tr><td><h1 style="font-size:22px;margin:0 0 18px">${escapeHtml(title)}</h1>${content}
      ${actionUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(actionLabel)}</a></p>` : ''}
      <p style="font-size:12px;color:#6b7280">Equipe de Transmissão</p></td></tr>
    </table>
  </body></html>`;
}

function createEmailSender({ send, publicAppUrl }) {
  return {
    async sendServiceConfirmation(message) {
      const shift = SHIFT_LABELS[message.shift] || message.shift;
      const participation = message.isTrainee ? 'Treinando' : 'Principal';
      return send({
        to: [message.to],
        subject: `Confirme sua presença em ${message.date} (${shift})`,
        html: emailLayout(
          `Olá, ${message.volunteerName}`,
          `<p>Você está na escala de <strong>${escapeHtml(message.date)}</strong>, turno <strong>${escapeHtml(shift)}</strong>, na função <strong>${escapeHtml(message.role)}</strong> (${participation}).</p><p>Confirme sua presença. Caso não possa servir, solicite uma troca de dia/turno com outra pessoa.</p>`,
          'Responder à escala',
          message.confirmationUrl
        )
      }, message.idempotencyKey);
    },

    async sendExchangeRequest(message) {
      const actionUrl = `${publicAppUrl.replace(/\/$/, '')}/`;
      return send({
        to: [message.to],
        subject: `${message.requesterName} solicitou uma troca de escala`,
        html: emailLayout(
          `Olá, ${message.targetName}`,
          `<p><strong>${escapeHtml(message.requesterName)}</strong> quer trocar a escala de ${escapeHtml(message.sourceDate)} (${escapeHtml(SHIFT_LABELS[message.sourceShift] || message.sourceShift)}) pela sua escala de ${escapeHtml(message.targetDate)} (${escapeHtml(SHIFT_LABELS[message.targetShift] || message.targetShift)}).</p><p><strong>Motivo:</strong> ${escapeHtml(message.reason)}</p>`,
          'Analisar solicitação',
          actionUrl
        )
      }, message.idempotencyKey);
    }
  };
}

export function createSmtpEmailSender({
  host = process.env.SMTP_HOST || 'smtp.gmail.com',
  port = Number(process.env.SMTP_PORT || 465),
  user = process.env.SMTP_USER,
  password = process.env.SMTP_PASS,
  from = process.env.EMAIL_FROM || process.env.SMTP_USER,
  publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000',
  transport,
  transportFactory = nodemailer.createTransport
} = {}) {
  if (!user || !password || !from) return null;
  const mailTransport = transport || transportFactory({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password.replaceAll(' ', '') }
  });
  return createEmailSender({
    publicAppUrl,
    async send(payload) {
      const delivery = await mailTransport.sendMail({ from, ...payload });
      return { id: delivery.messageId || null };
    }
  });
}
