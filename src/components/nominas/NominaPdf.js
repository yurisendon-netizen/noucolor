import { createDoc, addHeader, addTable, addSignature, addFooters } from '@/components/shared/pdfDocument';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function eur(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}

export async function generateNominaPdf(payroll) {
  const { doc, pageHeight, margin } = await createDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const periodLabel = `${MONTHS[(payroll.period_month || 1) - 1]} ${payroll.period_year}`;
  let y = await addHeader(doc, { title: 'Butlletí de Salari i Llibre Horari', subtitle: periodLabel });

  y = addTable(doc, {
    columns: [
      { label: 'Dada', key: 'label', width: 0.35 },
      { label: 'Valor', key: 'value', width: 0.65 },
    ],
    rows: [
      { label: 'Treballador', value: payroll.employee_name },
      { label: 'DNI / NIF', value: payroll.employee_dni || '—' },
      { label: 'Núm. CASS / N.S.S.', value: payroll.employee_nss || '—' },
      { label: 'Període', value: periodLabel },
      { label: 'Preu per hora', value: eur(payroll.precio_hora) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 6;
  const precioHora = Number(payroll.precio_hora) || 0;
  const totalHours = Number(payroll.total_hours) || 0;
  const overtimeHours = Number(payroll.overtime_hours) || 0;
  const regularHours = Math.max(0, totalHours - overtimeHours);

  y = addTable(doc, {
    columns: [
      { label: 'DEVENGAMENTS', key: 'label', width: 0.75 },
      { label: 'EUR', key: 'value', align: 'right', width: 0.25 },
    ],
    rows: [
      { label: 'Preu per hora', value: eur(precioHora) },
      { label: `Hores treballades (${regularHours.toFixed(1)}h regulars + ${overtimeHours.toFixed(1)}h extres)`, value: `${totalHours.toFixed(1)}h` },
      { label: 'Salari base (8:00-16:00)', value: eur(payroll.base_salary) },
      { label: `Hores extres (${overtimeHours.toFixed(1)}h × ${eur(precioHora)} × 1,5)`, value: eur(payroll.overtime_pay) },
      { label: 'Bonificacions', value: eur(payroll.bonus) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(136, 136, 136);
  const refText = `Càlcul: Hores × Preu per hora = ${totalHours.toFixed(1)}h × ${eur(precioHora)} = ${eur(totalHours * precioHora)}`;
  const breakdownText = `Desglossament: Salari base ${eur(payroll.base_salary)} + Hores extres ${eur(payroll.overtime_pay)} + Bonificacions ${eur(payroll.bonus)} = ${eur(payroll.gross_salary)}`;
  const refLines = doc.splitTextToSize(refText, pageWidth - margin * 2);
  doc.text(refLines, margin, y);
  y += refLines.length * 4 + 1;
  const breakLines = doc.splitTextToSize(breakdownText, pageWidth - margin * 2);
  doc.text(breakLines, margin, y);
  y += breakLines.length * 4 + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text('TOTAL DEVENGAT', margin, y);
  doc.text(eur(payroll.gross_salary), pageWidth - margin, y, { align: 'right' });
  y += 10;

  y = addTable(doc, {
    columns: [
      { label: 'DEDUCCIONS', key: 'label', width: 0.75 },
      { label: 'EUR', key: 'value', align: 'right', width: 0.25 },
    ],
    rows: [
      { label: 'Cotització CASS treballador (6,5%)', value: eur(payroll.cass_employee) },
      { label: 'Retenció IRPF', value: eur(payroll.irpf) },
      { label: 'Altres deduccions', value: eur(payroll.other_deductions) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  const totalDed = (Number(payroll.cass_employee) || 0) + (Number(payroll.irpf) || 0) + (Number(payroll.other_deductions) || 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text('TOTAL DEDUCCIONS', margin, y);
  doc.text(eur(totalDed), pageWidth - margin, y, { align: 'right' });

  y += 12;
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y, pageWidth - margin * 2, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('LÍQUID A PERCEBRE', margin + 4, y + 8);
  doc.text(eur(payroll.net_salary), pageWidth - margin - 4, y + 8, { align: 'right' });

  y += 22;
  if (payroll.worker_signature_url || payroll.worker_signature_name) {
    y = await addSignature(doc, {
      encargadoName: payroll.worker_signature_name || null,
      firmaUrl: payroll.worker_signature_url || null,
      label: 'Firma del Trabajador:',
      roleLabel: 'Treballador',
      signatureDate: payroll.worker_signature_date || null,
      startY: y, pageHeight, margin,
    });
  }

  addFooters(doc);
  doc.save(`Nomina_${(payroll.employee_name || 'treballador').replace(/\s/g, '_')}_${MONTHS[(payroll.period_month || 1) - 1]}_${payroll.period_year}.pdf`);
}