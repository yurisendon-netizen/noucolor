import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useCustomAuth } from '@/lib/CustomAuthContext';
import { authInvoke } from '@/lib/authInvoke';
import { Trash2 } from 'lucide-react';

export default function DeleteAccountDialog() {
  const { toast } = useToast();
  const { logout } = useCustomAuth();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authInvoke('deleteMyAccount');
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'No se pudo eliminar la cuenta');
      }
      toast({
        title: 'Cuenta eliminada',
        description: 'Tu cuenta y tus datos personales se han eliminado correctamente.'
      });
      logout();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error al eliminar la cuenta',
        description: err.message || 'Inténtalo de nuevo más tarde.'
      });
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 size={16} />
          Eliminar Cuenta
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar tu cuenta?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción es permanente. Se eliminarán tu acceso a la app y tus datos personales
            (perfil y datos de trabajador). Los registros laborales de la empresa se conservan por
            obligación legal. Para volver a usar Noucolor tendrás que ser dado de alta de nuevo
            por un administrador.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Eliminando...' : 'Sí, eliminar mi cuenta'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}