import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pen, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SignaturePadInput from '@/components/parts/SignaturePadInput';
import { generateReportPdf } from '@/components/informes/ReportPdf';

export default function InformeSignDialog({ reportType, rows, periodLabel, signerName, onClose }) {
  const { toast } = useToast();
  const [signing, setSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  async function handleSignAndDownload() {
    if (!signatureDataUrl) {
      toast({ title: 'Dibuja tu firma antes de continuar', variant: 'destructive' });
      return;
    }
    setSigning(true);
    try {
      const arr = signatureDataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      const file = new File([u8], 'firma_informe.png', { type: mime });

      const res = await base44.integrations.Core.UploadFile({ file });
      const firmaUrl = res.file_url;

      await generateReportPdf({
        reportType,
        rows,
        periodLabel,
        signerName,
        firmaUrl,
      });

      toast({ title: 'Informe firmado y descargado correctamente' });
      onClose();
    } catch (e) {
      toast({ title: 'Error al firmar el informe', variant: 'destructive' });
      setSigning(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Firma del Informe</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {periodLabel}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-secondary/50 rounded-lg border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Firmante</span><span className="font-medium">{signerName || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Registros</span><span className="font-medium">{rows?.length || 0}</span></div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Pen size={14} /> Firma digital
            </label>
            <SignaturePadInput onChange={setSignatureDataUrl} />
          </div>
          <p className="text-xs text-muted-foreground">
            Al firmar, tu firma se insertará en el documento PDF y se descargará automáticamente.
          </p>
          <Button onClick={handleSignAndDownload} disabled={signing || !signatureDataUrl} className="w-full h-11 gap-2">
            {signing ? <><Loader2 size={16} className="animate-spin" /> Firmando...</> : <><FileText size={16} /> Firmar y Descargar PDF</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}