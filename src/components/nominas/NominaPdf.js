import { createDoc, addHeader, addTable, addSignature, addFooters } from '@/components/shared/pdfDocument';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function eur(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function fmtDate(d) {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

// El PDF muestra EXACTAMENTE los importes guardados en la nómina: nunca los
// recalcula, así el neto del PDF es siempre el mismo que el de la app.
// Regla: neto = salario neto pactado + horas extra × preu hora extra
//        (ja net) + bonificacions − altres deduccions.
export async function generateNominaPdf(payroll) {
  const { doc, pageHeight, margin } = await createDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const periodLabel = `${MONTHS[(payroll.period_month || 1) - 1]} ${payroll.period_year}`;
  let y = await addHeader(doc, { title: 'Butlletí de Salari', subtitle: periodLabel });

  const baseSalary = r2(payroll.base_salary);
  const cass = r2(payroll.cass_employee);
  // Nóminas antiguas no guardaban el neto base: se deduce de bruto − CASS.
  const baseNet = payroll.base_net_salary != null ? r2(payroll.base_net_salary) : r2(baseSalary - cass);
  const overtimeHours = r2(payroll.overtime_hours);
  const extraPrice = r2(payroll.precio_hora_extra);
  const overtimePay = r2(payroll.overtime_pay);
  const bonus = r2(payroll.bonus);
  const otherDed = r2(payroll.other_deductions);
  const irpf = r2(payroll.irpf);
  const net = r2(payroll.net_salary);

  y = addTable(doc, {
    columns: [
      { label: 'Dada', key: 'label', width: 0.35 },
      { label: 'Valor', key: 'value', width: 0.65 },
    ],
    rows: [
      { label: 'Empresa', value: 'Noucolor' },
      { label: 'Treballador', value: payroll.employee_name },
      { label: 'Categoria', value: payroll.employee_position || '—' },
      { label: 'DNI / NIF', value: payroll.employee_dni || '—' },
      { label: 'Núm. CASS', value: payroll.employee_nss || '—' },
      { label: 'IBAN', value: payroll.employee_iban || '—' },
      { label: "Data d'incorporació", value: fmtDate(payroll.employee_hire_date) },
      { label: 'Període', value: periodLabel },
      { label: 'Preu per hora', value: `${eur(payroll.precio_hora)}/h` },
      { label: 'Preu per hora extra', value: extraPrice > 0 ? `${eur(extraPrice)}/h` : '—' },
      { label: 'Hores ordinàries fitxades', value: `${(Number(payroll.total_hours) || 0).toFixed(2)} h` },
    ],
    startY: y, pageHeight, margin,
  });

  y += 6;
  y = addTable(doc, {
    columns: [
      { label: 'MERITACIONS', key: 'label', width: 0.46 },
      { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
    ],
    rows: [
      { label: 'Salari base (brut)', detail: 'Mensual', value: eur(baseSalary) },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  y = addTable(doc, {
    columns: [
      { label: 'DEDUCCIONS', key: 'label', width: 0.46 },
      { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
    ],
    rows: [
      { label: 'Part obrera CASS', detail: `6,5% s/ ${eur(baseSalary)}`, value: `− ${eur(cass)}` },
      { label: 'Retenció IRPF', detail: '—', value: `− ${eur(irpf)}` },
    ],
    startY: y, pageHeight, margin,
  });

  y += 4;
  doc.setFillColor(120, 120, 120);
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SALARI NET BASE', margin + 4, y + 6);
  doc.text(eur(baseNet), pageWidth - margin - 4, y + 6, { align: 'right' });
  y += 13;

  const extraRows = [
    { label: 'Hores extres (import net)', detail: `${overtimeHours.toFixed(2)} h × ${eur(extraPrice)}`, value: `+ ${eur(overtimePay)}` },
  ];
  if (bonus > 0) extraRows.push({ label: 'Bonificacions', detail: '—', value: `+ ${eur(bonus)}` });
  if (otherDed > 0) extraRows.push({ label: 'Altres deduccions', detail: '—', value: `− ${eur(otherDed)}` });

  y = addTable(doc, {
    columns: [
      { label: 'COMPLEMENTS', key: 'label', width: 0.46 },
      { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
    ],
    rows: extraRows,
    startY: y, pageHeight, margin,
  });

  y += 4;
  y = addTable(doc, {
    columns: [
      { label: 'RESUM FINAL', key: 'label', width: 0.65 },
      { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.35 },
    ],
    rows: [
      { label: 'Salari net base', value: eur(baseNet) },
      { label: 'Hores extres', value: `+ ${eur(overtimePay)}` },
      ...(bonus > 0 ? [{ label: 'Bonificacions', value: `+ ${eur(bonus)}` }] : []),
      ...(otherDed > 0 ? [{ label: 'Altres deduccions', value: `− ${eur(otherDed)}` }] : []),
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
  doc.text(eur(net), pageWidth - margin - 4, y + 9, { align: 'right' });

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
