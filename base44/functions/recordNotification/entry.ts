import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Disparada por automatizaciones de entidad (create/update) sobre TimeEntry,
// WorkOrder, OvertimeHour, Justificante, Payroll y EmployeeLocation. Crea un
// registro en Notification para el centro de notificaciones de admins. No
// requiere sesión de usuario: corre en service role a partir del propio evento.

const JUSTIFICANTE_LABELS = {
  baja_medica: 'Baja médica',
  vacaciones: 'Vacaciones',
  permiso_personal: 'Permiso personal',
  otro: 'Otro'
};

async function createNotification(base44, n) {
  await base44.asServiceRole.entities.Notification.create({
    type: n.type,
    title: n.title || n.type,
    message: n.message || '',
    employee_name: n.employee_name || '',
    employee_id: n.employee_id || '',
    read: false
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const event = payload.event || {};
    const entityName = event.entity_name;
    const eventType = event.type;
    let data = payload.data;
    const oldData = payload.old_data;
    const changedFields = payload.changed_fields || [];

    // Si el registro era demasiado grande, lo recuperamos por id.
    if (payload.payload_too_large && event.entity_id && entityName) {
      try {
        data = await base44.asServiceRole.entities[entityName].get(event.entity_id);
      } catch { data = null; }
    }
    if (!data) return Response.json({ success: false, reason: 'sin datos' });

    switch (entityName) {
      case 'TimeEntry': {
        if (eventType === 'create' && data.status === 'abierto') {
          await createNotification(base44, {
            type: 'fichaje_entrada',
            title: 'Fichaje de entrada',
            message: `${data.employee_name} fichó entrada el ${data.date}`,
            employee_name: data.employee_name,
            employee_id: data.employee_id
          });
        } else if (eventType === 'update') {
          const wasOpen = !oldData || !oldData.clock_out;
          const nowClosed = !!data.clock_out && data.status === 'cerrado';
          if (wasOpen && nowClosed) {
            await createNotification(base44, {
              type: 'fichaje_salida',
              title: 'Fichaje de salida',
              message: `${data.employee_name} fichó salida el ${data.date}`,
              employee_name: data.employee_name,
              employee_id: data.employee_id
            });
          }
        }
        break;
      }
      case 'WorkOrder': {
        const who = data.assigned_name || data.encargado_obra || 'Sin asignar';
        await createNotification(base44, {
          type: 'parte_trabajo',
          title: 'Nuevo parte de trabajo',
          message: `${who} — ${data.title}${data.client_name ? ` (Cliente: ${data.client_name})` : ''}`,
          employee_name: who,
          employee_id: data.assigned_to || ''
        });
        break;
      }
      case 'OvertimeHour': {
        await createNotification(base44, {
          type: 'hora_extra',
          title: 'Hora extra registrada',
          message: `${data.employee_name} registró ${data.duration || 0}h extra${data.obra_motivo ? ` — ${data.obra_motivo}` : ''}`,
          employee_name: data.employee_name,
          employee_id: data.employee_id
        });
        break;
      }
      case 'Justificante': {
        await createNotification(base44, {
          type: 'justificante',
          title: 'Nuevo justificante',
          message: `${data.employee_name} subió un justificante (${JUSTIFICANTE_LABELS[data.type] || data.type || 'otro'})`,
          employee_name: data.employee_name,
          employee_id: data.employee_id
        });
        break;
      }
      case 'Payroll': {
        await createNotification(base44, {
          type: 'nomina',
          title: 'Nómina generada',
          message: `Nómina de ${data.employee_name} (${data.period_month}/${data.period_year})`,
          employee_name: data.employee_name,
          employee_id: data.employee_id
        });
        break;
      }
      case 'EmployeeLocation': {
        const moved = eventType === 'create' || changedFields.includes('latitude') || changedFields.includes('longitude');
        if (moved) {
          await createNotification(base44, {
            type: 'geolocalizacion',
            title: 'Nueva ubicación',
            message: `${data.employee_name} actualizó su ubicación`,
            employee_name: data.employee_name,
            employee_id: data.employee_id
          });
        }
        break;
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});