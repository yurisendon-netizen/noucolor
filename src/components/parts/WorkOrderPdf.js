import moment from 'moment';
import { createDoc, addHeader, addTable, addTextBlock, addSignature, addFooters } from '@/components/shared/pdfDocument';

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const STATUS_LABELS = { pendiente: 'Pendiente', en_progreso: 'En Progreso', completado: 'Completado' };

export async function generateWorkOrderPdf(order) {
  const { doc, pageHeight, margin } = await createDoc();
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
    ],
    startY: y, pageHeight, margin,
  });

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