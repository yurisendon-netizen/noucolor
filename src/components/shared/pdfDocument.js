import { jsPDF } from 'jspdf';
import moment from 'moment';

const LOGO_URL = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';
export const COMPANY_LEGAL = 'PINTURES I DECORACIÓ NOU COLOR, S.L.U.';
const COMPANY_SUB = "Pintura i Decoració · Principat d'Andorra";

const C = {
  black: [26, 26, 26],
  gray: [136, 136, 136],
  lightGray: [170, 170, 170],
  orange: [217, 119, 6],
  orangeLight: [245, 158, 11],
  border: [225, 225, 225],
  rowAlt: [248, 248, 248],
  white: [255, 255, 255],
};

let logoCache = null;

export async function loadImageAsBase64(url) {
  if (!url) return null;
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

async function loadLogo() {
  if (logoCache !== null) return logoCache;
  logoCache = await loadImageAsBase64(LOGO_URL);
  return logoCache;
}

export async function createDoc() {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  return { doc, pageWidth, pageHeight, margin };
}

export async function addHeader(doc, { title, subtitle }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  const logo = await loadLogo();
  if (logo) {
    try { doc.addImage(logo, 'PNG', margin, 14, 30, 20); } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...C.black);
  doc.text('NOUCOLOR PRO', margin + 35, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.gray);
  doc.text(COMPANY_LEGAL, margin + 35, 26);
  doc.text(COMPANY_SUB, margin + 35, 30);

  doc.setFontSize(8);
  doc.setTextColor(...C.lightGray);
  doc.text(`Generat el ${moment().format('DD/MM/YYYY')}`, pageWidth - margin, 21, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...C.black);
  doc.text(title, pageWidth / 2, 42, { align: 'center' });

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.orange);
    doc.text(subtitle, pageWidth / 2, 48, { align: 'center' });
  }

  doc.setFillColor(...C.orangeLight);
  doc.rect(margin, 52, pageWidth - margin * 2, 1.5, 'F');

  return 60;
}

export function addTable(doc, { columns, rows, startY, pageHeight, margin }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - margin * 2;
  const hasWidths = columns.every(c => c.width);
  const colWidths = hasWidths
    ? columns.map(c => c.width * tableWidth)
    : columns.map(() => tableWidth / columns.length);
  const lineHeight = 5;
  const padY = 3;

  function drawHeader(y) {
    doc.setFillColor(...C.orangeLight);
    doc.rect(margin, y, tableWidth, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    columns.forEach((col, i) => {
      const x = margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const align = col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left';
      const tx = align === 'right' ? x + colWidths[i] - 4 : align === 'center' ? x + colWidths[i] / 2 : x + 4;
      doc.text(String(col.label), tx, y + 6, { align });
    });
    return y + 9;
  }

  let y = drawHeader(startY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  rows.forEach((row, idx) => {
    const cellLines = columns.map((col, i) => {
      const val = col.render ? col.render(row) : row[col.key];
      return doc.splitTextToSize(String(val ?? '—'), colWidths[i] - 8);
    });
    const maxLines = Math.max(...cellLines.map(l => l.length), 1);
    const rowHeight = maxLines * lineHeight + padY * 2;

    if (y + rowHeight > pageHeight - 30) {
      doc.addPage();
      y = drawHeader(20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(margin, y, tableWidth, rowHeight, 'F');
    }

    doc.setTextColor(...C.black);
    cellLines.forEach((lines, i) => {
      const x = margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const align = columns[i].align === 'right' ? 'right' : columns[i].align === 'center' ? 'center' : 'left';
      const tx = align === 'right' ? x + colWidths[i] - 4 : align === 'center' ? x + colWidths[i] / 2 : x + 4;
      lines.forEach((line, li) => {
        doc.text(line, tx, y + padY + lineHeight * (li + 1) - 1, { align });
      });
    });

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);

    y += rowHeight;
  });

  return y;
}

export function addTextBlock(doc, { label, content, startY, pageHeight, margin }) {
  if (!content) return startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;

  if (y + 20 > pageHeight - 30) {
    doc.addPage();
    y = 25;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text(label.toUpperCase(), margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.black);
  const lines = doc.splitTextToSize(String(content), pageWidth - margin * 2);

  lines.forEach(line => {
    if (y + 5 > pageHeight - 30) {
      doc.addPage();
      y = 25;
    }
    doc.text(line, margin, y);
    y += 5;
  });

  return y + 4;
}

export async function addSignature(doc, { encargadoName, firmaUrl, startY, pageHeight, margin, label = 'Firma del Encargado de Obra:', roleLabel = "Encarregat d'Obra", signatureDate = null }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;

  if (y + 50 > pageHeight - 20) {
    doc.addPage();
    y = 25;
  } else {
    y += 12;
  }

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.black);
  doc.text(label, margin, y);

  const sigY = y + 22;
  if (firmaUrl) {
    const firma = await loadImageAsBase64(firmaUrl);
    if (firma) {
      try { doc.addImage(firma, 'PNG', margin, sigY - 16, 80, 20); } catch { /* ignore */ }
    }
  }

  doc.setDrawColor(...C.black);
  doc.setLineWidth(0.5);
  doc.line(margin, sigY + 4, margin + 80, sigY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.black);
  if (encargadoName) {
    doc.text(encargadoName, margin, sigY + 10);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text(roleLabel, margin, sigY + 15);

  const dateX = pageWidth - margin - 60;
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text('Data:', dateX, sigY);
  doc.setDrawColor(...C.black);
  doc.setLineWidth(0.5);
  doc.line(dateX + 12, sigY + 3, pageWidth - margin, sigY + 3);
  doc.setTextColor(...C.black);
  doc.setFontSize(9);
  const dateStr = signatureDate ? moment(signatureDate).format('DD/MM/YYYY') : moment().format('DD/MM/YYYY');
  doc.text(dateStr, dateX + 12, sigY + 10);

  return sigY + 20;
}

export function addFooters(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const totalPages = doc.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.lightGray);
    doc.text('Confidencial · Noucolor', margin, pageHeight - 8);
    doc.text(`Pàgina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }
}