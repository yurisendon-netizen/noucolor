import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Clock, FileText, ShieldCheck, Users, 
  CalendarCheck, Receipt, MapPin, BookOpen, LogOut, X, ChevronLeft, Timer, UserX, ClipboardList, BarChart3
} from 'lucide-react';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { base44 } from '@/api/base44Client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';

const navItems = [
  { path: '/', label: 'Inicio', icon: LayoutDashboard, adminOnly: false },
  { path: '/control-horario', label: 'Control Horario', icon: Clock, adminOnly: false, hideForJefe: true },
  { path: '/horas-extras', label: 'Horas Extras', icon: Timer, adminOnly: false, hideForJefe: true },
  { path: '/partes-trabajo', label: 'Partes de Trabajo', icon: FileText, adminOnly: false },
  { path: '/justificantes', label: 'Justificantes', icon: ShieldCheck, adminOnly: false },
  { path: '/empleados', label: 'Empleados', icon: Users, adminOnly: true },
  { path: '/revision-jornadas', label: 'Revisión Jornadas', icon: CalendarCheck, adminOnly: true },
  { path: '/nominas', label: 'Nóminas', icon: Receipt, adminOnly: true },
  { path: '/geolocalizacion', label: 'Geolocalización', icon: MapPin, adminOnly: true },
  { path: '/recogida-datos', label: 'Recogida Datos', icon: ClipboardList, adminOnly: true },
  { path: '/informes', label: 'Informes', icon: BarChart3, adminOnly: true },
  { path: '/normas', label: 'Normas Empresa', icon: BookOpen, adminOnly: false, hideForJefe: true },
];

export default function Sidebar({ isOpen, onClose, isAdmin, collapsed, onToggleCollapse }) {
  const location = useLocation();
  const { employee, logout, isJefe } = useCustomAuth();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredItems = navItems.filter(item => {
    if (isJefe) return !item.hideForJefe;
    return !item.adminOnly || isAdmin;
  });

  const handleLogout = () => {
    logout();
  };

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      if (employee?.id) {
        await base44.entities.Employee.delete(employee.id);
      }
      localStorage.removeItem('noucolor_session');
      localStorage.removeItem('noucolor_emp_id');
      toast({ title: 'Cuenta eliminada' });
      window.location.href = '/login';
    } catch (e) {
      toast({ title: 'Error al eliminar la cuenta', variant: 'destructive' });
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[1050] lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-[100dvh] z-[1100] 
        bg-sidebar border-r border-border
        transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 lg:static lg:h-screen
        ${collapsed ? 'w-[72px]' : 'w-64'}
        flex flex-col
      `}>
        <div className={`flex items-center h-16 border-b border-border px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <img src="https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png" alt="Noucolor" className="h-9 w-auto" />
          )}
          {collapsed && (
            <img src="https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png" alt="Noucolor" className="h-9 w-auto" />
          )}
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
          <button onClick={onToggleCollapse} className="hidden lg:block text-muted-foreground hover:text-foreground">
            <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 py-4 px-2 pb-6 space-y-1 overflow-y-auto overflow-x-hidden">
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

        <div className="shrink-0 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-border space-y-1">
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <button
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full
                  text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <UserX size={20} className="shrink-0" />
                {!collapsed && <span>Eliminar Cuenta</span>}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción es permanente e irreversible. Se eliminarán todos tus datos y no podrás iniciar sesión de nuevo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full
              text-muted-foreground hover:text-foreground hover:bg-secondary transition-all
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