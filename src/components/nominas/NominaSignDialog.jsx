import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pen, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function NominaSignDialog({ payroll, employeeName, onClose, onSigned }) {
  const { toast } = useToast();
  const [signing, setSigning] = useState(false);

  async function handleSign() {
    setSigning(true);
    try {
      const sigDate = new Date().toISOString();
      await base44.entities.Payroll.update(payroll.id, {
        worker_signature_name: employeeName,
        worker_signature_date: sigDate,
      });
      onSigned({
        ...payroll,
        worker_signature_name: employeeName,
        worker_signature_date: sigDate,
      });
    } catch (e) {
      toast({ title: 'Error al firmar', variant: 'destructive' });
      setSigning(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Firma de Nòmina</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Butlletí de Salari · {MONTHS[(payroll.period_month || 1) - 1]} {payroll.period_year}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-secondary/50 rounded-lg border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Treballador</span><span className="font-medium">{payroll.employee_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Líquid a percebre</span><span className="font-semibold text-emerald-400">{(payroll.net_salary || 0).toFixed(2)} €</span></div>
          </div>
          <p className="text-xs text-muted-foreground">
            En firmar, acceptes el contingut d'aquest butlletí de salari. El teu nom i la data quedaran registrats al document PDF.
          </p>
          <Button onClick={handleSign} disabled={signing} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            {signing ? <><Loader2 size={16} className="animate-spin" /> Firmant...</> : <><Pen size={16} /> Firmar con mi nombre</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}