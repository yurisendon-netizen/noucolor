import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Check, X, Download, FileText } from 'lucide-react';
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
import { generateJustificantePdf } from '@/components/justificantes/JustificantePdf';

const typeLabels = {
  baja_medica: 'Baja Médica', vacaciones: 'Vacaciones',
  permiso_personal: 'Permiso Personal', otro: 'Otro',
};

function getFileName(url) {
  if (!url) return '';
  const decoded = decodeURIComponent(url.split('/').pop());
  return decoded.length > 25 ? decoded.substring(0, 22) + '...' : decoded;
}

export default function Justificantes() {
  const { employee, user, isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: 'otro', date_from: '', date_to: '', reason: '' });
  const [file, setFile] = useState(null);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    try {
      const data = isAdmin
        ? await base44.entities.Justificante.list('-created_date', 100)
        : await base44.entities.Justificante.filter({ employee_id: employee?.id || user?.id }, '-created_date', 50);
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    try {
      let file_url = '';
      if (file) {
        const res = await base44.integrations.Core.UploadFile({ file });
        file_url = res.file_url;
      }
      await base44.entities.Justificante.create({
        ...form, file_url,
        employee_id: employee?.id || user?.id,
        employee_name: employee?.full_name || user?.full_name || '',
        status: 'pendiente'
      });
      toast({ variant: 'success', title: 'Justificante enviado' });
      setDialogOpen(false);
      setForm({ type: 'otro', date_from: '', date_to: '', reason: '' });
      setFile(null);
      loadItems();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function handleApproval(id, status) {
    await base44.entities.Justificante.update(id, { status });
    toast({ variant: 'success', title: `Justificante ${status === 'aprobado' ? 'aprobado' : 'rechazado'}` });
    loadItems();
  }

  const columns = [
    { key: 'employee_name', label: 'Empleado' },
    { key: 'type', label: 'Tipo', render: r => typeLabels[r.type] || r.type },
    { key: 'date_from', label: 'Desde', render: r => moment(r.date_from).format('DD/MM/YYYY') },
    { key: 'date_to', label: 'Hasta', render: r => moment(r.date_to).format('DD/MM/YYYY') },
    { key: 'file_url', label: 'Archivo', render: r => r.file_url ? getFileName(r.file_url) : '—' },
    { key: 'status', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Justificantes"
        subtitle="Gestiona tus ausencias y permisos"
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus size={18} /> Nuevo Justificante
          </Button>
        }
      />

      <h2 className="text-lg font-semibold mb-3">Justificantes Subidos</h2>
      <DataTable
        data={items}
        onRefresh={loadItems}
        columns={columns}
        searchField="employee_name"
        filterField="status"
        filterOptions={[
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'aprobado', label: 'Aprobado' },
          { value: 'rechazado', label: 'Rechazado' },
        ]}
        emptyMessage="No hay justificantes"
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => generateJustificantePdf(row)} className="text-blue-400 hover:bg-blue-500/10">
              <FileText size={16} />
            </Button>
            {row.file_url && (
              <a href={row.file_url} target="_blank" rel="noopener noreferrer" download>
                <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10">
                  <Download size={16} />
                </Button>
              </a>
            )}
            {isAdmin && row.status === 'pendiente' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleApproval(row.id, 'aprobado')} className="text-emerald-400 hover:bg-emerald-500/10">
                  <Check size={16} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleApproval(row.id, 'rechazado')} className="text-red-400 hover:bg-red-500/10">
                  <X size={16} />
                </Button>
              </>
            )}
          </div>
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Justificante</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <ResponsiveSelect
              value={form.type}
              onValueChange={v => setForm({ ...form, type: v })}
              options={[
                { value: 'baja_medica', label: 'Baja Médica' },
                { value: 'vacaciones', label: 'Vacaciones' },
                { value: 'permiso_personal', label: 'Permiso Personal' },
                { value: 'otro', label: 'Otro' },
              ]}
              className="bg-secondary border-border"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.date_from} onChange={e => setForm({ ...form, date_from: e.target.value })} className="bg-secondary border-border" />
              <Input type="date" value={form.date_to} onChange={e => setForm({ ...form, date_to: e.target.value })} className="bg-secondary border-border" />
            </div>
            <Textarea placeholder="Motivo" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="bg-secondary border-border" />
            <Input type="file" onChange={e => setFile(e.target.files[0])} className="bg-secondary border-border" />
            <Button onClick={handleCreate} disabled={!form.date_from || !form.date_to} className="w-full h-11">
              Enviar Justificante
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}