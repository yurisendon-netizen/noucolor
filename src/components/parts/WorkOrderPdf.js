import { jsPDF } from 'jspdf';
import moment from 'moment';

const NOUCOLOR_LOGO_URL = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const STATUS_LABELS = { pendiente: 'Pendiente', en_progreso: 'En Progreso', completado: 'Completado' };

async function loadImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateWorkOrderPdf(order) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 20;

  // --- Header ---
  const logoBase64 = await loadImageAsBase64(NOUCOLOR_LOGO_URL);
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', margin, y - 4, 28, 18); } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 26);
  doc.text('NOUCOLOR PRO', margin + 33, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(136, 136, 136);
  doc.text("Pintura i Decoracio - Principat d'Andorra", margin + 33, y + 11);

  // Right side - document title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(217, 119, 6);
  doc.text('PARTE DE TRABAJO', pageWidth - margin, y + 2, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(26, 26, 26);
  doc.text(moment(order.date).format('DD/MM/YYYY'), pageWidth - margin, y + 9, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 170, 170);
  doc.text(`Generat el ${moment().format('DD/MM/YYYY')}`, pageWidth - margin, y + 15, { align: 'right' });

  // Accent bar
  y += 22;
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y, pageWidth - margin * 2, 1.5, 'F');

  // --- Title ---
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(26, 26, 26);
  const titleLines = doc.splitTextToSize(order.title || 'Sense titol', pageWidth - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 4;

  // --- Details grid ---
  const details = [
    { label: 'Client', value: order.client_name || '-' },
    { label: 'Data', value: moment(order.date).format('DD/MM/YYYY') },
    { label: 'Empleat', value: order.assigned_name || '-' },
    { label: 'Encarregat d\'Obra', value: order.encargado_obra || '-' },
    { label: 'Prioritat', value: PRIORITY_LABELS[order.priority] || order.priority || '-' },
    { label: 'Estat', value: STATUS_LABELS[order.status] || order.status || '-' },
  ];

  const colWidth = (pageWidth - margin * 2) / 2;
  details.forEach((d, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * colWidth;
    const dy = y + row * 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text(d.label.toUpperCase(), x, dy);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 26, 26);
    doc.text(String(d.value), x, dy + 5);
  });
  y += Math.ceil(details.length / 2) * 15 + 4;

  // --- Description ---
  if (order.description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('DESCRIPCIO', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 51, 51);
    const lines = doc.splitTextToSize(order.description, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 6;
  }

  // --- Materials ---
  if (order.materials) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('MATERIALS', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 51, 51);
    const lines = doc.splitTextToSize(order.materials, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 6;
  }

  // --- Notes ---
  if (order.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('NOTES', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 51, 51);
    const lines = doc.splitTextToSize(order.notes, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 6;
  }

  // --- Signature section (at bottom of page) ---
  let sigY = pageHeight - 62;
  if (y > sigY - 8) {
    doc.addPage();
    sigY = pageHeight - 62;
  }

  // Divider
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, sigY, pageWidth - margin, sigY);

  // Label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text('Firma del Encargado de Obra:', margin, sigY + 10);

  // Digital signature image
  const nameY = sigY + 30;
  if (order.encargado_firma) {
    const firmaBase64 = await loadImageAsBase64(order.encargado_firma);
    if (firmaBase64) {
      try { doc.addImage(firmaBase64, 'PNG', margin, nameY - 18, 85, 22); } catch { /* ignore */ }
    }
  }

  // Signature line
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.5);
  doc.line(margin, nameY + 3, margin + 85, nameY + 3);

  // Encargado name under signature line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(26, 26, 26);
  doc.text(order.encargado_obra || '-', margin, nameY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 136, 136);
  doc.text("Encarregat d'Obra", margin, nameY + 14);

  // Date on the right
  const dateX = pageWidth - margin - 55;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 136, 136);
  doc.text('Data:', dateX, nameY);
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.5);
  doc.line(dateX + 14, nameY + 3, pageWidth - margin, nameY + 3);
  doc.setTextColor(26, 26, 26);
  doc.setFontSize(9);
  doc.text(moment().format('DD/MM/YYYY'), dateX + 14, nameY + 9);

  // --- Footer ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(170, 170, 170);
  doc.text('Noucolor Pro - Pintura i Decoracio', margin, pageHeight - 8);
  doc.text('Document confidencial - Us intern', pageWidth - margin, pageHeight - 8, { align: 'right' });

  doc.save(`Parte_${(order.title || 'treball').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}