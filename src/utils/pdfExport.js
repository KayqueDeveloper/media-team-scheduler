import html2pdf from 'html2pdf.js';

/**
 * Downloads the given element HTML as a formatted PDF file using html2pdf.js
 * @param {string} elementId HTML element ID to render into PDF
 * @param {string} filename Output PDF filename
 */
export const exportToPdf = async (elementId, filename = 'escala-transmissao.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id #${elementId} not found for PDF export.`);
    return false;
  }

  const opt = {
    margin: [10, 10, 10, 10],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(element).save();
    return true;
  } catch (err) {
    console.error('Error generating PDF with html2pdf:', err);
    // Fallback to browser print
    window.print();
    return false;
  }
};

/**
 * Formats schedule data into a clean WhatsApp text message for group sharing
 */
export const generateWhatsAppText = (schedule, volunteersMap, sundays, roles, monthLabel) => {
  let text = `*ESCALA DE TRANSMISSÃO - ${monthLabel.toUpperCase()}*\n`;
  text += `------------------------------------\n\n`;

  sundays.forEach(sunday => {
    text += `*DOMINGO ${sunday.formatted} (${sunday.label})*\n`;
    
    // Manhã
    text += `\n*Turno Manhã (09h00):*\n`;
    roles.forEach(role => {
      const volId = schedule[sunday.date]?.manha?.[role.id];
      const volName = volId ? (volunteersMap[volId]?.name || 'Não alocado') : 'Vago';
      text += `- ${role.name}: *${volName}*\n`;
    });

    // Noite
    text += `\n*Turno Noite (18h00):*\n`;
    roles.forEach(role => {
      const volId = schedule[sunday.date]?.noite?.[role.id];
      const volName = volId ? (volunteersMap[volId]?.name || 'Não alocado') : 'Vago';
      text += `- ${role.name}: *${volName}*\n`;
    });

    text += `\n------------------------------------\n`;
  });

  text += `\n_Favor verificar eventuais indisponibilidades e solicitar trocas com antecedência._`;
  return text;
};

/**
 * Opens WhatsApp web / app with formatted message ready to send
 */
export const shareToWhatsApp = (schedule, volunteersMap, sundays, roles, monthLabel) => {
  const text = generateWhatsAppText(schedule, volunteersMap, sundays, roles, monthLabel);
  const encodedText = encodeURIComponent(text);
  window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
};
