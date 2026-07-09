import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, CheckCircle, X, Download, Loader2 } from 'lucide-react';
import { generateWorkOrderPdf } from '@/components/parts/WorkOrderPdf';
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
  const [form, setForm] = useState({ title: '', description: '', client_name: '', date: '', priority: 'media', materials: '', notes: '', encargado_obra: employee?.full_name || user?.full_name || '' });

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    try {
      const data = await base44.entities.WorkOrder.list('-created_date', 100);
      setOrders(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    try {
      await base44.entities.WorkOrder.create({
        ...form,
        assigned_to: employee?.id || user?.id,
        assigned_name: employee?.full_name || user?.full_name || '',
        status: 'pendiente'
      });
      toast({ title: 'Parte creado correctamente' });
      setDialogOpen(false);
      setForm({ title: '', description: '', client_name: '', date: '', priority: 'media', materials: '', notes: '', encargado_obra: employee?.full_name || user?.full_name || '' });
      loadOrders();
    } catch (e) {
      toast({ title: 'Error al crear parte', variant: 'destructive' });
    }
  }

  async function handleStatusChange(id, status) {
    const prev = orders;
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
    try {
      await base44.entities.WorkOrder.update(id, { status });
      toast({ title: `Estado actualizado a ${status === 'completado' ? 'Completado' : 'Pendiente'}` });
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
      await base44.entities.WorkOrder.delete(id);
      toast({ title: 'Parte eliminado' });
    } catch (e) {
      setOrders(prev);
      toast({ title: 'Error al eliminar el parte', variant: 'destructive' });
    }
  }

  async function handleDownloadPdf(order) {
    setDownloadingId(order.id);
    try {
      await generateWorkOrderPdf(order);
      toast({ title: 'PDF generado correctamente' });
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
    { key: 'priority', label: 'Prioridad', render: r => <StatusBadge status={r.priority} /> },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Partes de Trabajo"
        subtitle="Gestiona los partes de trabajo y su estado"
        actions={
          <Button onClick={() => setDialogOpen(true)} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
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
            <Textarea placeholder="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-secondary border-border" />
            <Input placeholder="Materiales" value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })} className="bg-secondary border-border" />
            <Textarea placeholder="Notas" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-secondary border-border" />
            <Button onClick={handleCreate} disabled={!form.title || !form.client_name || !form.date} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              Crear Parte
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}