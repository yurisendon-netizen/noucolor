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
  const precioHoraExtra = precioHora * 1.4;
  const totalHours = Number(payroll.total_hours) || 0;
  const overtimeHours = Number(payroll.overtime_hours) || 0;
  const regularHours = Math.max(0, totalHours - overtimeHours);
  const salariOrdinaries = regularHours * precioHora;
  const overtimePayCalc = overtimeHours * precioHoraExtra;
  const bonus = Number(payroll.bonus) || 0;
  const baseSalary = Number(payroll.base_salary) || 0;
  const grossCalc = baseSalary + overtimePayCalc + bonus;
  const cassCalc = grossCalc * 0.065;
  const irpfCalc = grossCalc > 2000 ? grossCalc * 0.05 : 0;
  const otherDed = Number(payroll.other_deductions) || 0;
  const totalDed = cassCalc + irpfCalc + otherDed;
  const netCalc = grossCalc - totalDed;

  y = addTable(doc, {
    columns: [
      { label: 'CONCEPTE', key: 'label', width: 0.46 },
      { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
    ],
    rows: [
      { label: 'Preu per hora ordinària', detail: `${eur(precioHora)}/h`, value: eur(precioHora) },
      { label: 'Preu per hora extra (+40%)', detail: `${eur(precioHora)} × 1,4`, value: eur(precioHoraExtra) },
      { label: 'Hores ordinàries (total)', detail: `${regularHours.toFixed(1)}h`, value: eur(salariOrdinaries) },
      { label: 'Hores extres (desglossament)', detail: `${overtimeHours.toFixed(1)}h × ${eur(precioHoraExtra)}`, value: eur(overtimePayCalc) },
      { label: 'Salari base ajustat (8:00-16:00)', detail: '—', value: eur(baseSalary) },
      { label: 'Bonificacions', detail: '—', value: eur(bonus) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  doc.setFillColor(217, 119, 6);
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SALARI BRUT (Ordinàries + Extres + Bonificacions)', margin + 4, y + 6);
  doc.text(eur(grossCalc), pageWidth - margin - 4, y + 6, { align: 'right' });
  y += 13;

  y = addTable(doc, {
    columns: [
      { label: 'DEDUCCIONS', key: 'label', width: 0.46 },
      { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
    ],
    rows: [
      { label: 'Part obrer CASS (6,5%)', detail: `6,5% × ${eur(grossCalc)}`, value: eur(cassCalc) },
      { label: 'Retenció IRPF', detail: irpfCalc > 0 ? `5% sobre ${eur(grossCalc)}` : '—', value: eur(irpfCalc) },
      { label: 'Altres deduccions', detail: '—', value: eur(otherDed) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  doc.setFillColor(120, 120, 120);
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL DEDUCCIONS', margin + 4, y + 6);
  doc.text(eur(totalDed), pageWidth - margin - 4, y + 6, { align: 'right' });
  y += 13;

  y = addTable(doc, {
    columns: [
      { label: 'RESUM FINAL', key: 'label', width: 0.65 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.35 },
    ],
    rows: [
      { label: 'Salari brut', value: eur(grossCalc) },
      { label: 'Total deduccions (−)', value: eur(totalDed) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y, pageWidth - margin * 2, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SALARI NET A PERCEBRE', margin + 4, y + 9);
  doc.text(eur(netCalc), pageWidth - margin - 4, y + 9, { align: 'right' });

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