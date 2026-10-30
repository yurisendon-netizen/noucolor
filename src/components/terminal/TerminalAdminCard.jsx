import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Edit, Loader2 } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const errMsg = (e) => e?.response?.data?.error || e?.message || 'Error';

// Rol TERMINAL: el móvil compartido del taller donde fichan los operarios.
// No es un empleado (entidad TelefonoEmpresa): aquí el admin cambia su usuario y PIN.
export default function TerminalAdminCard() {
  const { toast } = useToast();
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ nombre: '', user: '', pin: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authInvoke('manageEmployee', { action: 'listTerminals' });
      setTerminals(res.data?.terminals || []);
    } catch { /* sin permisos o sin conexión */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await authInvoke('manageEmployee', { action: 'updateTerminal', data: patch });
      if (res.data?.success) { toast({ title: 'Terminal actualizado' }); await load(); return true; }
      toast({ title: 'Error', description: res.data?.error || 'No se pudo guardar', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Error', description: errMsg(e), variant: 'destructive' });
    } finally { setSaving(false); }
    return false;
  }

  async function submit(e) {
    e.preventDefault();
    if (form.pin && !/^\d{4}$/.test(form.pin)) {
      toast({ title: 'El PIN debe tener 4 cifras', variant: 'destructive' });
      return;
    }
    const ok = await save({ id: edit.id, nombre: form.nombre, user: form.user, ...(form.pin ? { pin: form.pin } : {}) });
    if (ok) setEdit(null);
  }

  if (loading || terminals.length === 0) return null;
  // Se muestran primero los activos
  const list = [...terminals].sort((a, b) => Number(b.activo) - Number(a.activo));

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={18} className="text-primary" />
        <h3 className="font-semibold">Terminal de fichaje</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Móvil del taller donde fichan los operarios con su PIN. No es un empleado: no sale en nóminas ni informes. Entra desde el login normal con su usuario y PIN.
      </p>
      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className={`flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 ${t.activo ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <p className="font-medium truncate">{t.nombre}</p>
              <p className="text-xs text-muted-foreground">Usuario: <span className="font-mono">{t.user}</span> · {t.activo ? 'Activo' : 'Desactivado'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={t.activo} disabled={saving} onCheckedChange={(v) => save({ id: t.id, activo: v, ...(v ? {} : { revokeSession: true }) })} aria-label="Activo" />
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { setForm({ nombre: t.nombre || '', user: t.user || '', pin: '' }); setEdit(t); }}>
                <Edit size={14} /> Editar
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar terminal</DialogTitle>
            <DialogDescription>Cambia el nombre, el usuario o el PIN de 4 cifras con el que entra el terminal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre</label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Usuario</label>
              <Input value={form.user} autoCapitalize="none" autoCorrect="off" onChange={(e) => setForm({ ...form, user: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Nuevo PIN (4 cifras)</label>
              <Input value={form.pin} inputMode="numeric" maxLength={4} placeholder="Déjalo vacío para no cambiarlo"
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
