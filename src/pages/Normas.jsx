import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import ReglamentoInterno from '@/components/normas/ReglamentoInterno';

const categoryLabels = {
  general: 'General', seguridad: 'Seguridad', horarios: 'Horarios',
  conducta: 'Conducta', equipamiento: 'Equipamiento',
};
const categoryColors = {
  general: 'bg-blue-500/15 text-blue-400',
  seguridad: 'bg-red-500/15 text-red-400',
  horarios: 'bg-purple-500/15 text-purple-400',
  conducta: 'bg-yellow-500/15 text-yellow-400',
  equipamiento: 'bg-emerald-500/15 text-emerald-400',
};

export default function Normas() {
  const { isAdmin } = useEmployeeProfile();
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', category: 'general' });

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    try {
      const data = await base44.entities.CompanyRule.filter({ is_active: true }, 'order', 100);
      setRules(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    try {
      await base44.entities.CompanyRule.create({ ...form, is_active: true, order: rules.length });
      toast({ title: 'Norma añadida' });
      setDialogOpen(false);
      setForm({ title: '', content: '', category: 'general' });
      loadRules();
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta norma?')) return;
    await base44.entities.CompanyRule.delete(id);
    toast({ title: 'Norma eliminada' });
    loadRules();
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Normas de Empresa"
        subtitle="Reglamento interno y políticas de Noucolor"
        actions={
          isAdmin && (
            <Button onClick={() => setDialogOpen(true)} className="bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black gap-2">
              <Plus size={18} /> Nueva Norma
            </Button>
          )
        }
      />

      <ReglamentoInterno />

      {rules.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={18} className="text-muted-foreground" />
            <h2 className="text-lg font-semibold">Normas adicionales</h2>
          </div>
          <Accordion type="multiple" className="space-y-3">
            {rules.map(rule => (
              <AccordionItem key={rule.id} value={rule.id} className="bg-card rounded-xl border border-border px-5 data-[state=open]:border-[hsl(35,92%,55%)]/30 transition-colors">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3 text-left">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[rule.category] || categoryColors.general}`}>
                      {categoryLabels[rule.category] || rule.category}
                    </span>
                    <span className="font-medium">{rule.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{rule.content}</p>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} className="mt-3 text-red-400 hover:bg-red-500/10">
                      <Trash2 size={14} className="mr-1" /> Eliminar
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>Nueva Norma</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-secondary border-border" />
            <ResponsiveSelect
              value={form.category}
              onValueChange={v => setForm({ ...form, category: v })}
              options={Object.entries(categoryLabels).map(([k, v]) => ({ value: k, label: v }))}
              className="bg-secondary border-border"
            />
            <Textarea placeholder="Contenido de la norma *" rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="bg-secondary border-border" />
            <Button onClick={handleCreate} disabled={!form.title || !form.content} className="w-full bg-[hsl(35,92%,55%)] hover:bg-[hsl(35,92%,45%)] text-black">
              Publicar Norma
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}