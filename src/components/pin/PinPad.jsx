import React from 'react';
import { Delete } from 'lucide-react';

// Teclado numérico estilo Armo para el código de seguridad de 4 dígitos.
// Tap targets grandes (64px) para uso con guantes de trabajo.
export default function PinPad({ value, onChange, length = 4, disabled = false }) {
  const press = (d) => {
    if (!disabled && value.length < length) onChange(value + d);
  };
  const back = () => {
    if (!disabled && value.length > 0) onChange(value.slice(0, -1));
  };

  return (
    <div className="w-full max-w-xs mx-auto select-none">
      <div className="flex justify-center gap-4 mb-8" role="status" aria-label={`${value.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < value.length
                ? 'bg-primary border-primary shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                : 'border-muted-foreground/40'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={disabled}
            className="h-16 rounded-2xl bg-secondary text-2xl font-semibold active:scale-95 active:bg-accent transition-all disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press('0')}
          disabled={disabled}
          className="h-16 rounded-2xl bg-secondary text-2xl font-semibold active:scale-95 active:bg-accent transition-all disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          disabled={disabled}
          aria-label="Borrar"
          className="h-16 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground active:scale-95 active:bg-accent transition-all disabled:opacity-40"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}