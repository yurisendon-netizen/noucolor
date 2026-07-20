import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pen, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SignaturePadInput from '@/components/parts/SignaturePadInput';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function dataUrlToFile(dataUrl, filename) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new File([u8], filename, { type: mime });
}

export default function NominaSignDialog({ payroll, employeeId, employeeName, onClose, onSigned }) {
  const { toast } = useToast();
  const [signing, setSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  async function handleSign() {
    if (!signatureDataUrl) {
      toast({ title: 'Dibuixa la teva firma abans de continuar', variant: 'destructive' });
      return;
    }
    setSigning(true);
    try {
      const file = await dataUrlToFile(signatureDataUrl, 'firma_treballador.png');
      const res = await base44.integrations.Core.UploadFile({ file });
      const firmaUrl = res.file_url;
      await authInvoke('trackTime', {
        operation: 'signPayroll',
        payrollId: payroll.id,
        signatureName: employeeName,
        signatureUrl: firmaUrl,
      });
      const sigDate = new Date().toISOString();
      onSigned({
        ...payroll,
        worker_signature_name: employeeName,
        worker_signature_date: sigDate,
        worker_signature_url: firmaUrl,
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
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Pen size={14} /> Firma digital
            </label>
            <SignaturePadInput onChange={setSignatureDataUrl} />
          </div>
          <p className="text-xs text-muted-foreground">
            En firmar, acceptes el contingut d'aquest butlletí de salari. La teva firma es descarregarà i s'inserirà al document PDF.
          </p>
          <Button onClick={handleSign} disabled={signing || !signatureDataUrl} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
            {signing ? <><Loader2 size={16} className="animate-spin" /> Firmant...</> : <><FileText size={16} /> Firmar i descarregar PDF</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}