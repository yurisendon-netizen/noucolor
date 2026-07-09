import React, { useRef, useState, useEffect } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SignaturePadInput({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function emit() {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange?.(dataUrl);
  }

  function startDraw(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    lastPos.current = pos;
    if (!hasSignature) setHasSignature(true);
  }

  function endDraw() {
    if (drawing.current) {
      drawing.current = false;
      lastPos.current = null;
      emit();
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange?.(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded-lg border border-dashed border-border bg-white touch-none cursor-crosshair"
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />
      {hasSignature && (
        <Button type="button" variant="ghost" size="sm" onClick={clear} className="mt-1 gap-1 text-muted-foreground">
          <Eraser size={14} /> Limpiar firma
        </Button>
      )}
    </div>
  );
}