import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const INCIDENT_LABELS = {
  entrada_tardia: 'Entrada tardía',
  sin_fichar: 'Sin fichar'
};

const JUSTIFICANTE_LABELS = {
  baja_medica: 'Baja médica',
  vacaciones: 'Vacaciones',
  permiso_personal: 'Permiso personal',
  otro: 'Otro'
};

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function buildEmployeeSection(emp, monthEntries, monthOvertimes, monthIncumplimientos, monthJustificantes, monthPayroll, monthWorkOrders) {
  const totalHours = monthEntries.reduce((s, e) => s + (e.total_hours || 0), 0);
  const overtimeHours = monthEntries.reduce((s, e) => s + (e.overtime_hours || 0), 0);

  let s = `<div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #eee;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #f59e0b;">
      <div style="background:#f59e0b;color:#fff;font-weight:700;font-size:14px;padding:4px 10px;border-radius:6px;">${(emp.full_name || '').split(' ')[0]}</div>
      <span style="color:#1a1a1a;font-weight:700;font-size:16px;">${emp.full_name}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#999;width:130px;border-bottom:1px solid #eee;">Puesto</td><td style="padding:6px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #eee;">${emp.position || '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">Precio/hora</td><td style="padding:6px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #eee;">${(emp.precioHora || 0).toFixed(2)} €</td></tr>
      <tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">Salario base</td><td style="padding:6px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #eee;">${(emp.base_salary || 0).toFixed(2)} €</td></tr>
      <tr><td style="padding:6px 0;color:#999;">Días fichados</td><td style="padding:6px 0;font-weight:600;color:#1a1a1a;">${monthEntries.length}</td></tr>
    </table>`;

  // Hours
  s += `<h4 style="color:#1a1a1a;font-size:13px;margin:16px 0 8px;">📋 Registros de horas</h4>`;
  if (monthEntries.length > 0) {
    s += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
      <thead><tr style="background:#f59e0b;color:#fff;">
        <th style="padding:6px;text-align:left;">Fecha</th>
        <th style="padding:6px;text-align:center;">Entrada</th>
        <th style="padding:6px;text-align:center;">Salida</th>
        <th style="padding:6px;text-align:right;">Horas</th>
        <th style="padding:6px;text-align:right;">Extras</th>
      </tr></thead><tbody>`;
    for (const e of monthEntries) {
      s += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 6px;">${fmtDate(e.date)}</td>
        <td style="padding:5px 6px;text-align:center;">${fmtTime(e.clock_in)}</td>
        <td style="padding:5px 6px;text-align:center;">${e.clock_out ? fmtTime(e.clock_out) : '-'}</td>
        <td style="padding:5px 6px;text-align:right;">${(e.total_hours || 0).toFixed(1)}h</td>
        <td style="padding:5px 6px;text-align:right;color:#d97706;">${(e.overtime_hours || 0).toFixed(1)}h</td>
      </tr>`;
    }
    s += `</tbody></table>`;
    s += `<div style="background:#fffbeb;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="color:#666;">Total horas</span><strong>${totalHours.toFixed(1)}h</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#666;">Horas extras</span><strong style="color:#d97706;">${overtimeHours.toFixed(1)}h</strong></div>
    </div>`;
  } else {
    s += `<p style="color:#999;font-size:12px;margin-bottom:14px;">Sin registros.</p>`;
  }

  // Overtime detail
  if (monthOvertimes.length > 0) {
    s += `<h4 style="color:#1a1a1a;font-size:13px;margin:14px 0 8px;">⏱️ Horas extras detalladas</h4>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#f59e0b;color:#fff;">
        <th style="padding:6px;text-align:left;">Fecha</th>
        <th style="padding:6px;text-align:center;">Horas</th>
        <th style="padding:6px;text-align:left;">Motivo</th>
        <th style="padding:6px;text-align:right;">Importe</th>
      </tr></thead><tbody>`;
    for (const o of monthOvertimes) {
      s += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 6px;">${fmtDate(o.date)}</td>
        <td style="padding:5px 6px;text-align:center;">${(o.duration || 0).toFixed(1)}h</td>
        <td style="padding:5px 6px;">${o.obra_motivo || '-'}</td>
        <td style="padding:5px 6px;text-align:right;">${(o.total || 0).toFixed(2)} €</td>
      </tr>`;
    }
    s += `</tbody></table>`;
  }

  // Incidents
  s += `<h4 style="color:#1a1a1a;font-size:13px;margin:14px 0 8px;">⚠️ Incidencias</h4>`;
  if (monthIncumplimientos.length > 0) {
    s += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#f59e0b;color:#fff;">
        <th style="padding:6px;text-align:left;">Fecha</th>
        <th style="padding:6px;text-align:left;">Tipo</th>
        <th style="padding:6px;text-align:left;">Descripción</th>
      </tr></thead><tbody>`;
    for (const i of monthIncumplimientos) {
      s += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 6px;">${fmtDate(i.date)}</td>
        <td style="padding:5px 6px;">${INCIDENT_LABELS[i.type] || i.type}</td>
        <td style="padding:5px 6px;">${i.description || '-'}</td>
      </tr>`;
    }
    s += `</tbody></table>`;
  } else {
    s += `<p style="color:#999;font-size:12px;margin-bottom:14px;">Sin incidencias. ✓</p>`;
  }

  // Justificantes
  if (monthJustificantes.length > 0) {
    s += `<h4 style="color:#1a1a1a;font-size:13px;margin:14px 0 8px;">📝 Justificantes</h4>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#f59e0b;color:#fff;">
        <th style="padding:6px;text-align:left;">Tipo</th>
        <th style="padding:6px;text-align:left;">Desde</th>
        <th style="padding:6px;text-align:left;">Hasta</th>
        <th style="padding:6px;text-align:left;">Motivo</th>
      </tr></thead><tbody>`;
    for (const j of monthJustificantes) {
      s += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 6px;">${JUSTIFICANTE_LABELS[j.type] || j.type}</td>
        <td style="padding:5px 6px;">${fmtDate(j.date_from)}</td>
        <td style="padding:5px 6px;">${fmtDate(j.date_to)}</td>
        <td style="padding:5px 6px;">${j.reason || '-'}</td>
      </tr>`;
    }
    s += `</tbody></table>`;
  }

  // Work orders
  if (monthWorkOrders.length > 0) {
    s += `<h4 style="color:#1a1a1a;font-size:13px;margin:14px 0 8px;">🛠️ Partes de trabajo</h4>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#f59e0b;color:#fff;">
        <th style="padding:6px;text-align:left;">Fecha</th>
        <th style="padding:6px;text-align:left;">Cliente</th>
        <th style="padding:6px;text-align:left;">Título</th>
      </tr></thead><tbody>`;
    for (const w of monthWorkOrders) {
      s += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 6px;">${fmtDate(w.date)}</td>
        <td style="padding:5px 6px;">${w.client_name || '-'}</td>
        <td style="padding:5px 6px;">${w.title || '-'}</td>
      </tr>`;
    }
    s += `</tbody></table>`;
  }

  // Payroll
  s += `<h4 style="color:#1a1a1a;font-size:13px;margin:14px 0 8px;">💰 Nómina</h4>`;
  if (monthPayroll) {
    s += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
      <tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">Salario base</td><td style="padding:6px 0;text-align:right;font-weight:600;border-bottom:1px solid #eee;">${(monthPayroll.base_salary || 0).toFixed(2)} €</td></tr>
      <tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">Horas extras (${(monthPayroll.overtime_hours || 0).toFixed(1)}h)</td><td style="padding:6px 0;text-align:right;font-weight:600;border-bottom:1px solid #eee;">${(monthPayroll.overtime_pay || 0).toFixed(2)} €</td></tr>
      ${monthPayroll.bonus ? `<tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">Bonificaciones</td><td style="padding:6px 0;text-align:right;font-weight:600;border-bottom:1px solid #eee;">${monthPayroll.bonus.toFixed(2)} €</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">CASS (6.5%)</td><td style="padding:6px 0;text-align:right;color:#dc2626;border-bottom:1px solid #eee;">-${(monthPayroll.cass_employee || 0).toFixed(2)} €</td></tr>
      ${monthPayroll.irpf ? `<tr><td style="padding:6px 0;color:#999;border-bottom:1px solid #eee;">IRPF</td><td style="padding:6px 0;text-align:right;color:#dc2626;border-bottom:1px solid #eee;">-${monthPayroll.irpf.toFixed(2)} €</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#1a1a1a;font-weight:700;">Salario neto</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:800;color:#d97706;">${(monthPayroll.net_salary || 0).toFixed(2)} €</td></tr>
    </table>`;
  } else {
    s += `<p style="color:#999;font-size:12px;margin-bottom:14px;">Nómina no generada.</p>`;
  }

  s += `</div>`;
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch {}

    const now = new Date();
    let period_month = body.period_month || (now.getMonth() === 0 ? 12 : now.getMonth());
    let period_year = body.period_year || (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

    const periodLabel = `${MONTHS[period_month - 1]} ${period_year}`;

    // Recipients: admin users + Yuri Sendon Risco
    const [admins, employees] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ role: 'admin' }),
      base44.asServiceRole.entities.Employee.filter({ is_active: true })
    ]);

    const recipientEmails = new Set();
    for (const a of admins) {
      if (a.email) recipientEmails.add(a.email.toLowerCase());
    }
    const yuri = employees.find(e => (e.full_name || '').toLowerCase().includes('yuri sendon'));
    if (yuri && yuri.email) recipientEmails.add(yuri.email.toLowerCase());

    if (recipientEmails.size === 0) {
      return Response.json({ success: false, message: 'No hay destinatarios válidos' });
    }

    const appBaseUrl = req.headers.get("origin") || '';
    const appLink = appBaseUrl ? `${appBaseUrl.replace(/\/$/, '')}/nominas` : '';

    const inPeriod = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr + 'T00:00:00');
      return d.getMonth() + 1 === period_month && d.getFullYear() === period_year;
    };

    let allSections = '';

    for (const emp of employees) {
      const [timeEntries, overtimes, incumplimientos, justificantes, payrolls, workOrders] = await Promise.all([
        base44.asServiceRole.entities.TimeEntry.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.OvertimeHour.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.Justificante.filter({ employee_id: emp.id }, '-created_date', 200),
        base44.asServiceRole.entities.Payroll.filter({ employee_id: emp.id }, '-created_date', 200),
        base44.asServiceRole.entities.WorkOrder.filter({ assigned_to: emp.id }, '-date', 200),
      ]);

      const monthEntries = timeEntries.filter(e => inPeriod(e.date));
      const monthOvertimes = overtimes.filter(o => inPeriod(o.date));
      const monthIncumplimientos = incumplimientos.filter(i => inPeriod(i.date));
      const monthJustificantes = justificantes.filter(j => inPeriod(j.date_from));
      const monthPayroll = payrolls.find(p => p.period_month === period_month && p.period_year === period_year);
      const monthWorkOrders = workOrders.filter(w => inPeriod(w.date));

      allSections += buildEmployeeSection(emp, monthEntries, monthOvertimes, monthIncumplimientos, monthJustificantes, monthPayroll, monthWorkOrders);
    }

    const buttonHtml = appLink
      ? `<a href="${appLink}" style="display:inline-block;background:#f59e0b;color:#1a1a1a;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:8px 0 16px;">Acceder a la plataforma</a>`
      : '';

    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:24px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:20px;padding:8px 14px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:13px;">Resumen mensual</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">📊 Resumen mensual — ${periodLabel}</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">A continuación encontrará el detalle completo de todos los trabajadores del mes de <strong>${periodLabel}</strong>.</p>
  ${allSections}
  ${buttonHtml}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor · Mensaje generado automáticamente.</p>
  </div>
</div>`;

    const results = [];
    for (const email of recipientEmails) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Noucolor',
          subject: `Noucolor - Resumen mensual de ${periodLabel}`,
          body: html
        });
        results.push({ email, sent: true });
      } catch (err) {
        results.push({ email, error: err.message });
      }
    }

    return Response.json({ success: true, period: periodLabel, recipients: [...recipientEmails], results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});