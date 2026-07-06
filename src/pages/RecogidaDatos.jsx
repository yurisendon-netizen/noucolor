import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { UserPlus, Download, Users, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import RecogidaForm from '@/components/recogida-datos/RecogidaForm';
import RecogidaTable from '@/components/recogida-datos/RecogidaTable';
import * as XLSX from 'xlsx';
import moment from 'moment';

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', dni: '', cass: '', iban: '',
  cargo: 'operario', hire_date: '', user: '', pass: ''
};
const REQUIRED = ['full_name', 'email', 'phone', 'dni', 'cass', 'iban', 'user', 'pass'];
const LABELS = {
  full_name: 'Nombre', email: 'Correo', phone: 'Teléfono', dni: 'DNI',
  cass: 'CASS', iban: 'IBAN', user: 'Usuario', pass: 'Contraseña'
};

export default function RecogidaDatos() {
  const { isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());

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

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(w) {
    setEditing(w);
    setForm({ ...EMPTY_FORM, ...w });
    setDialogOpen(true);
  }

  function validate() {
    for (const f of REQUIRED) {
      if (!String(form[f] || '').trim()) {
        toast({ title: 'Campo obligatorio', description: `Falta: ${LABELS[f]}`, variant: 'destructive' });
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dni: form.dni.trim(),
        cass: form.cass.trim(),
        iban: form.iban.trim(),
        cargo: form.cargo || 'operario',
        hire_date: form.hire_date || null,
        user: form.user.trim().toLowerCase(),
        pass: form.pass,
      };
      if (editing) {
        await base44.entities.DatosTrabajador.update(editing.id, payload);
        if (editing.employee_id) {
          await base44.entities.Employee.update(editing.employee_id, {
            full_name: payload.full_name, email: payload.email, phone: payload.phone,
            dni: payload.dni, nss: payload.cass, hire_date: payload.hire_date,
            role: payload.cargo, user: payload.user, pass: payload.pass,
          }).catch(() => {});
        }
        toast({ title: '✅ Trabajador actualizado' });
      } else {
        const emp = await base44.entities.Employee.create({
          full_name: payload.full_name, email: payload.email, phone: payload.phone,
          dni: payload.dni, nss: payload.cass, hire_date: payload.hire_date,
          role: payload.cargo, user: payload.user, pass: payload.pass,
          base_salary: 0, precioHora: 0, is_active: true,
        });
        await base44.entities.DatosTrabajador.create({ ...payload, employee_id: emp.id });
        toast({ title: '✅ Trabajador añadido', description: `${payload.full_name} ya puede fichar` });
      }
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      loadWorkers();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(w) {
    if (!confirm(`¿Eliminar a ${w.full_name}?`)) return;
    try {
      if (w.employee_id) {
        await base44.entities.Employee.delete(w.employee_id).catch(() => {});
      }
      await base44.entities.DatosTrabajador.delete(w.id);
      toast({ title: 'Trabajador eliminado' });
      setSelected(prev => { const n = new Set(prev); n.delete(w.id); return n; });
      loadWorkers();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll(filtered) {
    setSelected(prev => {
      const allSel = filtered.every(w => prev.has(w.id));
      const n = new Set(prev);
      if (allSel) filtered.forEach(w => n.delete(w.id));
      else filtered.forEach(w => n.add(w.id));
      return n;
    });
  }

  function handleExportExcel() {
    const toExport = selected.size > 0 ? workers.filter(w => selected.has(w.id)) : workers;
    if (toExport.length === 0) {
      toast({ title: 'No hay datos para exportar' });
      return;
    }
    const rows = toExport.map(w => ({
      'Nombre': w.full_name || '',
      'Correo': w.email || '',
      'Teléfono': w.phone || '',
      'DNI/Pasaporte': w.dni || '',
      'CASS': w.cass || '',
      'IBAN': w.iban || '',
      'Cargo': w.cargo === 'administrador' ? 'Administrador' : 'Operario',
      'Fecha incorporación': w.hire_date ? moment(w.hire_date).format('DD/MM/YYYY') : '',
      'Fecha registro': w.created_date ? moment(w.created_date).format('DD/MM/YYYY HH:mm') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trabajadores');
    const suffix = selected.size > 0 ? `_seleccionados` : '';
    XLSX.writeFile(wb, `Recogida_Datos_Noucolor${suffix}_${moment().format('DD-MM-YYYY')}.xlsx`);
    toast({ title: '📊 Excel exportado', description: `${toExport.length} trabajador${toExport.length !== 1 ? 'es' : ''}` });
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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Recogida de Datos"
        subtitle="Registro de datos de trabajadores — Uso administrativo"
        actions={
          <Button onClick={openAdd} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            <UserPlus size={18} /> Añadir
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[hsl(35,92%,55%)]/10 flex items-center justify-center shrink-0">
            <Users size={24} className="text-[hsl(35,92%,55%)]" />
          </div>
          <div>
            <p className="text-2xl font-bold">{workers.length}</p>
            <p className="text-xs text-muted-foreground">Total trabajadores</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <CheckSquare size={24} className="text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{selected.size}</p>
            <p className="text-xs text-muted-foreground">Seleccionados</p>
          </div>
        </div>
        <div className="flex items-stretch">
          <Button
            onClick={handleExportExcel}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-auto text-base"
          >
            <Download size={20} />
            Exportar Excel
            <span className="opacity-80 text-sm">({selected.size > 0 ? `${selected.size} sel.` : 'todos'})</span>
          </Button>
        </div>
      </div>

      <RecogidaTable
        workers={workers}
        selected={selected}
        onToggle={toggleSelect}
        onToggleAll={toggleSelectAll}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar trabajador' : 'Nuevo trabajador'}</DialogTitle>
          </DialogHeader>
          <RecogidaForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}