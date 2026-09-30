import moment from 'moment';
import { createDoc, addHeader, addTable, addTextBlock, addSignature, addFooters } from '@/components/shared/pdfDocument';

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const STATUS_LABELS = { pendiente: 'Pendiente', en_progreso: 'En Progreso', completado: 'Completado' };

export async function generateWorkOrderPdf(order) {
  const { doc, pageHeight, margin } = await createDoc();
  const horas = Array.isArray(order.horas_trabajadas) ? order.horas_trabajadas : [];
  const totalHoras = Number(order.total_horas) || horas.reduce((s, h) => s + (Number(h.horas) || 0), 0);
  const fmtH = (n) => `${(Number(n) || 0).toFixed(2).replace(/\.00$/, '')} h`;
  let y = await addHeader(doc, { title: 'Parte de Trabajo', subtitle: moment(order.date).format('DD/MM/YYYY') });

  y = addTable(doc, {
    columns: [
      { label: 'Dada', key: 'label', width: 0.35 },
      { label: 'Valor', key: 'value', width: 0.65 },
    ],
    rows: [
      { label: 'Títol', value: order.title },
      { label: 'Client', value: order.client_name },
      { label: 'Data', value: moment(order.date).format('DD/MM/YYYY') },
      { label: 'Empleat', value: order.assigned_name },
      { label: "Encarregat d'Obra", value: order.encargado_obra },
      { label: 'Prioritat', value: PRIORITY_LABELS[order.priority] || order.priority },
      { label: 'Estat', value: STATUS_LABELS[order.status] || order.status },
      { label: 'Hores totals', value: horas.length > 0 ? fmtH(totalHoras) : '—' },
    ],
    startY: y, pageHeight, margin,
  });

  // ── Hores treballades per treballador
  y += 6;
  if (y > pageHeight - 60) { doc.addPage(); y = margin + 10; }
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(217, 119, 6);
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('HORES TREBALLADES', margin + 4, y + 6);
  doc.setTextColor(0, 0, 0);
  y += 11;
  if (horas.length > 0) {
    y = addTable(doc, {
      columns: [
        { label: 'TREBALLADOR', key: 'name', width: 0.7 },
        { label: 'HORES', key: 'horas', align: 'right', width: 0.3 },
      ],
      rows: [
        ...horas.map(h => ({ name: h.employee_name, horas: fmtH(h.horas) })),
        { name: 'TOTAL', horas: fmtH(totalHoras) },
      ],
      startY: y, pageHeight, margin,
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Sense hores registrades en aquest parte.', margin + 4, y + 5);
    y += 10;
  }
  y += 2;

  if (order.description) {
    y = addTextBlock(doc, { label: 'Descripció', content: order.description, startY: y, pageHeight, margin });
  }
  if (order.materials) {
    y = addTextBlock(doc, { label: 'Materials', content: order.materials, startY: y, pageHeight, margin });
  }
  if (order.notes) {
    y = addTextBlock(doc, { label: 'Notes', content: order.notes, startY: y, pageHeight, margin });
  }

  y = await addSignature(doc, { encargadoName: order.encargado_obra, firmaUrl: order.encargado_firma, startY: y, pageHeight, margin });

  addFooters(doc);
  doc.save(`Parte_${(order.title || 'treball').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}