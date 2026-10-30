import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { Check, Copy, Loader2, Mail } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { generateWorkOrderPdf } from '@/components/parts/WorkOrderPdf';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Secretaría (Andrea): la única que envía los partes a los encargados.
export const SECRETARIA_EMAIL = 'secrenoucolor@andorra.ad';
export function isSecretaria(employee) {
  return employee?.user === 'andrea' || String(employee?.email || '').toLowerCase() === SECRETARIA_EMAIL;
}

const fmtH = (n) => `${(Number(n) || 0).toFixed(2).replace(/\.00$/, '')} h`;

function defaultSubject(order) {
  return `Parte de treball – ${order.title || order.client_name} – ${moment(order.date).format('DD/MM/YYYY')}`;
}

function defaultMessage(order, senderName) {
  const horas = Array.isArray(order.horas_trabajadas) ? order.horas_trabajadas : [];
  const lines = horas.map(h => `  · ${h.employee_name}: ${fmtH(h.horas)}`).join('\n');
  return [
    `Bon dia${order.encargado_obra ? ` ${order.encargado_obra}` : ''},`,
    '',
    `Us fem arribar el parte de treball de l'obra «${order.title || order.client_name}» (${order.client_name}) del dia ${moment(order.date).format('DD/MM/YYYY')}.`,
    '',
    `Hores totals: ${fmtH(order.total_horas)}`,
    ...(lines ? [lines] : []),
    '',
    'Salutacions,',
    senderName || 'Noucolor',
    'Noucolor · Pintura i Decoració',
    '+376 841 936',
  ].join('\n');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Prepara el correo del parte (destinatario, asunto y texto ya escritos) con el enlace
// al PDF. Se hace en dos pasos: preparar (genera y sube el PDF) y abrir. El enlace mailto
// se abre con un toque directo de Andrea, porque abrirlo tras la espera de la subida lo
// bloquea el navegador sin avisar. Si no tiene programa de correo, puede copiarlo todo.
export default function SendWorkOrderEmailDialog({ order, senderName, onClose, onSent }) {
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!order) return;
    setPrepared(null);
    setTo(order.encargado_email || '');
    setSubject(defaultSubject(order));
    setMessage(defaultMessage(order, senderName));
  }, [order, senderName]);

  async function handlePrepare() {
    const email = to.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      toast({ title: 'Correo no válido', description: 'Escribe el correo del encargado.', variant: 'destructive' });
      return;
    }
    setPreparing(true);
    try {
      const blob = await generateWorkOrderPdf(order, { download: false });
      const res = await authInvoke('trackTime', {
        operation: 'prepareWorkOrderEmail',
        workOrderId: order.id,
        to: email,
        pdfBase64: await blobToBase64(blob),
      });
      if (res?.data?.error || !res?.data?.pdfUrl) throw new Error(res?.data?.error || 'No se ha podido preparar el PDF.');
      const body = `${message}\n\nParte de treball (PDF): ${res.data.pdfUrl}`;
      setPrepared({
        email,
        body,
        mailto: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`,
      });
      onSent?.(order.id, email);
    } catch (e) {
      toast({ title: 'Error al preparar el correo', description: e?.response?.data?.error || e?.message || 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setPreparing(false);
    }
  }

  async function copy(key, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? '' : c)), 1500);
    } catch {
      toast({ title: 'No se ha podido copiar', variant: 'destructive' });
    }
  }

  const CopyButton = ({ k, value, label }) => (
    <Button type="button" variant="outline" onClick={() => copy(k, value)} className="flex-1 gap-1 border-border">
      {copied === k ? <Check size={14} /> : <Copy size={14} />} {label}
    </Button>
  );

  return (
    <Dialog open={!!order} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-lg w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Enviar parte al encargado</DialogTitle>
        </DialogHeader>
        {prepared ? (
          <div className="space-y-3 mt-2">
            <p className="text-sm">Correo preparado para <span className="font-medium break-all">{prepared.email}</span>.</p>
            <Button asChild className="w-full h-11 gap-2">
              <a href={prepared.mailto}><Mail size={16} /> Abrir correo</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Si no se abre ningún programa de correo (por ejemplo, si usas el correo desde la web), copia cada parte y pégala en un correo nuevo:
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton k="to" value={prepared.email} label="Para" />
              <CopyButton k="subject" value={subject} label="Asunto" />
              <CopyButton k="body" value={prepared.body} label="Mensaje" />
            </div>
            <Button type="button" variant="ghost" onClick={onClose} className="w-full">Cerrar</Button>
          </div>
        ) : (
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Para</label>
            <Input type="email" inputMode="email" placeholder="correo@encargado.com" value={to} onChange={e => setTo(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Asunto</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Mensaje</label>
            <Textarea rows={10} value={message} onChange={e => setMessage(e.target.value)} className="bg-secondary border-border" />
          </div>
          <p className="text-xs text-muted-foreground">
            Se preparará el correo con todo escrito y el enlace al PDF del parte. Después solo tienes que abrirlo y darle a Enviar.
          </p>
          <Button onClick={handlePrepare} disabled={preparing} className="w-full h-11 gap-2">
            {preparing ? <><Loader2 size={16} className="animate-spin" /> Preparando...</> : <><Mail size={16} /> Preparar correo</>}
          </Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
