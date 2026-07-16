import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { UserPlus, Download, Users, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  position: '', precioHora: 0, cargo: 'operario', hire_date: '', user: '', pass: ''
};
const REQUIRED = ['full_name', 'email', 'phone', 'dni', 'cass', 'iban', 'user', 'pass'];
const LABELS = {
  full_name: 'Nombre', email: 'Correo', phone: 'Teléfono', dni: 'DNI',
  cass: 'CASS', iban: 'IBAN', user: 'Usuario', pass: 'Contraseña'
};

export default function RecogidaDatos() {
  const { isAdmin, employee } = useEmployeeProfile();
  const { toast } = useToast();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (isAdmin === false) return;
    loadWorkers();
  }, [isAdmin]);

  async function loadWorkers() {
    try {
      const result = await base44.functions.invoke('manageEmployee', {
        action: 'listDatos',
        callerEmployeeId: employee?.id,
      });
      if (result.data?.success) {
        setWorkers(result.data.datos);
      }
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

  function openResetPassword(w) {
    setResetTarget(w);
    setNewPassword('');
    setConfirmPassword('');
  }

  function closeResetPassword() {
    setResetTarget(null);
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleResetPassword() {
    if (!newPassword.trim()) {
      toast({ title: 'Escribe una contraseña', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Las contraseñas no coinciden', variant: 'destructive' });
      return;
    }
    setResetting(true);
    try {
      const w = resetTarget;
      const data = {
        full_name: w.full_name, email: w.email, phone: w.phone, dni: w.dni,
        cass: w.cass, iban: w.iban, position: w.position, precioHora: w.precioHora,
        cargo: w.cargo, hire_date: w.hire_date, user: w.user, pass: newPassword.trim(),
      };
      await base44.functions.invoke('manageEmployee', {
        action: 'update',
        callerEmployeeId: employee?.id,
        data,
        datosId: w.id,
        employeeId: w.employee_id,
      });
      toast({ title: '✅ Contraseña restablecida', description: `${w.full_name} ya puede usar la nueva contraseña para fichar` });
      closeResetPassword();
      loadWorkers();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setResetting(false);
    }
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
      const data = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dni: form.dni.trim(),
        cass: form.cass.trim(),
        iban: form.iban.trim(),
        position: form.position.trim(),
        precioHora: parseFloat(form.precioHora) || 0,
        cargo: form.cargo || 'operario',
        hire_date: form.hire_date || null,
        user: form.user.trim().toLowerCase(),
        pass: form.pass,
      };
      await base44.functions.invoke('manageEmployee', {
        action: editing ? 'update' : 'create',
        callerEmployeeId: employee?.id,
        data,
        datosId: editing?.id,
        employeeId: editing?.employee_id,
      });
      toast({ title: editing ? '✅ Trabajador actualizado' : '✅ Trabajador añadido', description: editing ? undefined : `${data.full_name} ya puede fichar` });
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
      await base44.functions.invoke('manageEmployee', {
        action: 'delete',
        callerEmployeeId: employee?.id,
        datosId: w.id,
        employeeId: w.employee_id,
      });
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
      'Nombre completo': w.full_name || '',
      'Correo electrónico': w.email || '',
      'Teléfono': w.phone || '',
      'DNI / Pasaporte': w.dni || '',
      'Número de Tarjeta CASS': w.cass || '',
      'Número de cuenta bancaria (IBAN)': w.iban || '',
      'Usuario de login': w.user || '',
      'Puesto': w.cargo === 'administrador' ? 'Administrador' : (w.cargo === 'jefe' ? 'Jefe' : 'Operario'),
      'Fecha de incorporación': w.hire_date ? moment(w.hire_date).format('DD/MM/YYYY') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];
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
        onResetPassword={openResetPassword}
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

      <Dialog open={!!resetTarget} onOpenChange={open => !open && closeResetPassword()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Trabajador: <span className="font-medium text-foreground">{resetTarget?.full_name}</span>
            </p>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Nueva contraseña</label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
                className="bg-secondary border-border"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Confirmar contraseña</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className="bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeResetPassword}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetting} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              {resetting ? 'Guardando...' : 'Restablecer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}