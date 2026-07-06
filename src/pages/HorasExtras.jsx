import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Edit, Trash2, Check, X, Clock, Euro, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const typeMultipliers = { normal: 1.5, nocturna: 2, festivo: 2.5, urgente: 2 };
const typeLabels = { normal: 'Normal', nocturna: 'Nocturna', festivo: 'Festivo', urgente: 'Urgente' };
const typeColors = {
  normal: 'bg-blue-500/15 text-blue-400',
  nocturna: 'bg-purple-500/15 text-purple-400',
  festivo: 'bg-red-500/15 text-red-400',
  urgente: 'bg-yellow-500/15 text-yellow-400',
};

function calcDuration(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function HorasExtras() {
  const { employee, user, isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', type: 'normal', obra_motivo: '' });

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    try {
      const data = isAdmin
        ? await base44.entities.OvertimeHour.list('-created_date', 200)
        : await base44.entities.OvertimeHour.filter({ employee_id: employee?.id || user?.id }, '-created_date', 100);
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const monthData = useMemo(() => {
    return items.filter(item => {
      if (!item.date) return false;
      const d = moment(item.date);
      return d.month() === month && d.year() === year;
    });
  }, [items, month, year]);

  const summary = useMemo(() => {
    const totalHours = monthData.reduce((sum, i) => sum + (i.duration || 0), 0);
    const totalPay = monthData.filter(i => i.status === 'aprobado').reduce((sum, i) => sum + (i.total || 0), 0);
    const pending = monthData.filter(i => i.status === 'pendiente').length;
    return { totalHours, totalPay, pending };
  }, [monthData]);

  function openCreate() {
    setEditing(null);
    setForm({ date: new Date().toISOString().split('T')[0], start_time: '', end_time: '', type: 'normal', obra_motivo: '' });
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({ date: item.date, start_time: item.start_time, end_time: item.end_time, type: item.type, obra_motivo: item.obra_motivo || '' });
    setDialogOpen(true);
  }

  async function handleSave() {
    const duration = calcDuration(form.start_time, form.end_time);
    if (duration <= 0) {
      toast({ title: 'Error', description: 'La hora de fin debe ser posterior a la de inicio', variant: 'destructive' });
      return;
    }
    const precioHora = employee?.precioHora || 0;
    const multiplier = typeMultipliers[form.type];
    const total = duration * precioHora * multiplier;
    const payload = {
      employee_id: employee?.id || user?.id,
      employee_name: employee?.full_name || user?.full_name || '',
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      duration: parseFloat(duration.toFixed(2)),
      type: form.type,
      obra_motivo: form.obra_motivo,
      precio_hora: precioHora,
      multiplier,
      total: parseFloat(total.toFixed(2)),
      status: editing?.status || 'pendiente',
    };
    try {
      if (editing) {
        await base44.entities.OvertimeHour.update(editing.id, payload);
        toast({ title: 'Hora extra actualizada' });
      } else {
        await base44.entities.OvertimeHour.create(payload);
        toast({ title: 'Hora extra registrada' });
      }
      setDialogOpen(false);
      loadItems();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function handleApproval(id, status) {
    await base44.entities.OvertimeHour.update(id, { status });
    toast({ title: `Hora extra ${status === 'aprobado' ? 'aprobada' : 'rechazada'}` });
    loadItems();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta hora extra?')) return;
    await base44.entities.OvertimeHour.delete(id);
    toast({ title: 'Hora extra eliminada' });
    loadItems();
  }

  const columns = [
    ...(isAdmin ? [{ key: 'employee_name', label: 'Empleado', render: r => <span className="font-medium">{r.employee_name}</span> }] : []),
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'start_time', label: 'Inicio' },
    { key: 'end_time', label: 'Fin' },
    { key: 'duration', label: 'Duración', render: r => `${r.duration}h` },
    { key: 'type', label: 'Tipo', render: r => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[r.type]}`}>{typeLabels[r.type]}</span> },
    { key: 'precio_hora', label: 'Precio/Hora', render: r => `${(r.precio_hora || 0).toFixed(2)} €` },
    { key: 'total', label: 'Total', render: r => <span className="font-semibold text-emerald-400">{(r.total || 0).toFixed(2)} €</span> },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  const previewDuration = form.start_time && form.end_time ? calcDuration(form.start_time, form.end_time) : 0;
  const previewPrecio = (employee?.precioHora || 0) * typeMultipliers[form.type];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Horas Extras"
        subtitle="Registro y gestión de horas extras"
        actions={
          <Button onClick={openCreate} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            <Plus size={18} /> Registrar Hora Extra
          </Button>
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
          <SummaryCard icon={Clock} label="Total Horas Extras" value={`${summary.totalHours.toFixed(2)}h`} color="bg-blue-500/15 text-blue-400" />
          <SummaryCard icon={Euro} label="Total a Pagar (Aprobado)" value={`${summary.totalPay.toFixed(2)} €`} color="bg-emerald-500/15 text-emerald-400" />
          <SummaryCard icon={Timer} label="Pendientes" value={summary.pending} color="bg-yellow-500/15 text-yellow-400" />
        </div>
        <div className="flex gap-2">
          <ResponsiveSelect
            value={String(month)}
            onValueChange={v => setMonth(Number(v))}
            options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
            className="w-40 bg-secondary border-border"
          />
          <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-28 bg-secondary border-border" />
        </div>
      </div>

      <DataTable
        data={monthData}
        onRefresh={loadItems}
        columns={columns}
        searchField={isAdmin ? 'employee_name' : 'obra_motivo'}
        filterField="status"
        filterOptions={[
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'aprobado', label: 'Aprobado' },
          { value: 'rechazado', label: 'Rechazado' },
        ]}
        emptyMessage="No hay horas extras registradas este mes"
        actions={(row) => (
          row.status === 'pendiente' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="text-blue-400 hover:bg-blue-500/10">
                <Edit size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-red-400 hover:bg-red-500/10">
                <Trash2 size={16} />
              </Button>
              {isAdmin && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => handleApproval(row.id, 'aprobado')} className="text-emerald-400 hover:bg-emerald-500/10">
                    <Check size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleApproval(row.id, 'rechazado')} className="text-red-400 hover:bg-red-500/10">
                    <X size={16} />
                  </Button>
                </>
              )}
            </>
          ) : null
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar Hora Extra' : 'Registrar Hora Extra'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha</label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hora inicio</label>
                <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Hora fin</label>
                <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo</label>
              <ResponsiveSelect
                value={form.type}
                onValueChange={v => setForm({ ...form, type: v })}
                options={[
                  { value: 'normal', label: 'Normal (x1.5)' },
                  { value: 'nocturna', label: 'Nocturna (x2)' },
                  { value: 'festivo', label: 'Festivo (x2.5)' },
                  { value: 'urgente', label: 'Urgente (x2)' },
                ]}
                className="bg-secondary border-border"
              />
            </div>
            <Textarea placeholder="Obra / Motivo" value={form.obra_motivo} onChange={e => setForm({ ...form, obra_motivo: e.target.value })} className="bg-secondary border-border" />
            {previewDuration > 0 && (
              <div className="p-3 rounded-lg bg-secondary/50 text-sm text-muted-foreground">
                Duración: <span className="text-foreground font-medium">{previewDuration.toFixed(2)}h</span> · Precio: <span className="text-foreground font-medium">{previewPrecio.toFixed(2)} €/h</span> · Total: <span className="text-emerald-400 font-semibold">{(previewDuration * previewPrecio).toFixed(2)} €</span>
              </div>
            )}
            <Button onClick={handleSave} disabled={!form.date || !form.start_time || !form.end_time} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              {editing ? 'Guardar Cambios' : 'Registrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}