import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Save, Lock, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function NotasInforme({ month, year, isAdmin, periodLabel }) {
  const { toast } = useToast();
  const [noteId, setNoteId] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadNote();
  }, [month, year]);

  async function loadNote() {
    setLoading(true);
    try {
      const data = await base44.entities.InformeNota.filter({ period_month: month, period_year: year });
      if (data.length > 0) {
        setNoteId(data[0].id);
        setNotes(data[0].notes || '');
      } else {
        setNoteId(null);
        setNotes('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (noteId) {
        await base44.entities.InformeNota.update(noteId, { notes });
      } else {
        const created = await base44.entities.InformeNota.create({ period_month: month, period_year: year, notes });
        setNoteId(created.id);
      }
      toast({ title: 'Comentarios guardados', description: periodLabel });
    } catch (e) {
      toast({ title: 'Error al guardar los comentarios', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={18} className="text-primary" />
        <h3 className="text-sm font-semibold">Comentarios del informe</h3>
        {!isAdmin && (
          <span className="inline-flex items-center gap-1 ml-auto text-xs text-muted-foreground">
            <Lock size={12} /> Solo lectura
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {isAdmin
          ? 'Añade explicaciones sobre horas extras, incidencias o aspectos relevantes del periodo. Los trabajadores las verán al consultar su informe.'
          : 'Notas del administrador sobre este periodo.'}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : isAdmin ? (
        <div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Se han registrado horas extra en el proyecto de Caldea por urgencia de entrega..."
            className="min-h-[120px] resize-y bg-secondary border-border"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">{notes.length} caracteres</p>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Guardando...' : 'Guardar comentarios'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-secondary/50 p-4 min-h-[80px]">
          {notes ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin comentarios para este periodo.</p>
          )}
        </div>
      )}
    </div>
  );
}