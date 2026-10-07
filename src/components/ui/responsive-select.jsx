import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResponsiveSelect({ value, onValueChange, options = [], placeholder, className }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  // Al cerrarse el cajón dentro de un formulario emergente, a veces el <body> se queda
  // bloqueado (sin scroll ni toques). Si no queda ningún cuadro abierto, se desbloquea.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const b = document.body;
      ['pointerEvents', 'overflow', 'position', 'top', 'left', 'right', 'width', 'height'].forEach(p => { b.style[p] = ''; });
      b.removeAttribute('data-scroll-locked');
    }, 500);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <>
      {/* Mobile: bottom sheet */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'lg:hidden flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
          !selected && 'text-muted-foreground',
          className
        )}
      >
        <span className="truncate">{selected ? selected.label : (placeholder || 'Seleccionar')}</span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{placeholder || 'Seleccionar'}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)] max-h-[55vh]">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onValueChange(opt.value); setOpen(false); }}
                className={cn(
                  'flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm text-left hover:bg-secondary transition-colors',
                  opt.value === value && 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                )}
              >
                <span>{opt.label}</span>
                {opt.value === value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Desktop: dropdown */}
      <div className="hidden lg:block">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className={className}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}