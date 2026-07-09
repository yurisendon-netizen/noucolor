import { createDoc, addHeader, addTable, addSignature, addFooters } from '@/components/shared/pdfDocument';
import { REPORT_CONFIG } from './reportConfig';

export async function generateReportPdf({ reportType, rows, periodLabel, signerName }) {
  const config = REPORT_CONFIG[reportType];
  if (!config) return;

  const { doc, pageHeight, margin } = await createDoc();
  let y = await addHeader(doc, { title: config.title, subtitle: periodLabel });

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(136, 136, 136);
    doc.text('No hay datos para este período.', margin, y + 10);
  } else {
    const mappedRows = rows.map(config.mapRow);
    y = addTable(doc, {
      columns: config.columns,
      rows: mappedRows,
      startY: y, pageHeight, margin,
    });
  }

  if (signerName) {
    y = await addSignature(doc, {
      encargadoName: signerName,
      firmaUrl: null,
      label: 'Firma del Encargado:',
      roleLabel: 'Encarregat',
      signatureDate: new Date().toISOString(),
      startY: y, pageHeight, margin,
    });
  }

  addFooters(doc);
  doc.save(`Informe_${reportType}_${periodLabel.replace(/\s/g, '_')}.pdf`);
}