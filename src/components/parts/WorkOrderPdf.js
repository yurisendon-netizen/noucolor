import moment from 'moment';
import { jsPDF } from 'jspdf';
import { loadImageAsBase64, COMPANY_LEGAL } from '@/components/shared/pdfDocument';
import { authInvoke } from '@/lib/authInvoke';

// =====================================================================
// PARTE DE TREBALL — formato de UNA sola hoja (acordado con la dirección).
// Cabecera: logo + empresa | título · data · actividad · NRT
// Client / Obra en grande · Treball realitzat · Treballador / Hores / Extres
// Observacions (notas + material) · Firma del encarregat (siempre abajo).
// La fecha sale UNA sola vez. Las extras salen solas de Horas Extras.
// =====================================================================

const LOGO_URL = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';
const NRT = 'L707780T';

const C = {
  black: [26, 26, 26],
  gray: [120, 120, 120],
  light: [170, 170, 170],
  orange: [217, 119, 6],
  orangeL: [245, 158, 11],
  soft: [254, 243, 226],
  border: [225, 225, 225],
  rowAlt: [250, 250, 250],
  white: [255, 255, 255],
};

const fmtH = (n) => `${String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',')} h`;

// "PMP Juberri" con cliente "PMP" → "Juberri" (que no se repita el cliente)
function obraSinCliente(obra, client) {
  const o = String(obra || '').trim();
  const c = String(client || '').trim();
  if (c && o.toLowerCase().startsWith(c.toLowerCase() + ' ')) return o.slice(c.length).trim();
  return o;
}

// download=false devuelve el PDF como Blob (para enviarlo por correo) en vez de descargarlo.
export async function generateWorkOrderPdf(order, { download = true } = {}) {
  // Obra vinculada + horas extra de cada trabajador (backend)
  let obra = null;
  let extras = {};
  try {
    const res = await authInvoke('trackTime', { operation: 'workOrderPdfData', workOrderId: order.id });
    obra = res.data?.obra || null;
    extras = res.data?.extras || {};
  } catch (e) { console.error('workOrderPdfData', e); }

  const [logo, firma] = await Promise.all([
    loadImageAsBase64(LOGO_URL),
    order.encargado_firma ? loadImageAsBase64(order.encargado_firma) : Promise.resolve(null),
  ]);

  const client = String(order.client_name || '').trim();
  const obraNombre = obraSinCliente(obra?.nombre || (order.title !== order.client_name ? order.title : ''), client) || '—';
  const address = String(order.address || obra?.direccion || '').trim();
  const horas = (Array.isArray(order.horas_trabajadas) ? order.horas_trabajadas : []).map(h => ({
    name: h.employee_name,
    horas: Number(h.horas) || 0,
    extras: Number(extras[h.employee_id]) || 0,
  }));

  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const CW = W - M * 2;
  const set = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };

  // ── CABECERA
  if (logo) { try { doc.addImage(logo, 'PNG', M, 11, 24, 24); } catch { /* sin logo */ } }
  set('bold', 11, C.black);
  doc.text(COMPANY_LEGAL, M + 28, 20);
  set('bold', 15, C.orange);
  doc.text('PARTE DE TREBALL', W - M, 17, { align: 'right' });
  set('normal', 10, C.black);
  doc.text(`Data: ${moment(order.date).format('DD/MM/YYYY')}`, W - M, 23.5, { align: 'right' });
  set('normal', 8, C.gray);
  doc.text("Pintura i Decoració · Principat d'Andorra", W - M, 29, { align: 'right' });
  doc.text(`NRT: ${NRT}`, W - M, 33.5, { align: 'right' });
  doc.setFillColor(...C.orangeL);
  doc.rect(M, 38, CW, 1.2, 'F');

  // ── CLIENT / OBRA
  let y = 44;
  doc.setFillColor(...C.soft);
  doc.roundedRect(M, y, CW, 21, 2, 2, 'F');
  const col2 = M + CW / 2;
  set('bold', 7.5, C.gray);
  doc.text('CLIENT', M + 5, y + 7);
  doc.text('OBRA', col2 + 5, y + 7);
  const fit = (txt, x) => {
    let size = 15;
    doc.setFont('helvetica', 'bold');
    while (size > 9 && doc.setFontSize(size).getTextWidth(txt) > CW / 2 - 10) size -= 0.5;
    set('bold', size, C.black);
    doc.text(doc.splitTextToSize(txt, CW / 2 - 10)[0], x, y + 15.5);
  };
  fit(client || '—', M + 5);
  fit(obraNombre, col2 + 5);
  doc.setDrawColor(...C.orangeL); doc.setLineWidth(0.4);
  doc.line(col2, y + 4, col2, y + 17);
  y += 21;
  if (address) {
    set('normal', 8.5, C.gray);
    doc.text(doc.splitTextToSize(`Adreça: ${address}`, CW - 10)[0], M + 5, y + 5);
    y += 6;
  }

  // ── TREBALL REALITZAT
  y += 8;
  set('bold', 8, C.orange);
  doc.text('TREBALL REALITZAT', M, y);
  y += 5;
  set('normal', 10, C.black);
  let desc = doc.splitTextToSize(order.description || '—', CW);
  if (desc.length > 6) { desc = desc.slice(0, 6); desc[5] = desc[5].replace(/.{0,3}$/, '…'); }
  desc.forEach((l) => { doc.text(l, M, y); y += 5; });

  // ── TREBALLADOR / HORES / EXTRES
  y += 4;
  const rowH = 8;
  const xExtra = W - M - 4;
  const xHoras = W - M - 34;
  doc.setFillColor(...C.orangeL);
  doc.rect(M, y, CW, rowH, 'F');
  set('bold', 9, C.white);
  doc.text('TREBALLADOR', M + 4, y + 5.5);
  doc.text('HORES', xHoras, y + 5.5, { align: 'right' });
  doc.text('EXTRES', xExtra, y + 5.5, { align: 'right' });
  y += rowH;
  horas.slice(0, 10).forEach((h, i) => {
    if (i % 2 === 1) { doc.setFillColor(...C.rowAlt); doc.rect(M, y, CW, rowH, 'F'); }
    set('normal', 10, C.black);
    doc.text(doc.splitTextToSize(String(h.name || ''), xHoras - M - 30)[0], M + 4, y + 5.5);
    doc.text(fmtH(h.horas), xHoras, y + 5.5, { align: 'right' });
    doc.text(h.extras ? fmtH(h.extras) : '—', xExtra, y + 5.5, { align: 'right' });
    doc.setDrawColor(...C.border); doc.setLineWidth(0.2);
    doc.line(M, y + rowH, M + CW, y + rowH);
    y += rowH;
  });
  const total = horas.reduce((s, h) => s + h.horas, 0);
  const totalExtra = horas.reduce((s, h) => s + h.extras, 0);
  doc.setFillColor(...C.soft);
  doc.rect(M, y, CW, rowH + 1, 'F');
  set('bold', 10.5, C.black);
  doc.text('TOTAL', M + 4, y + 6);
  doc.text(fmtH(total), xHoras, y + 6, { align: 'right' });
  doc.text(totalExtra ? fmtH(totalExtra) : '—', xExtra, y + 6, { align: 'right' });
  y += rowH + 1;

  // ── OBSERVACIONS (ocupa el espacio que quede hasta la firma)
  const sigTop = H - 58;
  y += 8;
  set('bold', 8, C.orange);
  doc.text('OBSERVACIONS', M, y);
  y += 3;
  const boxH = Math.max(18, sigTop - 6 - y);
  doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'S');
  const obsTxt = [order.notes, order.materials ? `Material: ${order.materials}` : ''].filter(Boolean).join('\n');
  if (obsTxt) {
    set('normal', 9.5, C.black);
    const maxLines = Math.floor((boxH - 6) / 4.8);
    doc.splitTextToSize(obsTxt, CW - 8).slice(0, maxLines)
      .forEach((l, i) => doc.text(l, M + 4, y + 6 + i * 4.8));
  }

  // ── FIRMA (siempre en el mismo sitio, abajo)
  const sy = sigTop;
  set('bold', 9, C.black);
  doc.text("Conforme, l'encarregat d'obra", M, sy);
  if (firma) { try { doc.addImage(firma, 'PNG', M, sy + 3, 70, 19); } catch { /* sin firma */ } }
  doc.setDrawColor(...C.black); doc.setLineWidth(0.5);
  doc.line(M, sy + 23, M + 80, sy + 23);
  set('bold', 9.5, C.black);
  doc.text(order.encargado_obra || '', M, sy + 28);
  set('normal', 8, C.gray);
  doc.text("Encarregat d'obra", M, sy + 32);

  // ── PIE
  set('normal', 7, C.light);
  doc.text('Noucolor · Confidencial', M, H - 8);

  if (!download) return doc.output('blob');
  const nombre = [client, obraNombre !== '—' ? obraNombre : '', moment(order.date).format('YYYY-MM-DD')].filter(Boolean).join('_');
  doc.save(`Parte_${nombre.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`);
}
