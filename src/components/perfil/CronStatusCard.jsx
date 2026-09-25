import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, RefreshCw, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import moment from 'moment';

const TASK_LABELS = {
  onesignalClockInReminder: 'Recordatorio push (8:00)',
  notifyMissingClockIn: 'Email recordatorio (8:00)',
  registerClockInAbsence: 'Registro de faltas (8:30)',
  autoCloseTimeEntries: 'Cierre automático (16:35)',
};

const STATUS = {
  ok: { label: 'OK', Icon: CheckCircle2, dot: 'bg-success', text: 'text-success' },
  error: { label: 'Error', Icon: XCircle, dot: 'bg-destructive', text: 'text-destructive' },
  sin_ejecutar: { label: 'Sin ejecutar hoy', Icon: MinusCircle, dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

export default function CronStatusCard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [date, setDate] = useState('');

  async function load() {
    try {
      const res = await authInvoke('cronStatus', {});
      if (res.data?.success) {
        setTasks(res.data.tasks || []);
        setDate(res.data.date || '');
      }
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  return (
    <Card className="border-primary/30 h-fit">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity size={16} className="text-primary" />
              Estado de tareas automáticas
            </CardTitle>
            <CardDescription>Última ejecución de cada tarea programada{date ? ` · ${moment(date + 'T00:00:00').format('DD/MM/YYYY')}` : ''}</CardDescription>
          </div>
          <button onClick={handleRefresh} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" aria-label="Refrescar" disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw size={16} className="animate-spin" /> Cargando…
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tareas registradas.</p>
        ) : (
          <div className="space-y-3">
            {tasks.map(t => {
              const s = STATUS[t.todayStatus] || STATUS.sin_ejecutar;
              const Icon = s.Icon;
              return (
                <div key={t.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className={`shrink-0 ${s.text}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{TASK_LABELS[t.name] || t.name}</p>
                      {t.lastRunAt && (
                        <p className="text-xs text-muted-foreground">
                          {moment(t.lastRunAt).format('DD/MM HH:mm')}
                          {t.durationMs != null ? ` · ${t.durationMs}ms` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${t.todayStatus === 'ok' ? 'bg-success/10 text-success' : t.todayStatus === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </div>
              );
            })}
            {tasks.some(t => t.todayStatus === 'error' && t.lastError) && (
              <div className="mt-2 space-y-2">
                {tasks.filter(t => t.todayStatus === 'error' && t.lastError).map(t => (
                  <div key={t.name} className="text-xs text-destructive bg-destructive/5 rounded-lg p-2 border border-destructive/20">
                    <span className="font-medium">{TASK_LABELS[t.name] || t.name}:</span> {t.lastError}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}