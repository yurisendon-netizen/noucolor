import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { Plus, Edit, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import moment from 'moment';

export default function Empleados() {
  const { toast } = useToast();
  const { employee } = useCustomAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', hire_date: '', base_salary: 0, precioHora: 0 });

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
      hire_date: emp.hire_date || '', base_salary: emp.base_salary || 0, precioHora: emp.precioHora || 0
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', hire_date: '', base_salary: 0, precioHora: 0 });
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
          cass: form.nss,
          dni: form.dni,
          hire_date: form.hire_date,
          precioHora,
        },
      });
      if (result.data?.success) {
        toast({ title: editing ? 'Empleado actualizado' : 'Empleado creado' });
        setDialogOpen(false);
        loadEmployees();
      } else {
        toast({ title: result.data?.error || 'Error', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function toggleActive(emp) {
    const result = await base44.functions.invoke('manageEmployee', {
      action: 'toggleActive',
      callerEmployeeId: employee?.id,
      employeeId: emp.id,
    });
    if (result.data?.success) {
      toast({ title: emp.is_active ? 'Empleado desactivado' : 'Empleado activado' });
      loadEmployees();
    }
  }

  const columns = [
    { key: 'full_name', label: 'Nombre', render: r => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', label: 'Email' },
    { key: 'position', label: 'Puesto', render: r => r.position || '—' },
    { key: 'precioHora', label: '€/hora', render: r => r.precioHora ? `${r.precioHora.toFixed(2)}€` : '—' },
    { key: 'base_salary', label: 'Salario base', render: r => r.base_salary ? `${r.base_salary.toFixed(2)}€` : '—' },
    { key: 'role', label: 'Rol', render: r => {
      const styles = {
        jefe: 'bg-red-500/15 text-red-400',
        administrador: 'bg-purple-500/15 text-purple-400',
        operario: 'bg-blue-500/15 text-blue-400'
      };
      const labels = { jefe: 'Jefe', administrador: 'Admin', operario: 'Operario' };
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[r.role] || styles.operario}`}>{labels[r.role] || r.role}</span>;
    }},
    { key: 'is_active', label: 'Estado', render: r => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
        {r.is_active ? 'Activo' : 'Inactivo'}
      </span>
    )},
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Gestión de Empleados"
        subtitle="Administra el equipo de Noucolor"
        actions={
          <Button onClick={openCreate} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            <Plus size={18} /> Nuevo Empleado
          </Button>
        }
      />

      <DataTable
        data={employees}
        columns={columns}
        searchField={['full_name', 'email']}
        filterField="role"
        filterOptions={[
          { value: 'operario', label: 'Operario' },
          { value: 'administrador', label: 'Administrador' },
        ]}
        emptyMessage="No hay empleados registrados"
        actions={(row) => (
          <>
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="text-blue-400 hover:bg-blue-500/10">
              <Edit size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggleActive(row)} className={row.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}>
              {row.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
            </Button>
          </>
        )}
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
              </SelectContent>
            </Select>
            <Input placeholder="Puesto" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="bg-secondary border-border" />
            <Input placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-secondary border-border" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="DNI / Passaport" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} className="bg-secondary border-border" />
              <Input placeholder="Nº Seg. Social" value={form.nss} onChange={e => setForm({ ...form, nss: e.target.value })} className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="bg-secondary border-border" />
              <Input type="number" step="0.01" placeholder="Precio/hora (€)" value={form.precioHora} onChange={e => setForm({ ...form, precioHora: e.target.value })} className="bg-secondary border-border" />
            </div>
            <Button onClick={handleSave} disabled={!form.full_name || !form.email} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              {editing ? 'Guardar Cambios' : 'Crear Empleado'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}