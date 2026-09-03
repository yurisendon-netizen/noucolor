import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { authInvoke } from '@/lib/authInvoke';
import PinPad from '@/components/pin/PinPad';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';

const LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';

// Segunda pantalla de registro (estilo Armo): el empleado crea o cambia su
// propio código de seguridad de 4 dígitos. Primera vez: nuevo + confirmar.
// Cambio: código actual + nuevo + confirmar.
export default function CodigoSeguridad() {
  const navigate = useNavigate();
  const { employee } = useCustomAuth();
  const { toast } = useToast();
  const hasPin = employee?.pin_set === true;
  const [step, setStep] = useState(hasPin ? 'current' : 'new');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const stepInfo = {
    current: { title: 'Cambia tu código', text: 'Introduce tu código actual' },
    new: { title: hasPin ? 'Cambia tu código' : 'Crea tu código de seguridad', text: 'Elige un código de 4 dígitos' },
    confirm: { title: hasPin ? 'Cambia tu código' : 'Crea tu código de seguridad', text: 'Repite el código para confirmar' },
  }[step];

  async function submit(finalPin) {
    setLoading(true);
    setError('');
    try {
      const res = await authInvoke('employeePin', {
        action: 'set',
        pin: finalPin,
        ...(hasPin ? { current_pin: currentPin } : {}),
      });
      if (res.data?.success) {
        sessionStorage.setItem('noucolor_pin_ok', '1');
        toast({
          title: 'Código de seguridad guardado',
          description: hasPin
            ? undefined
            : 'A partir de ahora entrarás solo con tu código, sin contraseña.',
        });
        navigate('/');
      } else {
        setStep('current');
        setPin('');
        setError(res.data?.error || 'No se pudo guardar el código');
      }
    } catch (err) {
      setStep('current');
      setPin('');
      setError(err.message || 'Error al guardar el código');
    } finally {
      setLoading(false);
    }
  }

  function handleDigit(v) {
    setError('');
    setPin(v);
    if (v.length !== 4 || loading) return;
    if (step === 'current') {
      setCurrentPin(v);
      setPin('');
      setStep('new');
    } else if (step === 'new') {
      setNewPin(v);
      setPin('');
      setStep('confirm');
    } else if (v === newPin) {
      submit(v);
    } else {
      setError('Los códigos no coinciden. Vuelve a empezar.');
      setPin('');
      setStep('new');
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 15%, hsl(35 92% 55% / 0.12), transparent 55%)' }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm text-center">
        <img src={LOGO} alt="Noucolor" className="mx-auto h-16 w-auto mb-4 rounded-lg" />
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 mb-4">
          <ShieldCheck className="text-primary" size={22} />
        </div>
        <h1 className="text-xl font-bold">{stepInfo.title}</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-2">{stepInfo.text}</p>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <PinPad value={pin} onChange={handleDigit} disabled={loading} />
        {loading && (
          <p className="mt-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Guardando...
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {step === 'confirm' && (
            <button
              type="button"
              onClick={() => { setStep('new'); setPin(''); }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Atrás
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}