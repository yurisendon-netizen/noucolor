import moment from 'moment';

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const WO_STATUS = { pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado' };
const JUST_TYPES = { baja_medica: 'Baja médica', vacaciones: 'Vacaciones', permiso_personal: 'Permiso personal', otro: 'Otro' };
const JUST_STATUS = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const ENTRY_STATUS = { abierto: 'Abierto', cerrado: 'Cerrado', ausencia_injustificada: 'Ausencia injus.' };

export const REPORT_TYPES = [
  { value: 'partes', label: 'Partes de Trabajo' },
  { value: 'fichajes', label: 'Fichajes' },
  { value: 'justificantes', label: 'Justificantes' },
];

export const REPORT_CONFIG = {
  partes: {
    title: 'Informe de Partes de Trabajo',
    entity: 'WorkOrder',
    sortField: '-date',
    dateField: 'date',
    columns: [
      { label: 'Título', key: 'title', width: 0.26 },
      { label: 'Cliente', key: 'client_name', width: 0.18 },
      { label: 'Empleado', key: 'assigned_name', width: 0.18 },
      { label: 'Fecha', key: 'date', width: 0.14, align: 'center' },
      { label: 'Prioridad', key: 'priority', width: 0.12, align: 'center' },
      { label: 'Estado', key: 'status', width: 0.12, align: 'center' },
    ],
    mapRow: (r) => ({
      title: r.title || '—',
      client_name: r.client_name || '—',
      assigned_name: r.assigned_name || '—',
      date: r.date ? moment(r.date).format('DD/MM/YYYY') : '—',
      priority: PRIORITY_LABELS[r.priority] || r.priority || '—',
      status: WO_STATUS[r.status] || r.status || '—',
    }),
  },
  fichajes: {
    title: 'Informe de Fichajes',
    entity: 'TimeEntry',
    sortField: '-date',
    dateField: 'date',
    columns: [
      { label: 'Trabajador', key: 'employee_name', width: 0.26 },
      { label: 'Fecha', key: 'date', width: 0.14, align: 'center' },
      { label: 'Entrada', key: 'clock_in', width: 0.14, align: 'center' },
      { label: 'Salida', key: 'clock_out', width: 0.14, align: 'center' },
      { label: 'Horas', key: 'total_hours', width: 0.10, align: 'right' },
      { label: 'Extras', key: 'overtime_hours', width: 0.10, align: 'right' },
      { label: 'Estado', key: 'status', width: 0.12, align: 'center' },
    ],
    mapRow: (r) => ({
      employee_name: r.employee_name || '—',
      date: r.date ? moment(r.date).format('DD/MM/YYYY') : '—',
      clock_in: r.clock_in ? moment(r.clock_in).format('HH:mm') : '—',
      clock_out: r.clock_out ? moment(r.clock_out).format('HH:mm') : '—',
      total_hours: `${(Number(r.total_hours) || 0).toFixed(1)}h`,
      overtime_hours: `${(Number(r.overtime_hours) || 0).toFixed(1)}h`,
      status: ENTRY_STATUS[r.status] || r.status || '—',
    }),
  },
  justificantes: {
    title: 'Informe de Justificantes',
    entity: 'Justificante',
    sortField: '-date_from',
    dateField: 'date_from',
    columns: [
      { label: 'Trabajador', key: 'employee_name', width: 0.24 },
      { label: 'Tipo', key: 'type', width: 0.16 },
      { label: 'Desde', key: 'date_from', width: 0.12, align: 'center' },
      { label: 'Hasta', key: 'date_to', width: 0.12, align: 'center' },
      { label: 'Motivo', key: 'reason', width: 0.24 },
      { label: 'Estado', key: 'status', width: 0.12, align: 'center' },
    ],
    mapRow: (r) => ({
      employee_name: r.employee_name || '—',
      type: JUST_TYPES[r.type] || r.type || '—',
      date_from: r.date_from ? moment(r.date_from).format('DD/MM/YYYY') : '—',
      date_to: r.date_to ? moment(r.date_to).format('DD/MM/YYYY') : '—',
      reason: r.reason || '—',
      status: JUST_STATUS[r.status] || r.status || '—',
    }),
  },
};