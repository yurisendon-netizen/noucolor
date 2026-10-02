import { jsPDF } from 'jspdf';
import { loadImageAsBase64, COMPANY_LEGAL } from '@/components/shared/pdfDocument';
import { CODES, DOW, monthLabel, fH, fDate } from './registroUtils';

const LOGO_URL = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';
const BLACK = [26, 26, 26];
const GRAY = [136, 136, 136];
const ORANGE = [245, 158, 11];
const BORDER = [215, 215, 215];

// PDF del registro mensual: cuadrícula (A4 horizontal) + detalle por trabajador + firma
export async function downloadRegistroPdf(reg, { signerName, signature } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297;
  const H = 210;
  const M = 12;
  const logo = await loadImageAsBase64(LOGO_URL);
  const title = 'REGISTRO MENSUAL DE FICHAJES';
  const sub = monthLabel(reg.month);

  const header = () => {
    if (logo) { try { doc.addImage(logo, 'PNG', M, 7, 24, 16); } catch { /* */ } }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text('NOUCOLOR', M + 28, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(COMPANY_LEGAL, M + 28, 17.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...BLACK);
    doc.text(title, W - M, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(217, 119, 6);
    doc.text(sub, W - M, 19, { align: 'right' });
    doc.setFillColor(...ORANGE);
    doc.rect(M, 25, W - 2 * M, 1.2, 'F');
    return 31;
  };

  // ── Cuadrícula ──
  let y = header();
  const nameW = 52;
  const sumCols = [['Días', 'fichados'], ['Horas', 'horas'], ['Extras', 'extras'], ['Faltas', 'faltas'], ['Just.', 'just']];
  const sumW = 13;
  const dayW = (W - 2 * M - nameW - sumCols.length * sumW) / reg.days.length;
  const rowH = 7.2;

  const gridHeader = () => {
    doc.setFillColor(...BLACK);
    doc.rect(M, y, W - 2 * M, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('TRABAJADOR', M + 2, y + 5.6);
    reg.days.forEach((d, i) => {
      const x = M + nameW + i * dayW + dayW / 2;
      doc.setFontSize(6.8);
      doc.setTextColor(d.weekend ? 160 : 255, d.weekend ? 160 : 255, d.weekend ? 160 : 255);
      doc.text(String(d.d), x, y + 4, { align: 'center' });
      doc.setFontSize(5.5);
      doc.text(DOW[d.dow], x, y + 7.5, { align: 'center' });
    });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.8);
    sumCols.forEach(([lbl], i) => {
      doc.text(lbl, M + nameW + reg.days.length * dayW + i * sumW + sumW / 2, y + 5.6, { align: 'center' });
    });
    y += 9;
  };
  gridHeader();

  reg.rows.forEach((r, ri) => {
    if (y + rowH > H - 30) { doc.addPage(); y = header(); gridHeader(); }
    if (ri % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(M, y, W - 2 * M, rowH, 'F'); }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLACK);
    const name = doc.splitTextToSize(r.emp.full_name, nameW - 3)[0];
    doc.text(name, M + 2, y + 4.7);
    reg.days.forEach((d, i) => {
      const x = M + nameW + i * dayW;
      if (d.weekend) { doc.setFillColor(232, 232, 232); doc.rect(x + 0.2, y + 0.4, dayW - 0.4, rowH - 0.8, 'F'); }
      const c = r.cells[d.date];
      if (c) {
        const code = CODES[c.code];
        doc.setFillColor(...code.rgb);
        doc.rect(x + 0.4, y + 0.8, dayW - 0.8, rowH - 1.6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(c.code === 'S' ? 17 : 255, c.code === 'S' ? 17 : 255, c.code === 'S' ? 17 : 255);
        doc.text(c.code === 'S' ? '?' : c.code, x + dayW / 2, y + 4.8, { align: 'center' });
      }
    });
    const t = r.totals;
    const vals = [String(t.fichados), fH(t.horas), fH(t.extras), String(t.faltas + t.sinRegistro), String(t.B + t.V + t.P)];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    vals.forEach((v, i) => {
      doc.setTextColor(...(i === 3 && v !== '0' ? [220, 38, 38] : BLACK));
      doc.text(v, M + nameW + reg.days.length * dayW + i * sumW + sumW / 2, y + 4.7, { align: 'center' });
    });
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y + rowH, W - M, y + rowH);
    y += rowH;
  });
  doc.setDrawColor(...BORDER);

  // Leyenda
  y += 5;
  doc.setFontSize(7);
  let lx = M;
  Object.entries(CODES).forEach(([k, c]) => {
    doc.setFillColor(...c.rgb);
    doc.rect(lx, y - 3, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(k === 'S' ? 17 : 255, k === 'S' ? 17 : 255, k === 'S' ? 17 : 255);
    doc.text(k === 'S' ? '?' : k, lx + 2, y - 0.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    doc.text(c.label, lx + 5.5, y);
    lx += doc.getTextWidth(c.label) + 13;
  });
  doc.setFillColor(232, 232, 232);
  doc.rect(lx, y - 3, 4, 4, 'F');
  doc.text('Fin de semana', lx + 5.5, y);
  y += 5;
  doc.setTextColor(...GRAY);
  doc.text(`Laborables del mes: ${reg.laborables}. "Faltas" incluye los laborables sin ningún registro (?). "Just." = baja, vacaciones o permiso.`, M, y);

  // ── Detalle por trabajador ──
  doc.addPage();
  y = header();
  const cols = [['Fecha', 26], ['Tipo', 34], ['Entrada', 22], ['Salida', 22], ['Horas', 20], ['Extras', 20], ['Notas', W - 2 * M - 144]];
  const detHeader = () => {
    doc.setFillColor(...BLACK);
    doc.rect(M, y, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let x = M;
    cols.forEach(([l, w]) => { doc.text(l.toUpperCase(), x + 2, y + 4.8); x += w; });
    y += 7;
  };
  for (const r of reg.rows) {
    if (y + 26 > H - 16) { doc.addPage(); y = header(); }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text(r.emp.full_name, M, y + 4);
    const t = r.totals;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`${t.fichados} días fichados · ${fH(t.horas)} h · ${fH(t.extras)} h extra · ${t.faltas} faltas · ${t.sinRegistro} sin registro · ${t.B} baja · ${t.V} vacaciones · ${t.P} permiso${t.tardes ? ` · ${t.tardes} entradas tarde` : ''}`, M, y + 8.5);
    y += 11;
    detHeader();
    if (r.detalle.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text('Sin registros este mes.', M + 2, y + 4.5);
      y += 7;
    }
    r.detalle.forEach((d, i) => {
      if (y + 6 > H - 16) { doc.addPage(); y = header(); detHeader(); }
      if (i % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(M, y, W - 2 * M, 6, 'F'); }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(d.tipo === 'Falta' ? 220 : 40, d.tipo === 'Falta' ? 38 : 40, d.tipo === 'Falta' ? 38 : 40);
      const vals = [fDate(d.date), d.tipo, d.entrada, d.salida, d.horas ? `${fH(d.horas)} h` : '—', d.extras ? `${fH(d.extras)} h` : '—', d.notas || ''];
      let x = M;
      vals.forEach((v, k) => {
        const txt = doc.splitTextToSize(String(v), cols[k][1] - 3)[0] || '';
        doc.text(txt, x + 2, y + 4.2);
        x += cols[k][1];
      });
      y += 6;
    });
    y += 6;
  }

  // ── Firma ──
  const sigW = 90;
  const sigH = 36;
  if (y + sigH > H - 14) { doc.addPage(); y = header(); }
  const sx = W - M - sigW;
  doc.setFillColor(...BLACK);
  doc.rect(sx, y, sigW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('CONFORME · FIRMA', sx + sigW / 2, y + 4.8, { align: 'center' });
  doc.setDrawColor(...BORDER);
  doc.rect(sx, y, sigW, sigH);
  if (signature) {
    try {
      const fmt = signature.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(signature, fmt, sx + (sigW - 50) / 2, y + 8.5, 50, 17);
    } catch { /* */ }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 170);
    doc.text('(Sin firmar)', sx + sigW / 2, y + 18, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(signerName || '', sx + sigW / 2, y + sigH - 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, sx + sigW / 2, y + sigH - 2.2, { align: 'center' });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Noucolor · Registro mensual de fichajes · ${sub} · Página ${i}/${pages}`, W / 2, H - 5, { align: 'center' });
  }
  doc.save(`Registro_fichajes_${reg.month}${signature ? '_firmado' : ''}.pdf`);
}
