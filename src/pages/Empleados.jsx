import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { Plus, Edit, Trash2, Download, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import * as XLSX from 'xlsx';
import moment from 'moment';

export default function Empleados() {
  const { toast } = useToast();
  const { employee, isAdmin } = useCustomAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', iban: '', hire_date: '', precioHora: 0 });

  useEffect(() => { if (employee?.id) loadEmployees(); }, [employee?.id]);

  async function loadEmployees() {
    try {
      const result = await base44.functions.invoke('manageEmployee', {
        action: 'list',
        callerEmployeeId: employee?.id,
      });
      if (result.data?.success) {
        setEmployees(result.data.employees);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function openEdit(emp) {
    setEditing(emp);
    setForm({
      full_name: emp.full_name, email: emp.email, role: emp.role,
      position: emp.position || '', phone: emp.phone || '',
      nss: emp.nss || '', dni: emp.dni || '',
      iban: emp.iban || '',
      hire_date: emp.hire_date || '', precioHora: emp.precioHora || 0
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', iban: '', hire_date: '', precioHora: 0 });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const precioHora = parseFloat(form.precioHora) || 0;
      const result = await base44.functions.invoke('manageEmployee', {
        action: editing ? 'update' : 'create',
        callerEmployeeId: employee?.id,
        employeeId: editing?.id,
        data: {
          full_name: form.full_name,
          email: form.email,
          cargo: form.role,
          position: form.position,
          phone: form.phone,
          nss: form.nss, // CORREGIDO: antes se enviaba como "cass" y nunca coincidía con el campo "nss" que se lee en toda la tabla
          dni: form.dni,
          iban: form.iban,
          hire_date: form.hire_date,
          precioHora,
        },
      });
      if (result.data?.success) {
        toast({ variant: 'success', title: editing ? 'Empleado actualizado' : 'Empleado creado' });
        setDialogOpen(false);
        loadEmployees();
      } else {
        toast({ title: result.data?.error || 'Error', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function handleInvite(emp) {
    if (!emp?.email) { toast({ title: 'Este empleado no tiene email', variant: 'destructive' }); return; }
    try {
      const result = await base44.functions.invoke('inviteUser', { email: emp.email, role: emp.role === 'jefe' ? 'admin' : 'user' });
      if (result.data?.success) {
        toast({ variant: 'success', title: `Invitación enviada a ${emp.email}` });
      } else {
        toast({ title: result.data?.error || 'Error al invitar', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error al invitar', variant: 'destructive' });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const result = await base44.functions.invoke('manageEmployee', {
        action: 'delete',
        callerEmployeeId: employee?.id,
        employeeId: deleteTarget.id,
      });
      if (result.data?.success) {
        toast({ variant: 'success', title: 'Empleado eliminado' });
        setDeleteTarget(null);
        loadEmployees();
      } else {
        toast({ title: result.data?.error || 'Error', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  function exportExcel() {
    const rows = employees.map(e => ({
      'ID': e.id,
      'Nombre Completo': e.full_name,
      'Usuario': e.user,
      'Contraseña': e.nss,
      'Cargo': e.role,
      'Precio Hora (€)': e.precioHora,
      'Salario Bruto (€)': e.base_salary,
      'Salario Neto (€)': e.net_salary,
      'Correo Electrónico': e.email,
      'Teléfono': e.phone,
      'Tarjeta CASS': e.nss,
      'IBAN': e.iban,
      'Fecha de Incorporación': e.hire_date ? moment(e.hire_date).format('DD/MM/YYYY') : '',
      'Estado': e.is_active ? 'Activo' : 'Inactivo',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.writeFile(wb, `Empleados_Noucolor_${moment().format('DDMMYYYY')}.xlsx`);
  }

  const roleStyles = {
    jefe: 'bg-red-500/15 text-red-400',
    administrador: 'bg-purple-500/15 text-purple-400',
    operario: 'bg-blue-500/15 text-blue-400'
  };
  const roleLabels = { jefe: 'Jefe', administrador: 'Admin', operario: 'Operario' };

  const columns = [
    { key: 'id', label: 'ID', render: r => <span className="text-xs text-muted-foreground font-mono">{r.id?.slice(-6)}</span> },
    { key: 'full_name', label: 'Nombre Completo', render: r => <span className="font-medium">{r.full_name}</span> },
    { key: 'user', label: 'Usuario', render: r => <span className="text-xs font-mono">{r.user || '—'}</span> },
    { key: 'pass', label: 'Contraseña', render: r => <span className="text-xs font-mono text-muted-foreground">{r.nss || '—'}</span> },
    { key: 'role', label: 'Cargo', render: r => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleStyles[r.role] || roleStyles.operario}`}>{roleLabels[r.role] || r.role}</span>
    )},
    { key: 'precioHora', label: 'Precio Hora', render: r => <span className="font-medium">{r.precioHora ? `${r.precioHora.toFixed(2)}€` : '—'}</span> },
    { key: 'base_salary', label: 'Salario Bruto', render: r => <span className="font-medium">{r.base_salary ? `${r.base_salary.toFixed(2)}€` : '—'}</span> },
    { key: 'net_salary', label: 'Salario Neto', render: r => <span className="font-medium text-emerald-400">{r.net_salary ? `${r.net_salary.toFixed(2)}€` : '—'}</span> },
    { key: 'email', label: 'Correo Electrónico', render: r => <span className="text-xs">{r.email || '—'}</span> },
    { key: 'phone', label: 'Teléfono', render: r => r.phone || '—' },
    { key: 'nss', label: 'Tarjeta CASS', render: r => r.nss || '—' },
    { key: 'iban', label: 'IBAN', render: r => <span className="text-xs font-mono">{r.iban || '—'}</span> },
    { key: 'hire_date', label: 'Incorporación', render: r => r.hire_date ? moment(r.hire_date).format('DD/MM/YYYY') : '—' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Gestión de Empleados"
        subtitle="Listado completo del personal de Noucolor"
        actions={isAdmin && (
          <div className="flex items-center gap-2">
            <Button onClick={exportExcel} variant="outline" className="gap-2 border-border bg-secondary">
              <Download size={18} /> Excel
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus size={18} /> Nuevo Empleado
            </Button>
          </div>
        )}
      />

      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <Users size={16} />
        <span><strong className="text-foreground">{employees.length}</strong> empleado{employees.length !== 1 ? 's' : ''} en total</span>
      </div>

      <DataTable
        data={employees}
        columns={columns}
        searchField={['full_name', 'email', 'dni', 'nss', 'user', 'phone']}
        filterField="role"
        filterOptions={[
          { value: 'operario', label: 'Operario' },
          { value: 'administrador', label: 'Administrador' },
          { value: 'jefe', label: 'Jefe' },
        ]}
        emptyMessage="No hay empleados registrados"
        onRefresh={loadEmployees}
        actions={isAdmin ? (row) => (
          <>
            <Button variant="ghost" size="sm" onClick={() => handleInvite(row)} className="text-green-400 hover:bg-green-500/10" title="Invitar usuario">
              <UserPlus size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="text-blue-400 hover:bg-blue-500/10">
              <Edit size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} className="text-red-400 hover:bg-red-500/10">
              <Trash2 size={16} />
            </Button>
          </>
        ) : undefined}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar Empleado' : 'Nuevo Empleado'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="Nombre completo *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="bg-secondary border-border" />
            <Input placeholder="Email *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-secondary border-border" />
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operario">Operario</SelectItem>
                <SelectItem value="administrador">Administrador</SelectItem>
                <SelectItem value="jefe">Jefe</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Puesto" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="bg-secondary border-border" />
            <Input placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-secondary border-border" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="DNI / Pasaporte" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} className="bg-secondary border-border" />
              <Input placeholder="Nº CASS" value={form.nss} onChange={e => setForm({ ...form, nss: e.target.value })} className="bg-secondary border-border" />
            </div>
            <Input placeholder="IBAN (Número de cuenta bancaria)" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} className="bg-secondary border-border" />
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="bg-secondary border-border" />
              <Input type="number" step="0.01" placeholder="Precio/hora (€)" value={form.precioHora} onChange={e => setForm({ ...form, precioHora: e.target.value })} className="bg-secondary border-border" />
            </div>
            <Button onClick={handleSave} disabled={!form.full_name || !form.email} className="w-full h-11">
              {editing ? 'Guardar Cambios' : 'Crear Empleado'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar a <strong>{deleteTarget?.full_name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}