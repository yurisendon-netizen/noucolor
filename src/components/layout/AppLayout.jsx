import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin, loading } = useEmployeeProfile();

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
      <main className="flex-1 overflow-y-auto">
        <div className="page-transition">
          <Outlet />
        </div>
      </main>

      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-6 right-6 z-30 lg:hidden w-14 h-14 rounded-full bg-[hsl(35,92%,55%)] text-black shadow-lg shadow-[hsl(35,92%,55%)]/25 flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Menu size={24} />
      </button>
    </div>
  );
}