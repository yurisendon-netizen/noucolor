import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', hire_date: '', base_salary: 0 });

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    try {
      const data = await base44.entities.Employee.list('-created_date', 100);
      setEmployees(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function openEdit(emp) {
    setEditing(emp);
    setForm({
      full_name: emp.full_name, email: emp.email, role: emp.role,
      position: emp.position || '', phone: emp.phone || '',
      nss: emp.nss || '', dni: emp.dni || '',
      hire_date: emp.hire_date || '', base_salary: emp.base_salary || 0
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ full_name: '', email: '', role: 'operario', position: '', phone: '', nss: '', dni: '', hire_date: '', base_salary: 0 });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await base44.entities.Employee.update(editing.id, { ...form, base_salary: parseFloat(form.base_salary) || 0 });
        toast({ title: 'Empleado actualizado' });
      } else {
        await base44.entities.Employee.create({ ...form, base_salary: parseFloat(form.base_salary) || 0, is_active: true });
        toast({ title: 'Empleado creado' });
      }
      setDialogOpen(false);
      loadEmployees();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function toggleActive(emp) {
    await base44.entities.Employee.update(emp.id, { is_active: !emp.is_active });
    toast({ title: emp.is_active ? 'Empleado desactivado' : 'Empleado activado' });
    loadEmployees();
  }

  const columns = [
    { key: 'full_name', label: 'Nombre', render: r => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', label: 'Email' },
    { key: 'position', label: 'Puesto', render: r => r.position || '—' },
    { key: 'role', label: 'Rol', render: r => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.role === 'administrador' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
        {r.role === 'administrador' ? 'Admin' : 'Operario'}
      </span>
    )},
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
              <Input type="number" placeholder="Salario base" value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} className="bg-secondary border-border" />
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