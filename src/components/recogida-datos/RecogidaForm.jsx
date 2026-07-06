import React from 'react';
import { Input } from '@/components/ui/input';
import ResponsiveSelect from '@/components/ui/responsive-select';

function Field({ label, children, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="text-sm text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

export default function RecogidaForm({ form, setForm }) {
  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre completo *">
          <Input
            value={form.full_name || ''}
            onChange={e => update('full_name', e.target.value)}
            placeholder="Ej: Juan Pérez"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Correo electrónico *">
          <Input
            type="email"
            value={form.email || ''}
            onChange={e => update('email', e.target.value)}
            placeholder="ejemplo@correo.com"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Teléfono *">
          <Input
            value={form.phone || ''}
            onChange={e => update('phone', e.target.value)}
            placeholder="+376 123 456"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="DNI / Pasaporte *">
          <Input
            value={form.dni || ''}
            onChange={e => update('dni', e.target.value.toUpperCase())}
            placeholder="X1234567Y"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Número de Tarjeta CASS *">
          <Input
            value={form.cass || ''}
            onChange={e => update('cass', e.target.value)}
            placeholder="AD 000 000 000"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="IBAN (cuenta bancaria) *">
          <Input
            value={form.iban || ''}
            onChange={e => update('iban', e.target.value.toUpperCase())}
            placeholder="AD00 0000 0000 0000 0000 0000"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Puesto">
          <Input
            value={form.position || ''}
            onChange={e => update('position', e.target.value)}
            placeholder="Ej: Pintor, Oficial, Peón..."
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Precio/hora (€)">
          <Input
            type="number"
            step="0.01"
            value={form.precioHora ?? 0}
            onChange={e => update('precioHora', e.target.value)}
            placeholder="0.00"
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Cargo">
          <ResponsiveSelect
            value={form.cargo || 'operario'}
            onValueChange={v => update('cargo', v)}
            options={[
              { value: 'operario', label: 'Operario' },
              { value: 'administrador', label: 'Administrador' }
            ]}
            className="bg-secondary border-border"
          />
        </Field>
        <Field label="Fecha de incorporación">
          <Input
            type="date"
            value={form.hire_date ? form.hire_date.substring(0, 10) : ''}
            onChange={e => update('hire_date', e.target.value)}
            className="bg-secondary border-border"
          />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Credenciales de acceso (para fichar)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Usuario *">
            <Input
              value={form.user || ''}
              onChange={e => update('user', e.target.value.toLowerCase())}
              placeholder="ej: jperez"
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Contraseña *">
            <Input
              value={form.pass || ''}
              onChange={e => update('pass', e.target.value)}
              placeholder="Contraseña para fichar"
              className="bg-secondary border-border"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}