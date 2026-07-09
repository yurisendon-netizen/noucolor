import moment from 'moment';
import { createDoc, addHeader, addTable, addTextBlock, addSignature, addFooters } from '@/components/shared/pdfDocument';

const typeLabels = {
  baja_medica: 'Baixa Mèdica',
  vacaciones: 'Vacances',
  permiso_personal: 'Permís Personal',
  otro: 'Altre',
};

const statusLabels = {
  pendiente: 'Pendent',
  aprobado: 'Aprovat',
  rechazado: 'Rebutjat',
};

export async function generateJustificantePdf(item) {
  const { doc, pageHeight, margin } = await createDoc();
  const typeLabel = typeLabels[item.type] || item.type || 'Justificante';
  let y = await addHeader(doc, { title: 'Justificant', subtitle: typeLabel });

  y = addTable(doc, {
    columns: [
      { label: 'Dada', key: 'label', width: 0.35 },
      { label: 'Valor', key: 'value', width: 0.65 },
    ],
    rows: [
      { label: 'Treballador', value: item.employee_name },
      { label: 'Tipus', value: typeLabel },
      { label: 'Data des de', value: moment(item.date_from).format('DD/MM/YYYY') },
      { label: 'Data fins a', value: moment(item.date_to).format('DD/MM/YYYY') },
      { label: 'Estat', value: statusLabels[item.status] || item.status },
    ],
    startY: y, pageHeight, margin,
  });

  if (item.reason) {
    y = addTextBlock(doc, { label: 'Motiu', content: item.reason, startY: y, pageHeight, margin });
  }

  y = await addSignature(doc, { encargadoName: null, firmaUrl: null, startY: y, pageHeight, margin });

  addFooters(doc);
  doc.save(`Justificant_${(item.employee_name || 'treballador').replace(/\s/g, '_')}.pdf`);
}