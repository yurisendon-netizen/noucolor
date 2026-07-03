import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Clock, FileText, ShieldCheck, Users, 
  CalendarCheck, Receipt, MapPin, BookOpen, LogOut, X, ChevronLeft
} from 'lucide-react';
import { useCustomAuth } from '@/lib/CustomAuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { path: '/control-horario', label: 'Control Horario', icon: Clock, adminOnly: false },
  { path: '/partes-trabajo', label: 'Partes de Trabajo', icon: FileText, adminOnly: false },
  { path: '/justificantes', label: 'Justificantes', icon: ShieldCheck, adminOnly: false },
  { path: '/empleados', label: 'Empleados', icon: Users, adminOnly: true },
  { path: '/revision-jornadas', label: 'Revisión Jornadas', icon: CalendarCheck, adminOnly: true },
  { path: '/nominas', label: 'Nóminas', icon: Receipt, adminOnly: true },
  { path: '/geolocalizacion', label: 'Geolocalización', icon: MapPin, adminOnly: true },
  { path: '/normas', label: 'Normas Empresa', icon: BookOpen, adminOnly: false },
];

export default function Sidebar({ isOpen, onClose, isAdmin, collapsed, onToggleCollapse }) {
  const location = useLocation();
  const { logout } = useCustomAuth();

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full z-50 
        bg-[hsl(222,47%,7%)] border-r border-border
        transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 lg:static
        ${collapsed ? 'w-[72px]' : 'w-64'}
        flex flex-col
      `}>
        <div className={`flex items-center h-16 border-b border-border px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(35,92%,55%)] to-[hsl(25,90%,45%)] flex items-center justify-center">
                <span className="text-sm font-bold text-black">N</span>
              </div>
              <span className="font-bold text-lg tracking-tight">Noucolor</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(35,92%,55%)] to-[hsl(25,90%,45%)] flex items-center justify-center">
              <span className="text-sm font-bold text-black">N</span>
            </div>
          )}
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
          <button onClick={onToggleCollapse} className="hidden lg:block text-muted-foreground hover:text-foreground">
            <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {filteredItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${active 
                    ? 'bg-[hsl(35,92%,55%)]/10 text-[hsl(35,92%,55%)]' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <Icon size={20} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-border">
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full
              text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <LogOut size={20} className="shrink-0" />
            {!collapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}