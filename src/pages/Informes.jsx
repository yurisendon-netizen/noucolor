import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, BarChart3, Loader2, ShieldAlert, FileText, Pen } from 'lucide-react';
import InformeSignDialog from '@/components/informes/InformeSignDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import PageHeader from '@/components/shared/PageHeader';
import ResponsiveSelect from '@/components/ui/responsive-select';
import { REPORT_TYPES, REPORT_CONFIG } from '@/components/informes/reportConfig';
import { generateReportPdf } from '@/components/informes/ReportPdf';
import moment from 'moment';

const MONTHS = [
  { value: 0, label: 'Enero' }, { value: 1, label: 'Febrero' }, { value: 2, label: 'Marzo' },
  { value: 3, label: 'Abril' }, { value: 4, label: 'Mayo' }, { value: 5, label: 'Junio' },
  { value: 6, label: 'Julio' }, { value: 7, label: 'Agosto' }, { value: 8, label: 'Septiembre' },
  { value: 9, label: 'Octubre' }, { value: 10, label: 'Noviembre' }, { value: 11, label: 'Diciembre' },
];

export default function Informes() {
  const { isAdmin, employee, loading: profileLoading } = useEmployeeProfile();
  const { toast } = useToast();
  const now = moment();
  const [month, setMonth] = useState(now.month());
  const [year, setYear] = useState(now.year());
  const [reportType, setReportType] = useState('partes');
  const [rows, setRows] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [signDialogOpen, setSignDialogOpen] = useState(false);

  const periodLabel = `${MONTHS[month].label} ${year}`;

  const yearOptions = useMemo(() => {
    const current = moment().year();
    const years = [];
    for (let y = current; y >= current - 3; y--) years.push({ value: y, label: String(y) });
    return years;
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setGenerated(false);
    try {
      const config = REPORT_CONFIG[reportType];
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const data = await base44.entities[config.entity].list(config.sortField, 1000);
      const filtered = data.filter(r => r[config.dateField] && String(r[config.dateField]).startsWith(prefix));
      setRows(filtered);
      setGenerated(true);
      toast({ variant: 'success', title: `Informe generado · ${filtered.length} registro${filtered.length !== 1 ? 's' : ''}` });
    } catch (e) {
      toast({ title: 'Error al generar el informe', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (rows.length === 0) {
      toast({ title: 'No hay datos para descargar' });
      return;
    }
    setDownloading(true);
    try {
      await generateReportPdf({
        reportType,
        rows,
        periodLabel,
        signerName: employee?.full_name,
      });
      toast({ variant: 'success', title: 'PDF generado correctamente' });
    } catch (e) {
      toast({ title: 'Error al generar el PDF', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  }

  if (profileLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader title="Informes" subtitle="Generación de informes" />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  const config = REPORT_CONFIG[reportType];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Informes"
        subtitle="Genera y descarga informes en PDF con formato oficial Noucolor"
      />

      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tipo de informe</label>
            <ResponsiveSelect
              value={reportType}
              onValueChange={setReportType}
              options={REPORT_TYPES}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Mes</label>
            <ResponsiveSelect
              value={month}
              onValueChange={v => setMonth(Number(v))}
              options={MONTHS.map(m => ({ value: m.value, label: m.label }))}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Año</label>
            <ResponsiveSelect
              value={year}
              onValueChange={v => setYear(Number(v))}
              options={yearOptions}
              className="bg-secondary border-border"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button onClick={handleGenerate} disabled={loading} className="gap-2">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Generando...</> : <><BarChart3 size={18} /> Generar Informe</>}
          </Button>
          {generated && rows.length > 0 && (
            <>
              <Button onClick={handleDownloadPdf} disabled={downloading} variant="outline" className="gap-2 border-border">
                {downloading ? <><Loader2 size={18} className="animate-spin" /> Descargando...</> : <><Download size={18} /> Descargar PDF</>}
              </Button>
              <Button onClick={() => setSignDialogOpen(true)} variant="outline" className="gap-2 border-border">
                <Pen size={18} /> Firmar y Descargar
              </Button>
            </>
          )}
        </div>
      </div>

      {generated && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">{config.title}</h2>
              <p className="text-xs text-muted-foreground">{periodLabel} · {rows.length} registro{rows.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  {config.columns.map(col => (
                    <th key={col.key} className={`px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr><td colSpan={config.columns.length} className="px-4 py-8 text-center text-muted-foreground">No hay datos para este período</td></tr>
                ) : (
                  rows.map((r, i) => {
                    const mapped = config.mapRow(r);
                    return (
                      <tr key={r.id || i} className="hover:bg-secondary/30 transition-colors">
                        {config.columns.map(col => (
                          <td key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                            {mapped[col.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!generated && !loading && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FileText size={48} className="text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Selecciona los filtros y pulsa "Generar Informe"</p>
        </div>
      )}

      {signDialogOpen && (
        <InformeSignDialog
          reportType={reportType}
          rows={rows}
          periodLabel={periodLabel}
          signerName={employee?.full_name}
          onClose={() => setSignDialogOpen(false)}
        />
      )}
    </div>
  );
}