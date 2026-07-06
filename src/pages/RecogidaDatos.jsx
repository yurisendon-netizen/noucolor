import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { UserPlus, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import * as XLSX from 'xlsx';
import moment from 'moment';

export default function RecogidaDatos() {
  const { isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', user: '', pass: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isAdmin === false) return;
    loadWorkers();
  }, [isAdmin]);

  async function loadWorkers() {
    try {
      const data = await base44.entities.DatosTrabajador.list('-created_date', 500);
      setWorkers(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.user.trim() || !form.pass.trim()) return;
    setSaving(true);
    try {
      const emp = await base44.entities.Employee.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        user: form.user.trim().toLowerCase(),
        pass: form.pass,
        role: 'operario',
        precioHora: 0,
        base_salary: 0,
        is_active: true,
      });
      await base44.entities.DatosTrabajador.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        user: form.user.trim().toLowerCase(),
        pass: form.pass,
        employee_id: emp.id,
      });
      toast({ title: '✅ Trabajador añadido', description: `${form.full_name} ya puede fichar` });
      setForm({ full_name: '', email: '', phone: '', user: '', pass: '' });
      loadWorkers();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(worker) {
    try {
      if (worker.employee_id) {
        await base44.entities.Employee.delete(worker.employee_id).catch(() => {});
      }
      await base44.entities.DatosTrabajador.delete(worker.id);
      toast({ title: 'Trabajador eliminado' });
      loadWorkers();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  function handleExportExcel() {
    if (workers.length === 0) {
      toast({ title: 'No hay datos para exportar' });
      return;
    }
    const rows = workers.map(w => ({
      'Nombre': w.full_name || '',
      'Correo': w.email || '',
      'Teléfono': w.phone || '',
      'Usuario': w.user || '',
      'Fecha': w.created_date ? moment(w.created_date).format('DD/MM/YYYY HH:mm') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trabajadores');
    XLSX.writeFile(wb, `Recogida_Datos_Noucolor_${moment().format('DD-MM-YYYY')}.xlsx`);
    toast({ title: '📊 Excel exportado', description: `${workers.length} trabajadores` });
  }

  if (isAdmin === false) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-muted-foreground">Solo los administradores pueden acceder a esta página.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Recogida de Datos"
        subtitle="Registro de trabajadores en oficina — Uso administrativo"
      />

      <form onSubmit={handleAdd} className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Nombre completo *</label>
            <Input
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="Ej: Juan Pérez"
              required
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Correo electrónico *</label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="ejemplo@correo.com"
              required
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Teléfono</label>
            <Input
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="+376 123 456"
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Usuario *</label>
            <Input
              value={form.user}
              onChange={e => setForm({ ...form, user: e.target.value })}
              placeholder="ej: jperez"
              required
              className="bg-secondary border-border"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-muted-foreground mb-1.5 block">Contraseña *</label>
            <Input
              value={form.pass}
              onChange={e => setForm({ ...form, pass: e.target.value })}
              placeholder="Contraseña para fichar"
              required
              className="bg-secondary border-border"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={saving} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            <UserPlus size={18} />
            {saving ? 'Añadiendo...' : 'Añadir Trabajador'}
          </Button>
        </div>
      </form>

      <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Trabajadores Registrados ({workers.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Correo</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Teléfono</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">No hay trabajadores registrados todavía</td>
                </tr>
              ) : (
                workers.map(w => (
                  <tr key={w.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium">{w.full_name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{w.email}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{w.phone || '—'}</td>
                    <td className="px-5 py-3 text-sm font-mono text-[hsl(35,92%,55%)]">{w.user || '—'}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{w.created_date ? moment(w.created_date).format('DD/MM/YYYY HH:mm') : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(w)} className="text-red-400 hover:bg-red-500/10">
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Button
        onClick={handleExportExcel}
        disabled={workers.length === 0}
        size="lg"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-14 text-base"
      >
        <Download size={22} />
        Exportar a Excel ({workers.length} registros)
      </Button>
    </div>
  );
}