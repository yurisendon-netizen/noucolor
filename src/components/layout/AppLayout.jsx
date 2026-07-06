import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import BottomTabs from '@/components/layout/BottomTabs';
import KeepAliveOutlet from '@/components/layout/KeepAliveOutlet';
import { useIsMobile } from '@/hooks/use-mobile';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';

const LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin, isJefe, loading } = useEmployeeProfile();
  const isMobile = useIsMobile();
  const keepAlivePaths = isJefe
    ? ['/', '/partes-trabajo', '/empleados']
    : ['/', '/control-horario', '/partes-trabajo'];

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-[hsl(35,92%,55%)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header
          className="lg:hidden bg-sidebar border-b border-border shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center justify-between h-14 px-4">
            <img src={LOGO} alt="Noucolor" className="h-7 w-auto" />
            <button onClick={() => setSidebarOpen(true)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground" aria-label="Abrir menú">
              <Menu size={22} />
            </button>
          </div>
        </header>
        <main className={`flex-1 overscroll-none relative ${isMobile ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {isMobile ? (
            <KeepAliveOutlet keepAlivePaths={keepAlivePaths} />
          ) : (
            <div className="page-transition pb-24 lg:pb-0">
              <Outlet />
            </div>
          )}
        </main>
      </div>
      <BottomTabs isJefe={isJefe} />
    </div>
  );
}