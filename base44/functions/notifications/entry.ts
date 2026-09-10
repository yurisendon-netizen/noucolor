import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';

// API del centro de notificaciones para admins. Se invoca desde el cliente con
// authInvoke (sessionToken). Verifica admin vía sesión de Employee y opera en
// service role sobre la entidad Notification.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation, sessionToken } = body;

    const session = await verifySession(base44, sessionToken);
    if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

    // Los admins ven todas las notificaciones (centro de notificaciones / log).
    // Los operarios ven SOLO las suyas (mismo employee_id): como todo tipo de
    // notificación lleva employee_id, el filtro aísla a cada trabajador y nunca
    // le llega nada destinado a otro empleado o genérico de admin.
    const callerEmployeeId = session.employee.id;
    const isAdmin = session.isAdmin;
    const ownOnly = (n) => isAdmin || (n.employee_id && n.employee_id === callerEmployeeId);

    switch (operation) {
      case 'list': {
        const data = await base44.asServiceRole.entities.Notification.list('-created_date', 50);
        return Response.json({ success: true, notifications: data.filter(ownOnly) });
      }
      case 'unreadCount': {
        const data = await base44.asServiceRole.entities.Notification.filter({ read: false });
        return Response.json({ success: true, count: data.filter(ownOnly).length });
      }
      case 'markRead': {
        const { id } = body;
        if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
        const found = await base44.asServiceRole.entities.Notification.filter({ id });
        if (found.length === 0) return Response.json({ error: 'No encontrada' }, { status: 404 });
        if (!isAdmin && found[0].employee_id !== callerEmployeeId) {
          return Response.json({ error: 'Prohibido' }, { status: 403 });
        }
        await base44.asServiceRole.entities.Notification.update(id, { read: true });
        return Response.json({ success: true });
      }
      case 'markAllRead': {
        const unread = await base44.asServiceRole.entities.Notification.filter({ read: false });
        const mine = unread.filter(ownOnly);
        for (const n of mine) {
          await base44.asServiceRole.entities.Notification.update(n.id, { read: true });
        }
        return Response.json({ success: true, updated: mine.length });
      }
      default:
        return Response.json({ error: 'Operación no válida' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});