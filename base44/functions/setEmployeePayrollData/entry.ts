import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Utilidad de un solo uso para cargar/corregir los datos de nómina de toda
// la plantilla de golpe (precio/hora, salario base y neto, CASS, IBAN,
// teléfono, fecha de incorporación y contraseña). Se dispara a mano desde
// Base44 Studio, no tiene automatización asociada.
//
// El email se actualiza SOLO si viene informado aquí — varios empleados ya
// tenían el suyo cargado por separado (ver setEmployeeEmails) y no debe
// pisarse con un valor en blanco.
const EMPLOYEE_DATA = [
  {
    user: 'andrea', full_name: 'Andrea Besoli Thomas', pass: '190701U', role: 'administrador',
    precioHora: 9.26, base_salary: 1604.28, net_salary: 1500.00,
    email: 'besoli6@hotmail.com', phone: '(+376 614 904)', nss: '190701U',
    iban: 'AD13 0001 0000 4135 0800 0100', hire_date: '2022-10-17',
  },
  {
    user: 'julio', full_name: 'Julio Eduardo Malter', pass: '378645E', role: 'operario',
    precioHora: 14.50, base_salary: 2513.37, net_salary: 2350.00,
    email: null, phone: '(+376 619 617)', nss: '378645E',
    iban: 'AD12 0003 1101 1263 9871 0101', hire_date: '2023-08-07',
  },
  {
    user: 'bruno', full_name: 'Bruno Miguel Moreira Fernandes', pass: '106031H', role: 'operario',
    precioHora: 16.04, base_salary: 2780.74, net_salary: 2600.00,
    email: null, phone: '(+376 664 658)', nss: '106031H',
    iban: 'AD82 0007 0028 0002 4100 3011', hire_date: '2023-08-07',
  },
  {
    user: 'fernando', full_name: 'Fernando Barreal Fernandez', pass: '191699C', role: 'operario',
    precioHora: 14.36, base_salary: 2488.46, net_salary: 2326.71,
    email: null, phone: '(+376 351 276)', nss: '191699C',
    iban: 'AD28 0003 1101 1027 4731 0102', hire_date: '2022-10-04',
  },
  {
    user: 'nabil', full_name: 'Nabil Zarioh Nafei', pass: '232335X', role: 'operario',
    precioHora: 11.06, base_salary: 1916.56, net_salary: 1791.98,
    email: 'nabilzarioh511@gmail.com', phone: '(+376 387 987)', nss: '232335X',
    iban: 'AD42 0008 0004 6512 0033 1587', hire_date: '2020-11-26',
  },
  {
    user: 'jordi', full_name: 'Jordi Areny Andorra', pass: '028809T', role: 'operario',
    precioHora: 10.49, base_salary: 1818.18, net_salary: 1700.00,
    email: null, phone: '(+376 670 068)', nss: '028809T',
    iban: 'AD90 0003 1101 1222 6301 0101', hire_date: '2025-10-31',
  },
  {
    user: 'roger', full_name: 'Roger Gomez Torrents', pass: '362041F', role: 'operario',
    precioHora: 10.49, base_salary: 1818.18, net_salary: 1700.00,
    email: null, phone: '(+376 343 005)', nss: '362041F',
    iban: 'AD09 0007 0028 0002 1756 3014', hire_date: '2026-04-28',
  },
  {
    user: 'yuri', full_name: 'Yuri Sendon Risco', pass: '283634F', role: 'administrador',
    precioHora: 9.04, base_salary: 1568.67, net_salary: 1466.71,
    email: 'yurisendon@gmail.com', phone: '(+376 696 102)', nss: '283634F',
    iban: 'AD45 0003 1101 1265 6101 0101', hire_date: '2026-06-25',
  },
  {
    // Exento de precio/hora y salario mensual — jefe, no ficha ni cobra por hora.
    user: 'jordism', full_name: 'Jordi Sendon Martinez', pass: '031938W', role: 'jefe',
    precioHora: null, base_salary: null, net_salary: null,
    email: 'noucolor@andorra.ad', phone: '(+376 335 626)', nss: '031938W',
    iban: 'AD68 0003 1101 1152 9691 0101', hire_date: null,
  },
];

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mismo formato que manageEmployee: '<salt>:<sha256(salt:password)>'
async function hashPassword(password) {
  const salt = randomSaltHex();
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hex}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const employees = await base44.asServiceRole.entities.Employee.list('-created_date', 200);

    const results = [];
    for (const row of EMPLOYEE_DATA) {
      const found = employees.find(e => (e.user || '').toLowerCase() === row.user);
      if (!found) {
        results.push({ user: row.user, error: 'No se encontró ningún empleado con ese usuario' });
        continue;
      }

      const update = {
        full_name: row.full_name,
        role: row.role,
        nss: row.nss,
        phone: row.phone,
        iban: row.iban,
        pass: await hashPassword(row.pass),
      };
      if (row.email) update.email = row.email;
      if (row.precioHora !== null) update.precioHora = row.precioHora;
      if (row.base_salary !== null) update.base_salary = row.base_salary;
      if (row.net_salary !== null) update.net_salary = row.net_salary;
      if (row.hire_date !== null) update.hire_date = row.hire_date;

      await base44.asServiceRole.entities.Employee.update(found.id, update);

      // DatosTrabajador se mantiene sincronizado igual que hace manageEmployee
      const datos = await base44.asServiceRole.entities.DatosTrabajador.filter({ employee_id: found.id });
      if (datos.length > 0) {
        const datosUpdate = {
          full_name: row.full_name,
          cargo: row.role,
          cass: row.nss,
          phone: row.phone,
          iban: row.iban,
        };
        if (row.email) datosUpdate.email = row.email;
        if (row.precioHora !== null) datosUpdate.precioHora = row.precioHora;
        if (row.hire_date !== null) datosUpdate.hire_date = row.hire_date;
        await base44.asServiceRole.entities.DatosTrabajador.update(datos[0].id, datosUpdate);
      }

      results.push({ user: row.user, name: row.full_name, updated: true });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
