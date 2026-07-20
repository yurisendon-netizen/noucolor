import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck } from 'lucide-react';
import SignaturePad from './SignaturePad';
import moment from 'moment';

const roleLabels = {
  administrador: 'Administrador',
  jefe: 'Jefe',
  operario: 'Trabajador',
};

export default function FirmaSeccion({ signerName, role, periodLabel }) {
  const [confirmed, setConfirmed] = useState(false);
  const [signed, setSigned] = useState(false);
  const today = moment().format('DD/MM/YYYY');
  const ready = confirmed && signed;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-primary" />
        <h3 className="text-sm font-semibold">Confirmación y firma digital</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Revisa que los datos del informe de <span className="text-foreground font-medium">{periodLabel}</span> son correctos, marca la casilla y firma antes de imprimir.
      </p>

      <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
        <span className="text-sm leading-tight">Confirmo que los datos de este informe son correctos.</span>
      </label>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Firma</p>
          <SignaturePad onChange={setSigned} />
        </div>
        <div className="space-y-3 sm:pt-6">
          <div>
            <p className="text-xs text-muted-foreground">Firmante</p>
            <p className="text-sm font-medium">{signerName || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cargo</p>
            <p className="text-sm font-medium">{roleLabels[role] || role || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha</p>
            <p className="text-sm font-medium">{today}</p>
          </div>
          <div className="pt-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
              {ready ? '✓ Documento validado' : 'Pendiente de firma'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}