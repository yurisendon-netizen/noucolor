import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';
import { Plus, Trash2, CheckCircle, X, Download, Loader2 } from 'lucide-react';
import { generateWorkOrderPdf } from '@/components/parts/WorkOrderPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/ui/responsive-select';
import SignaturePadInput from '@/components/parts/SignaturePadInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import WorkOrderFilters from '@/components/parts/WorkOrderFilters';
import moment from 'moment';

export default function PartesTrabajo() {
  const { employee, user, isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ employee: '', client: '', dateFrom: '', dateTo: '' });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const emptyForm = { title: '', description: '', client_name: '', date: '', priority: 'media', materials: '', notes: '', encargado_obra: '', obra_id: '' };
  const [form, setForm] = useState(emptyForm);
  const [obras, setObras] = useState([]);
  const [firmaDataUrl, setFirmaDataUrl] = useState(null);
  const [creating, setCreating] = useState(false);
  const [workers, setWorkers] = useState([]);
  const emptyHoras = () => [{ employee_id: employee?.id || '', horas: '8' }];
  const [horas, setHoras] = useState(emptyHoras);

  useEffect(() => {
    authInvoke('trackTime', { operation: 'listWorkers' })
      .then(res => setWorkers(res.data?.workers || []))
      .catch(() => setWorkers([]));
  }, []);

  // Obras abiertas del Balance de Obras, para vincular el parte a su obra.
  useEffect(() => {
    if (!dialogOpen) return;
    authInvoke('balanceObras', { operation: 'listObrasAbiertas' })
      .then(res => setObras(res.data?.obras || []))
      .catch(() => setObras([]));
  }, [dialogOpen]);

  function selectObra(id) {
    const o = obras.find(x => x.id === id);
    setForm(f => ({
      ...f,
      obra_id: id,
      title: o && !f.title ? o.nombre : f.title,
      client_name: o && !f.client_name ? o.cliente : f.client_name,
    }));
  }

  // Al abrir el formulario, el propio trabajador aparece ya en la primera fila.
  useEffect(() => {
    if (dialogOpen) setHoras(h => (h.length === 1 && !h[0].employee_id ? emptyHoras() : h));
  }, [dialogOpen, employee?.id]);

  const parseHoras = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  const validHoras = horas
    .map(h => ({ ...h, employee_name: workers.find(w => w.id === h.employee_id)?.full_name || '', horas: parseHoras(h.horas) }))
    .filter(h => h.employee_name && h.horas > 0 && h.horas <= 24);
  const totalHoras = Math.round(validHoras.reduce((s, h) => s + h.horas, 0) * 100) / 100;

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    try {
      const data = await base44.entities.WorkOrder.list('-created_date', 100);
      setOrders(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      // Se crea en el servidor (los operarios no tienen permiso directo sobre la tabla).
      const res = await authInvoke('trackTime', {
        operation: 'createWorkOrder',
        workOrder: { ...form, horas_trabajadas: validHoras },
        firmaDataUrl: firmaDataUrl || null,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ variant: 'success', title: 'Parte creado correctamente' });
      setDialogOpen(false);
      setForm(emptyForm);
      setHoras(emptyHoras());
      setFirmaDataUrl(null);
      loadOrders();
    } catch (e) {
      toast({ title: 'Error al crear parte', description: e?.response?.data?.error || e?.message || 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  function dataUrlToFile(dataUrl, filename) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new File([u8], filename, { type: mime });
  }

  async function handleStatusChange(id, status) {
    const prev = orders;
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
    try {
      await authInvoke('trackTime', { operation: 'updateWorkOrderStatus', workOrderId: id, status });
      toast({ variant: 'success', title: `Estado actualizado a ${status === 'completado' ? 'Completado' : 'Pendiente'}` });
    } catch (e) {
      setOrders(prev);
      toast({ title: 'Error al actualizar el estado', variant: 'destructive' });
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este parte de trabajo?')) return;
    const prev = orders;
    setOrders(orders.filter(o => o.id !== id));
    try {
      await authInvoke('trackTime', { operation: 'deleteWorkOrder', workOrderId: id });
      toast({ variant: 'success', title: 'Parte eliminado' });
    } catch (e) {
      setOrders(prev);
      toast({ title: 'Error al eliminar el parte', variant: 'destructive' });
    }
  }

  async function handleDownloadPdf(order) {
    setDownloadingId(order.id);
    try {
      await generateWorkOrderPdf(order);
      toast({ variant: 'success', title: 'PDF generado correctamente' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error al generar el PDF', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (filters.employee) {
        const s = filters.employee.toLowerCase();
        if (!String(o.assigned_name || '').toLowerCase().includes(s)) return false;
      }
      if (filters.client) {
        const s = filters.client.toLowerCase();
        if (!String(o.client_name || '').toLowerCase().includes(s)) return false;
      }
      if (filters.dateFrom && o.date && o.date < filters.dateFrom) return false;
      if (filters.dateTo && o.date && o.date > filters.dateTo) return false;
      return true;
    });
  }, [orders, filters]);

  const columns = [
    { key: 'title', label: 'Título', render: r => <span className="font-medium">{r.title}</span> },
    { key: 'client_name', label: 'Cliente' },
    { key: 'assigned_name', label: 'Empleado' },
    { key: 'date', label: 'Fecha', render: r => moment(r.date).format('DD/MM/YYYY') },
    { key: 'total_horas', label: 'Horas', render: r => (r.total_horas ? `${r.total_horas} h` : '—') },
    { key: 'priority', label: 'Prioridad', render: r => <StatusBadge status={r.priority} /> },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Partes de Trabajo"
        subtitle="Gestiona los partes de trabajo y su estado"
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus size={18} /> Nuevo Parte
          </Button>
        }
      />

      <WorkOrderFilters filters={filters} onChange={setFilters} />

      <DataTable
        data={filteredOrders}
        onRefresh={loadOrders}
        columns={columns}
        filterField="status"
        filterOptions={[
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'en_progreso', label: 'En Progreso' },
          { value: 'completado', label: 'Completado' },
        ]}
        emptyMessage="No hay partes de trabajo"
        actions={(row) => (
          <>
            {row.status !== 'completado' && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(row.id, 'completado')} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                <CheckCircle size={16} />
              </Button>
            )}
            {row.status === 'completado' && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(row.id, 'pendiente')} className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10">
                <X size={16} />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(row)} disabled={downloadingId === row.id} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
              {downloadingId === row.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <Trash2 size={16} />
            </Button>
          </>
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Parte de Trabajo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {obras.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Obra</label>
                <select
                  value={form.obra_id}
                  onChange={e => selectObra(e.target.value)}
                  className="w-full h-10 rounded-md bg-secondary border border-border px-2 text-sm"
                >
                  <option value="">Sin obra asignada</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}{o.cliente ? ` · ${o.cliente}` : ''}</option>)}
                </select>
              </div>
            )}
            <Input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-secondary border-border" />
            <Input placeholder="Cliente *" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="bg-secondary border-border" />
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-secondary border-border" />
            <ResponsiveSelect
              value={form.priority}
              onValueChange={v => setForm({ ...form, priority: v })}
              options={[
                { value: 'baja', label: 'Baja' },
                { value: 'media', label: 'Media' },
                { value: 'alta', label: 'Alta' },
              ]}
              className="bg-secondary border-border"
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Encargado de Obra</label>
              <Input placeholder="Nombre del encargado" value={form.encargado_obra} onChange={e => setForm({ ...form, encargado_obra: e.target.value })} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Firma del Encargado</label>
              <SignaturePadInput onChange={setFirmaDataUrl} />
            </div>
            <Textarea placeholder="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-secondary border-border" />

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Horas trabajadas *</label>
                <span className="text-xs text-muted-foreground">Total: {totalHoras} h</span>
              </div>
              {horas.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={h.employee_id}
                    onChange={e => setHoras(horas.map((x, j) => (j === i ? { ...x, employee_id: e.target.value } : x)))}
                    className="flex-1 min-w-0 h-10 rounded-md bg-secondary border border-border px-2 text-sm"
                  >
                    <option value="">Trabajador…</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                  </select>
                  <Input
                    type="number" inputMode="decimal" step="0.25" min="0" max="24"
                    value={h.horas}
                    onChange={e => setHoras(horas.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))}
                    className="w-20 bg-secondary border-border"
                    placeholder="h"
                  />
                  {horas.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setHoras(horas.filter((_, j) => j !== i))} className="text-red-400 px-2">
                      <X size={16} />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setHoras([...horas, { employee_id: '', horas: '8' }])} className="w-full gap-1 border-border">
                <Plus size={14} /> Añadir trabajador
              </Button>
            </div>
            <Input placeholder="Materiales" value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })} className="bg-secondary border-border" />
            <Textarea placeholder="Notas" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-secondary border-border" />
            <Button onClick={handleCreate} disabled={!form.title || !form.client_name || !form.date || validHoras.length === 0 || creating} className="w-full h-11">
              {creating ? <><Loader2 size={16} className="animate-spin" /> Creando...</> : 'Crear Parte'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}