import { createDoc, addHeader, addTable, addSignature, addFooters, addTextBlock } from '@/components/shared/pdfDocument';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESOS = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];

function eur(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fH = (h) => (Math.round((Number(h) || 0) * 100) / 100).toFixed(2).replace('.', ',');

function fmtDate(d) {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

function totalBar(doc, { y, label, value, color = [120, 120, 120], h = 9, size = 10 }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  doc.setFillColor(...color);
  doc.rect(margin, y, pageWidth - margin * 2, h, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.text(label, margin + 4, y + h / 2 + size / 6);
  doc.text(value, pageWidth - margin - 4, y + h / 2 + size / 6, { align: 'right' });
  return y + h + 4;
}

// El PDF muestra EXACTAMENTE los importes guardados en la nómina: nunca los
// recalcula, así el neto del PDF es siempre el mismo que el de la app.
// Nóminas calc_version 2 (Llei 31/2018 art. 71 i 77.3): las horas extra van en
// bruto y cotizan a la CASS; se adjunta el compte d'hores del mes (art. 59.2).
export async function generateNominaPdf(payroll) {
  const { doc, pageHeight, margin } = await createDoc();
  const periodLabel = `${MESOS[(payroll.period_month || 1) - 1]} ${payroll.period_year}`;
  let y = await addHeader(doc, { title: 'Butlletí de Salari', subtitle: periodLabel });

  const v2 = Number(payroll.calc_version) >= 2;
  const baseSalary = r2(payroll.base_salary);
  const cass = r2(payroll.cass_employee);
  const baseNet = payroll.base_net_salary != null ? r2(payroll.base_net_salary) : r2(baseSalary - cass);
  const overtimeHours = r2(payroll.overtime_hours);
  const extraPriceNet = r2(payroll.precio_hora_extra);
  const otGross = v2 ? r2(payroll.overtime_gross) : r2(payroll.overtime_pay);
  const otNet = v2 ? r2(payroll.overtime_net) : r2(payroll.overtime_pay);
  const bonusNet = r2(payroll.bonus);
  const bonusGross = v2 ? r2(payroll.bonus_gross) : bonusNet;
  const otherDed = r2(payroll.other_deductions);
  const irpf = r2(payroll.irpf);
  const gross = r2(payroll.gross_salary);
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
      { label: 'Preu per hora extra', value: extraPriceNet > 0 ? (v2 ? `${eur(r2(extraPriceNet / 0.935))}/h brut (${eur(extraPriceNet)}/h net)` : `${eur(extraPriceNet)}/h`) : '—' },
      { label: 'Hores ordinàries fitxades', value: `${(Number(payroll.total_hours) || 0).toFixed(2)} h` },
      { label: 'Hores extres', value: `${overtimeHours.toFixed(2)} h` },
    ],
    startY: y, pageHeight, margin,
  });

  y += 6;
  if (v2) {
    const meritacions = [
      { label: 'Salari base', detail: 'Mensual', value: eur(baseSalary) },
    ];
    if (overtimeHours > 0 || otGross > 0) {
      meritacions.push({ label: 'Hores extres', detail: `${overtimeHours.toFixed(2)} h × ${eur(r2(extraPriceNet / 0.935))}`, value: eur(otGross) });
    }
    if (bonusGross > 0) meritacions.push({ label: 'Bonificacions', detail: '—', value: eur(bonusGross) });
    y = addTable(doc, {
      columns: [
        { label: 'MERITACIONS', key: 'label', width: 0.46 },
        { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
        { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
      ],
      rows: meritacions,
      startY: y, pageHeight, margin,
    });
    y += 4;
    y = totalBar(doc, { y, label: 'TOTAL BRUT (base de cotització CASS)', value: eur(gross) });

    const deduccions = [
      { label: 'Part obrera CASS', detail: `6,5% s/ ${eur(gross)}`, value: `− ${eur(cass)}` },
      { label: 'Retenció IRPF', detail: '—', value: `− ${eur(irpf)}` },
    ];
    if (otherDed > 0) deduccions.push({ label: 'Altres deduccions', detail: '—', value: `− ${eur(otherDed)}` });
    y = addTable(doc, {
      columns: [
        { label: 'DEDUCCIONS', key: 'label', width: 0.46 },
        { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
        { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
      ],
      rows: deduccions,
      startY: y, pageHeight, margin,
    });
    y += 4;
    y = totalBar(doc, { y, label: 'SALARI NET A PERCEBRE', value: eur(net), color: [245, 158, 11], h: 14, size: 13 });

    y = addTable(doc, {
      columns: [
        { label: 'INFORMACIÓ (A CÀRREC DE L\'EMPRESA)', key: 'label', width: 0.65 },
        { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.35 },
      ],
      rows: [
        { label: `Cotització CASS part empresa (15,5% s/ ${eur(gross)})`, value: eur(payroll.cass_employer) },
      ],
      startY: y, pageHeight, margin,
    });
    y += 4;
  } else {
    // Nóminas antiguas (antes de la versión 2): se muestran tal como se emitieron.
    y = addTable(doc, {
      columns: [
        { label: 'CONCEPTE', key: 'label', width: 0.46 },
        { label: 'DETALL', key: 'detail', align: 'center', width: 0.32 },
        { label: 'IMPORT (€)', key: 'value', align: 'right', width: 0.22 },
      ],
      rows: [
        { label: 'Salari base (brut)', detail: 'Mensual', value: eur(baseSalary) },
        { label: 'Part obrera CASS', detail: `6,5% s/ ${eur(baseSalary)}`, value: `− ${eur(cass)}` },
        { label: 'Retenció IRPF', detail: '—', value: `− ${eur(irpf)}` },
        { label: 'Salari net base', detail: '', value: eur(baseNet) },
        { label: 'Hores extres', detail: `${overtimeHours.toFixed(2)} h × ${eur(extraPriceNet)}`, value: `+ ${eur(otNet)}` },
        ...(bonusNet > 0 ? [{ label: 'Bonificacions', detail: '—', value: `+ ${eur(bonusNet)}` }] : []),
        ...(otherDed > 0 ? [{ label: 'Altres deduccions', detail: '—', value: `− ${eur(otherDed)}` }] : []),
      ],
      startY: y, pageHeight, margin,
    });
    y += 4;
    y = totalBar(doc, { y, label: 'SALARI NET A PERCEBRE', value: eur(net), color: [245, 158, 11], h: 14, size: 13 });
  }

  // ── Compte d'hores del mes (Llei 31/2018, art. 59.2)
  let compte = null;
  try { compte = payroll.compte_hores ? JSON.parse(payroll.compte_hores) : null; } catch { compte = null; }
  if (compte) {
    doc.addPage();
    y = await addHeader(doc, { title: "Compte d'hores", subtitle: `${payroll.employee_name} · ${periodLabel}` });
    const t = compte.totals || {};
    y = addTable(doc, {
      columns: [
        { label: 'RESUM DEL MES', key: 'label', width: 0.7 },
        { label: 'VALOR', key: 'value', align: 'right', width: 0.3 },
      ],
      rows: [
        { label: 'Dies laborables del mes', value: String(compte.laborables ?? '—') },
        { label: 'Dies treballats', value: String(t.fichados ?? 0) },
        { label: 'Hores ordinàries', value: `${fH(t.horas)} h` },
        { label: 'Hores extres fitxades (incl. caps de setmana)', value: `${fH(t.extras)} h` },
        { label: 'Hores extres pagades en aquesta nòmina', value: `${fH(payroll.overtime_hours)} h` },
        { label: 'Vacances (dies)', value: String(t.V ?? 0) },
        { label: 'Baixa mèdica (dies)', value: String(t.B ?? 0) },
        { label: 'Permisos / absències justificades (dies)', value: String(t.P ?? 0) },
        { label: 'Absències no justificades (dies)', value: String(t.faltas ?? 0) },
      ],
      startY: y, pageHeight, margin,
    });
    y += 6;
    const detalle = Array.isArray(compte.detalle) ? compte.detalle : [];
    if (detalle.length > 0) {
      y = addTable(doc, {
        columns: [
          { label: 'Data', key: 'date', width: 0.14, render: r => fmtDate(r.date) },
          { label: 'Tipus', key: 'tipo', width: 0.15 },
          { label: 'Entrada', key: 'entrada', width: 0.11, align: 'center' },
          { label: 'Sortida', key: 'salida', width: 0.11, align: 'center' },
          { label: 'Hores', key: 'horas', width: 0.1, align: 'right', render: r => fH(r.horas) },
          { label: 'Extres', key: 'extras', width: 0.1, align: 'right', render: r => (r.extras ? fH(r.extras) : '—') },
          { label: 'Notes', key: 'notas', width: 0.29, render: r => (r.notas || '').replace('Cierre automático', 'Sortida no fitxada (16:00)') },
        ],
        rows: detalle,
        startY: y, pageHeight, margin,
      });
      y += 6;
    }
    y = addTextBlock(doc, {
      label: 'Important',
      content: "Aquest compte d'hores es lliura juntament amb el butlletí de salari (Llei 31/2018, art. 59.2). Si no hi estàs d'acord, comunica-ho a l'empresa en un termini màxim de 7 dies naturals amb el botó «Reclamar» de l'apartat Nòmines de l'app. Les hores extres fitxades en dia laborable es paguen un cop aprovades per l'empresa.",
      startY: y, pageHeight, margin,
    });
  }

  if (payroll.reclamacion_texto) {
    y = addTextBlock(doc, { label: `Reclamació del treballador (${fmtDate(payroll.reclamacion_fecha)})`, content: payroll.reclamacion_texto, startY: y + 2, pageHeight, margin });
    if (payroll.reclamacion_respuesta) {
      y = addTextBlock(doc, { label: `Resposta de l'empresa (${payroll.reclamacion_resuelta_por || ''}, ${fmtDate(payroll.reclamacion_resuelta_fecha)})`, content: payroll.reclamacion_respuesta, startY: y, pageHeight, margin });
    }
  }

  y += 6;
  if (payroll.worker_signature_url || payroll.worker_signature_name) {
    y = await addSignature(doc, {
      encargadoName: payroll.worker_signature_name || null,
      firmaUrl: payroll.worker_signature_url || null,
      label: 'Conforme — Firma del Treballador:',
      roleLabel: 'Treballador',
      signatureDate: payroll.worker_signature_date || null,
      startY: y, pageHeight, margin,
    });
  }

  addFooters(doc);
  doc.save(`Nomina_${(payroll.employee_name || 'treballador').replace(/\s/g, '_')}_${MONTHS[(payroll.period_month || 1) - 1]}_${payroll.period_year}.pdf`);
}
