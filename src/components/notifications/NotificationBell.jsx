import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { authInvoke } from '@/lib/authInvoke';
import moment from 'moment';

const TYPE_LABELS = {
  fichaje_entrada: 'Entrada',
  fichaje_salida: 'Salida',
  parte_trabajo: 'Parte',
  hora_extra: 'Hora extra',
  justificante: 'Justificante',
  nomina: 'Nómina',
  geolocalizacion: 'Ubicación',
  jornada_abierta: 'Jornada abierta'
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  async function loadUnread() {
    try {
      const res = await authInvoke('notifications', { operation: 'unreadCount' });
      setUnread(res.data?.count || 0);
    } catch { /* silent */ }
  }

  async function loadList() {
    setLoading(true);
    try {
      const res = await authInvoke('notifications', { operation: 'list' });
      const list = res.data?.notifications || [];
      setItems(list);
      setUnread(list.filter(n => !n.read).length);
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open]);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function markRead(id) {
    try {
      await authInvoke('notifications', { operation: 'markRead', id });
      setItems(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  }

  async function markAllRead() {
    try {
      await authInvoke('notifications', { operation: 'markAllRead' });
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* silent */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-lg z-[1200] max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notificaciones</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                <CheckCheck size={14} /> Marcar todas
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hay notificaciones</div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-secondary/40 transition-colors flex gap-3 ${!n.read ? 'bg-primary/5' : ''}`}
                >
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!n.read ? 'bg-primary' : 'bg-transparent border border-border'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{moment(n.created_date).fromNow()}</span>
                    </div>
                    <p className="text-sm font-medium mt-0.5 truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}