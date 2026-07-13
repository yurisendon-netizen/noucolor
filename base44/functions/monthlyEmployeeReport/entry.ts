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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch {}

    const now = new Date();
    let period_month = body.period_month || (now.getMonth() === 0 ? 12 : now.getMonth());
    let period_year = body.period_year || (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

    const employees = await base44.asServiceRole.entities.Employee.filter({ is_active: true });
    const origin = new URL(req.url).origin;
    const appLink = `${origin}/nominas`;
    const periodLabel = `${MONTHS[period_month - 1]} ${period_year}`;

    const results = [];

    for (const emp of employees) {
      if (!emp.email) {
        results.push({ employee: emp.full_name, skipped: 'sin email' });
        continue;
      }

      const [timeEntries, overtimes, incumplimientos, justificantes, payrolls, workOrders] = await Promise.all([
        base44.asServiceRole.entities.TimeEntry.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.OvertimeHour.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.Incumplimiento.filter({ employee_id: emp.id }, '-date', 200),
        base44.asServiceRole.entities.Justificante.filter({ employee_id: emp.id }, '-created_date', 200),
        base44.asServiceRole.entities.Payroll.filter({ employee_id: emp.id }, '-created_date', 200),
        base44.asServiceRole.entities.WorkOrder.filter({ assigned_to: emp.id }, '-date', 200),
      ]);

      const inPeriod = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr + 'T00:00:00');
        return d.getMonth() + 1 === period_month && d.getFullYear() === period_year;
      };

      const monthEntries = timeEntries.filter(e => inPeriod(e.date));
      const monthOvertimes = overtimes.filter(o => inPeriod(o.date));
      const monthIncumplimientos = incumplimientos.filter(i => inPeriod(i.date));
      const monthJustificantes = justificantes.filter(j => inPeriod(j.date_from));
      const monthPayroll = payrolls.find(p => p.period_month === period_month && p.period_year === period_year);
      const monthWorkOrders = workOrders.filter(w => inPeriod(w.date));

      const totalHours = monthEntries.reduce((s, e) => s + (e.total_hours || 0), 0);
      const overtimeHours = monthEntries.reduce((s, e) => s + (e.overtime_hours || 0), 0);
      const overtimeTotal = monthOvertimes.reduce((s, o) => s + (o.total || 0), 0);

      const firstName = (emp.full_name || '').split(' ')[0] || 'trabajador';

      // Build HTML sections
      let sections = '';

      // Worker info
      sections += `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#999;width:150px;border-bottom:1px solid #f0f0f0;">Puesto</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">${emp.position || '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">Precio por hora</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">${(emp.precioHora || 0).toFixed(2)} €</td></tr>
        <tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">Salario base</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">${(emp.base_salary || 0).toFixed(2)} €</td></tr>
        <tr><td style="padding:8px 0;color:#999;">Días fichados</td><td style="padding:8px 0;font-weight:600;color:#1a1a1a;">${monthEntries.length}</td></tr>
      </table>`;

      // Hours summary
      sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">📋 Registros de horas</h3>`;
      if (monthEntries.length > 0) {
        sections += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
          <thead><tr style="background:#f59e0b;color:#fff;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:center;">Entrada</th>
            <th style="padding:8px;text-align:center;">Salida</th>
            <th style="padding:8px;text-align:right;">Horas</th>
            <th style="padding:8px;text-align:right;">Extras</th>
          </tr></thead><tbody>`;
        for (const e of monthEntries) {
          sections += `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 8px;">${fmtDate(e.date)}</td>
            <td style="padding:7px 8px;text-align:center;">${fmtTime(e.clock_in)}</td>
            <td style="padding:7px 8px;text-align:center;">${e.clock_out ? fmtTime(e.clock_out) : '-'}</td>
            <td style="padding:7px 8px;text-align:right;">${(e.total_hours || 0).toFixed(1)}h</td>
            <td style="padding:7px 8px;text-align:right;color:#d97706;">${(e.overtime_hours || 0).toFixed(1)}h</td>
          </tr>`;
        }
        sections += `</tbody></table>`;
        sections += `<div style="background:#fffbeb;border-radius:6px;padding:12px 16px;font-size:14px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#666;">Total horas regulares</span><strong>${totalHours.toFixed(1)}h</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#666;">Total horas extras</span><strong style="color:#d97706;">${overtimeHours.toFixed(1)}h</strong></div>
        </div>`;
      } else {
        sections += `<p style="color:#999;font-size:13px;margin-bottom:20px;">No hay registros de horas en este período.</p>`;
      }

      // Overtime detail
      if (monthOvertimes.length > 0) {
        sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">⏱️ Horas extras detalladas</h3>`;
        sections += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr style="background:#f59e0b;color:#fff;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:center;">Horas</th>
            <th style="padding:8px;text-align:left;">Motivo</th>
            <th style="padding:8px;text-align:right;">Importe</th>
          </tr></thead><tbody>`;
        for (const o of monthOvertimes) {
          sections += `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 8px;">${fmtDate(o.date)}</td>
            <td style="padding:7px 8px;text-align:center;">${(o.duration || 0).toFixed(1)}h</td>
            <td style="padding:7px 8px;">${o.obra_motivo || '-'}</td>
            <td style="padding:7px 8px;text-align:right;">${(o.total || 0).toFixed(2)} €</td>
          </tr>`;
        }
        sections += `</tbody></table>`;
      }

      // Incidents
      sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">⚠️ Incidencias</h3>`;
      if (monthIncumplimientos.length > 0) {
        sections += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr style="background:#f59e0b;color:#fff;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:left;">Tipo</th>
            <th style="padding:8px;text-align:left;">Descripción</th>
          </tr></thead><tbody>`;
        for (const i of monthIncumplimientos) {
          sections += `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 8px;">${fmtDate(i.date)}</td>
            <td style="padding:7px 8px;">${INCIDENT_LABELS[i.type] || i.type}</td>
            <td style="padding:7px 8px;">${i.description || '-'}</td>
          </tr>`;
        }
        sections += `</tbody></table>`;
      } else {
        sections += `<p style="color:#999;font-size:13px;margin-bottom:20px;">Sin incidencias en este período. ✓</p>`;
      }

      // Justificantes
      if (monthJustificantes.length > 0) {
        sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">📝 Justificantes</h3>`;
        sections += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr style="background:#f59e0b;color:#fff;">
            <th style="padding:8px;text-align:left;">Tipo</th>
            <th style="padding:8px;text-align:left;">Desde</th>
            <th style="padding:8px;text-align:left;">Hasta</th>
            <th style="padding:8px;text-align:left;">Motivo</th>
          </tr></thead><tbody>`;
        for (const j of monthJustificantes) {
          sections += `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 8px;">${JUSTIFICANTE_LABELS[j.type] || j.type}</td>
            <td style="padding:7px 8px;">${fmtDate(j.date_from)}</td>
            <td style="padding:7px 8px;">${fmtDate(j.date_to)}</td>
            <td style="padding:7px 8px;">${j.reason || '-'}</td>
          </tr>`;
        }
        sections += `</tbody></table>`;
      }

      // Work orders
      if (monthWorkOrders.length > 0) {
        sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">🛠️ Partes de trabajo asignados</h3>`;
        sections += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr style="background:#f59e0b;color:#fff;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:left;">Cliente</th>
            <th style="padding:8px;text-align:left;">Título</th>
          </tr></thead><tbody>`;
        for (const w of monthWorkOrders) {
          sections += `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:7px 8px;">${fmtDate(w.date)}</td>
            <td style="padding:7px 8px;">${w.client_name || '-'}</td>
            <td style="padding:7px 8px;">${w.title || '-'}</td>
          </tr>`;
        }
        sections += `</tbody></table>`;
      }

      // Payroll summary
      sections += `<h3 style="color:#1a1a1a;font-size:15px;margin:24px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">💰 Nómina</h3>`;
      if (monthPayroll) {
        sections += `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">Salario base</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0;">${(monthPayroll.base_salary || 0).toFixed(2)} €</td></tr>
          <tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">Horas extras (${(monthPayroll.overtime_hours || 0).toFixed(1)}h)</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0;">${(monthPayroll.overtime_pay || 0).toFixed(2)} €</td></tr>
          ${monthPayroll.bonus ? `<tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">Bonificaciones</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0;">${monthPayroll.bonus.toFixed(2)} €</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">CASS (6.5%)</td><td style="padding:8px 0;text-align:right;color:#dc2626;border-bottom:1px solid #f0f0f0;">-${(monthPayroll.cass_employee || 0).toFixed(2)} €</td></tr>
          ${monthPayroll.irpf ? `<tr><td style="padding:8px 0;color:#999;border-bottom:1px solid #f0f0f0;">IRPF</td><td style="padding:8px 0;text-align:right;color:#dc2626;border-bottom:1px solid #f0f0f0;">-${monthPayroll.irpf.toFixed(2)} €</td></tr>` : ''}
          <tr><td style="padding:10px 0;color:#1a1a1a;font-weight:700;">Salario neto</td><td style="padding:10px 0;text-align:right;font-size:18px;font-weight:800;color:#d97706;">${(monthPayroll.net_salary || 0).toFixed(2)} €</td></tr>
        </table>`;
      } else {
        sections += `<p style="color:#999;font-size:13px;margin-bottom:20px;">La nómina de este período aún no ha sido generada.</p>`;
      }

      const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);height:4px;border-radius:2px;margin-bottom:24px;"></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
    <div style="background:#f59e0b;color:#fff;font-weight:800;font-size:20px;padding:8px 14px;border-radius:8px;letter-spacing:1px;">NOUCOLOR</div>
    <span style="color:#888;font-size:13px;">Pro · Resumen mensual</span>
  </div>
  <h2 style="color:#1a1a1a;margin:0 0 8px;">📊 Resumen mensual — ${periodLabel}</h2>
  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">Hola <strong>${firstName}</strong>, aquí tienes el resumen completo de tu actividad del mes de <strong>${periodLabel}</strong>.</p>
  ${sections}
  <a href="${appLink}" style="display:inline-block;background:#f59e0b;color:#1a1a1a;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:8px 0 16px;">Acceder a la plataforma</a>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;">
    <p style="color:#aaa;font-size:11px;margin:0;">Confidencial - Noucolor Pro · Mensaje generado automáticamente.</p>
  </div>
</div>`;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: emp.email,
          from_name: 'Noucolor Pro',
          subject: `Noucolor - Tu resumen mensual de ${periodLabel}`,
          body: html
        });
        results.push({ employee: emp.full_name, email: emp.email, sent: true });
      } catch (err) {
        results.push({ employee: emp.full_name, email: emp.email, error: err.message });
      }
    }

    return Response.json({ success: true, period: periodLabel, total: employees.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});