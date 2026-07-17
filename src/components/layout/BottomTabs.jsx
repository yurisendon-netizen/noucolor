import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Clock, FileText, Users } from 'lucide-react';

const defaultTabs = [
  { path: '/', label: 'Inicio', icon: LayoutDashboard },
  { path: '/control-horario', label: 'Horario', icon: Clock },
  { path: '/partes-trabajo', label: 'Partes', icon: FileText },
];

const jefeTabs = [
  { path: '/', label: 'Inicio', icon: LayoutDashboard },
  { path: '/partes-trabajo', label: 'Partes', icon: FileText },
  { path: '/empleados', label: 'Equipo', icon: Users },
];

export default function BottomTabs({ isJefe }) {
  const location = useLocation();
  const tabs = isJefe ? jefeTabs : defaultTabs;
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-sidebar border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* pr reserves space for Base44's own fixed bottom-right badge (~213px), so no tab sits under it */}
      <div className="flex items-center justify-around h-16 pr-[232px]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors ${active ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground'}`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}