import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { verifySession } from '../../shared/employeeAuth.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Balance de obras: ventas, costes y beneficio de cada trabajo.
//
// Mano de obra (exacta, sin estimaciones):
//   coste/hora empresa = salario bruto mensual × (1 + CASS empresa %) ÷ horas/mes
//   coste obra        = Σ (horas del parte × coste/hora empresa del trabajador)
// Las horas salen de los Partes de Trabajo vinculados a la obra.
// Todos los importes se guardan y se calculan en céntimos para evitar
// errores de redondeo; se devuelven en euros con 2 decimales.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = { horas_mes: 162, cass_empresa_pct: 15.5 };
const ESTADOS = ['presupuestada', 'en_curso', 'finalizada', 'facturada', 'cobrada'];
const CATEGORIAS = ['material', 'subcontrata', 'desplazamiento', 'maquinaria', 'mano_obra_externa', 'otros'];

// Acepta 1234.5, "1234,5" y "1.234,50" (formato español).
const toCents = (v) => {
  let n;
  if (typeof v === 'number') n = v;
  else {
    const s = String(v ?? '').trim().replace(/\s|€/g, '');
    n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  }
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const euros = (c) => Math.round(c) / 100;
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function getConfig(base44) {
  const list = await base44.asServiceRole.entities.BalanceConfig.list('-created_date', 1);
  if (list.length === 0) return { id: null, ...DEFAULT_CONFIG };
  const c = list[0];
  return {
    id: c.id,
    horas_mes: Number(c.horas_mes) > 0 ? Number(c.horas_mes) : DEFAULT_CONFIG.horas_mes,
    cass_empresa_pct: Number.isFinite(Number(c.cass_empresa_pct)) ? Number(c.cass_empresa_pct) : DEFAULT_CONFIG.cass_empresa_pct,
  };
}

// Coste real por hora para la empresa de cada trabajador (en céntimos).
function buildRates(employees, config) {
  const rates = {};
  for (const e of employees) {
    const bruto = Number(e.base_salary) || 0;
    const netoHora = Number(e.precioHora) || 0;
    let centsHora = 0;
    let origen = 'sin_datos';
    if (bruto > 0) {
      centsHora = Math.round((bruto * 100 * (1 + config.cass_empresa_pct / 100)) / config.horas_mes);
      origen = 'salario_bruto';
    } else if (netoHora > 0) {
      // Sin bruto: se reconstruye desde el precio/hora neto (CASS trabajador 6,5 %).
      centsHora = Math.round(((netoHora * 100) / 0.935) * (1 + config.cass_empresa_pct / 100));
      origen = 'precio_hora';
    }
    rates[e.id] = { id: e.id, nombre: e.full_name, cents_hora: centsHora, origen };
  }
  return rates;
}

function computeObra(obra, partes, costes, rates) {
  const misPartes = partes.filter(p => p.obra_id === obra.id);
  const porTrabajador = {};
  let horas = 0;
  let manoObraCents = 0;
  const avisos = new Set();

  for (const p of misPartes) {
    for (const h of (Array.isArray(p.horas_trabajadas) ? p.horas_trabajadas : [])) {
      const hrs = Math.round((Number(h.horas) || 0) * 100) / 100;
      if (hrs <= 0) continue;
      const r = rates[h.employee_id];
      const centsHora = r ? r.cents_hora : 0;
      if (!r || centsHora === 0) avisos.add(`${h.employee_name || 'Trabajador'} no tiene salario definido: sus horas cuentan a 0 €.`);
      const coste = Math.round(hrs * centsHora);
      const key = h.employee_id || h.employee_name;
      if (!porTrabajador[key]) porTrabajador[key] = { employee_id: h.employee_id, nombre: h.employee_name || r?.nombre || '—', horas: 0, coste_hora: euros(centsHora), coste_cents: 0 };
      porTrabajador[key].horas = Math.round((porTrabajador[key].horas + hrs) * 100) / 100;
      porTrabajador[key].coste_cents += coste;
      horas = Math.round((horas + hrs) * 100) / 100;
      manoObraCents += coste;
    }
  }

  const misCostes = costes.filter(c => c.obra_id === obra.id);
  const porCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, 0]));
  let otrosCents = 0;
  for (const c of misCostes) {
    const cents = toCents(c.importe);
    otrosCents += cents;
    porCategoria[CATEGORIAS.includes(c.categoria) ? c.categoria : 'otros'] += cents;
  }

  const presupuestoCents = toCents(obra.importe_presupuesto);
  const facturadoCents = toCents(obra.importe_facturado);
  const ventaReal = facturadoCents > 0;
  const ventaCents = ventaReal ? facturadoCents : presupuestoCents;
  const costeCents = manoObraCents + otrosCents;
  const beneficioCents = ventaCents - costeCents;

  return {
    ...obra,
    partes_count: misPartes.length,
    horas,
    venta: euros(ventaCents),
    venta_es_facturada: ventaReal,
    presupuesto: euros(presupuestoCents),
    facturado: euros(facturadoCents),
    coste_mano_obra: euros(manoObraCents),
    coste_otros: euros(otrosCents),
    coste_total: euros(costeCents),
    beneficio: euros(beneficioCents),
    margen_pct: ventaCents > 0 ? Math.round((beneficioCents / ventaCents) * 1000) / 10 : null,
    coste_por_categoria: Object.fromEntries(Object.entries(porCategoria).map(([k, v]) => [k, euros(v)])),
    mano_obra_detalle: Object.values(porTrabajador)
      .map(t => ({ ...t, coste: euros(t.coste_cents) }))
      .sort((a, b) => b.coste - a.coste),
    avisos: [...avisos],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { operation, sessionToken } = body;

    const session = await verifySession(base44, sessionToken);
    if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
    const db = base44.asServiceRole.entities;

    // Cualquier trabajador puede ver la lista corta de obras abiertas
    // (solo id y nombre) para asignar su parte de trabajo a una obra.
    if (operation === 'listObrasAbiertas') {
      const obras = await db.Obra.list('-created_date', 500);
      return Response.json({
        success: true,
        obras: obras
          .filter(o => ['presupuestada', 'en_curso'].includes(o.estado || 'en_curso'))
          .map(o => ({ id: o.id, nombre: o.nombre, cliente: o.cliente || '' })),
      });
    }

    if (!session.isAdmin) return Response.json({ error: 'Prohibido' }, { status: 403 });

    switch (operation) {
      case 'getAll': {
        const [config, obras, costes, partes, employees] = await Promise.all([
          getConfig(base44),
          db.Obra.list('-created_date', 1000),
          db.CosteObra.list('-fecha', 5000),
          db.WorkOrder.list('-date', 5000),
          db.Employee.list('full_name', 500),
        ]);
        const rates = buildRates(employees, config);
        const result = obras.map(o => computeObra(o, partes, costes, rates));
        return Response.json({
          success: true,
          config,
          obras: result,
          costes,
          partes: partes.map(p => ({
            id: p.id, title: p.title, client_name: p.client_name, date: p.date,
            total_horas: p.total_horas || 0, obra_id: p.obra_id || null,
            assigned_name: p.assigned_name, horas_trabajadas: p.horas_trabajadas || [],
          })),
          tarifas: Object.values(rates)
            .filter(r => !/tester/i.test(r.nombre || ''))
            .map(r => ({ id: r.id, nombre: r.nombre, coste_hora: euros(r.cents_hora), origen: r.origen })),
        });
      }

      case 'saveObra': {
        const f = body.obra || {};
        const nombre = str(f.nombre, 200);
        if (!nombre) return Response.json({ error: 'El nombre de la obra es obligatorio.' }, { status: 400 });
        const data = {
          nombre,
          cliente: str(f.cliente, 200),
          direccion: str(f.direccion, 300),
          estado: ESTADOS.includes(f.estado) ? f.estado : 'en_curso',
          fecha_inicio: date(f.fecha_inicio),
          fecha_fin: date(f.fecha_fin),
          importe_presupuesto: euros(toCents(f.importe_presupuesto)),
          importe_facturado: euros(toCents(f.importe_facturado)),
          notas: str(f.notas, 5000),
        };
        const saved = f.id ? await db.Obra.update(f.id, data) : await db.Obra.create(data);
        return Response.json({ success: true, obra: saved });
      }

      case 'deleteObra': {
        const { obraId } = body;
        if (!obraId) return Response.json({ error: 'Falta obraId' }, { status: 400 });
        const [costes, partes] = await Promise.all([
          db.CosteObra.filter({ obra_id: obraId }),
          db.WorkOrder.filter({ obra_id: obraId }),
        ]);
        for (const c of costes) await db.CosteObra.delete(c.id);
        // Los partes NO se borran: solo se desvinculan de la obra.
        for (const p of partes) await db.WorkOrder.update(p.id, { obra_id: null });
        await db.Obra.delete(obraId);
        return Response.json({ success: true });
      }

      case 'saveCoste': {
        const f = body.coste || {};
        const concepto = str(f.concepto, 300);
        if (!f.obra_id || !concepto) return Response.json({ error: 'Faltan datos: concepto e importe son obligatorios.' }, { status: 400 });
        const data = {
          obra_id: f.obra_id,
          concepto,
          categoria: CATEGORIAS.includes(f.categoria) ? f.categoria : 'otros',
          proveedor: str(f.proveedor, 200),
          fecha: date(f.fecha),
          factura_ref: str(f.factura_ref, 100),
          importe: euros(toCents(f.importe)),
        };
        const saved = f.id ? await db.CosteObra.update(f.id, data) : await db.CosteObra.create(data);
        return Response.json({ success: true, coste: saved });
      }

      case 'deleteCoste': {
        if (!body.costeId) return Response.json({ error: 'Falta costeId' }, { status: 400 });
        await db.CosteObra.delete(body.costeId);
        return Response.json({ success: true });
      }

      // Vincula (obraId) o desvincula (obraId = null) varios partes a la vez.
      case 'linkPartes': {
        const ids = Array.isArray(body.parteIds) ? body.parteIds.filter(x => typeof x === 'string') : [];
        const obraId = typeof body.obraId === 'string' && body.obraId ? body.obraId : null;
        for (const id of ids) await db.WorkOrder.update(id, { obra_id: obraId });
        return Response.json({ success: true, count: ids.length });
      }

      case 'saveConfig': {
        const horas_mes = parseFloat(String(body.config?.horas_mes ?? '').replace(',', '.'));
        const cass = parseFloat(String(body.config?.cass_empresa_pct ?? '').replace(',', '.'));
        if (!(horas_mes > 0 && horas_mes <= 400) || !(cass >= 0 && cass <= 100)) {
          return Response.json({ error: 'Valores no válidos.' }, { status: 400 });
        }
        const current = await getConfig(base44);
        const data = { horas_mes, cass_empresa_pct: cass };
        if (current.id) await db.BalanceConfig.update(current.id, data);
        else await db.BalanceConfig.create(data);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Operación no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('balanceObras', error);
    return Response.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
});
