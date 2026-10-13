import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const categoryLabels = {
  general: 'General', seguridad: 'Seguridad', horarios: 'Horarios',
  conducta: 'Conducta', equipamiento: 'Equipamiento',
};
const categoryColors = {
  general: 'bg-blue-500/15 text-blue-400',
  seguridad: 'bg-red-500/15 text-red-400',
  horarios: 'bg-purple-500/15 text-purple-400',
  conducta: 'bg-yellow-500/15 text-yellow-400',
  equipamiento: 'bg-emerald-500/15 text-emerald-400',
};

const reglamento = [
  {
    n: 1, title: 'Objeto', category: 'general',
    content: 'El presente Reglamento Interno establece las normas de organización, conducta y funcionamiento que deben cumplir todos los trabajadores de NouColor durante el desarrollo de su actividad laboral.\n\nSu cumplimiento es obligatorio para todo el personal, independientemente de su categoría profesional o tipo de contrato.'
  },
  {
    n: 2, title: 'Horario laboral', category: 'horarios',
    content: 'Los trabajadores deberán:\n• Cumplir estrictamente el horario asignado.\n• Fichar la entrada, salida y descansos cuando exista sistema de control horario.\n• Llegar puntualmente al puesto de trabajo.\n• Comunicar cualquier retraso antes del inicio de la jornada.\n• No abandonar el puesto sin autorización del responsable.'
  },
  {
    n: 3, title: 'Uniforme e imagen', category: 'equipamiento',
    content: 'Cuando la empresa facilite uniforme o ropa de trabajo:\n• Será obligatorio utilizarla durante toda la jornada.\n• Deberá mantenerse limpia y en buen estado.\n• No podrá modificarse sin autorización.\n• Será obligatorio utilizar el calzado de seguridad cuando corresponda.'
  },
  {
    n: 4, title: 'Equipos de Protección Individual (EPI)', category: 'seguridad',
    content: 'Todo trabajador deberá utilizar los EPI facilitados por la empresa.\n\nSu uso será obligatorio cuando la actividad lo requiera.\n\nNo utilizar los equipos de protección podrá dar lugar a una sanción disciplinaria.'
  },
  {
    n: 5, title: 'Vehículos de empresa', category: 'general',
    content: 'Los vehículos únicamente podrán utilizarse para fines laborales.\n\nEstá prohibido:\n• Utilizar el vehículo para fines personales sin autorización.\n• Fumar dentro del vehículo.\n• Transportar personas ajenas a la empresa sin autorización.\n• Conducir bajo los efectos del alcohol o drogas.\n• Manipular el teléfono móvil mientras se conduce.\n\nEl trabajador será responsable de comunicar inmediatamente cualquier accidente o avería.'
  },
  {
    n: 6, title: 'Herramientas y maquinaria', category: 'equipamiento',
    content: 'Todo trabajador deberá:\n• Utilizar correctamente las herramientas.\n• Mantenerlas limpias.\n• Guardarlas en su lugar correspondiente.\n• Comunicar cualquier avería.\n• No retirar herramientas de la empresa sin autorización.\n\nLos daños ocasionados por negligencia podrán dar lugar a sanciones.'
  },
  {
    n: 7, title: 'Uso del teléfono móvil', category: 'conducta',
    content: 'Durante la jornada laboral:\n• El uso personal del teléfono móvil estará limitado a casos de necesidad.\n• Está prohibido utilizar redes sociales durante el horario de trabajo salvo autorización.\n• No podrán realizarse fotografías o vídeos de clientes, instalaciones o trabajos sin autorización.'
  },
  {
    n: 8, title: 'Confidencialidad', category: 'conducta',
    content: 'Toda la información relacionada con clientes, presupuestos, proyectos, precios y procesos internos tendrá carácter confidencial.\n\nQueda prohibido divulgar información de la empresa.\n\nEsta obligación continuará incluso después de finalizar la relación laboral.'
  },
  {
    n: 9, title: 'Protección de datos', category: 'general',
    content: 'Los trabajadores deberán cumplir las normas de protección de datos y utilizar únicamente la información necesaria para el desempeño de sus funciones.'
  },
  {
    n: 10, title: 'Conducta profesional', category: 'conducta',
    content: 'Todos los trabajadores deberán:\n• Mantener un trato respetuoso con clientes y compañeros.\n• Colaborar con el resto del equipo.\n• Seguir las instrucciones de los responsables.\n• Mantener una actitud profesional.\n• Evitar discusiones o comportamientos que alteren el ambiente laboral.'
  },
  {
    n: 11, title: 'Alcohol y drogas', category: 'seguridad',
    content: 'Está prohibido acudir al trabajo bajo los efectos del alcohol o drogas cuando ello afecte al desempeño del trabajo o comprometa la seguridad.'
  },
  {
    n: 12, title: 'Seguridad y prevención', category: 'seguridad',
    content: 'Todo trabajador deberá:\n• Cumplir las normas de seguridad.\n• Informar de cualquier accidente.\n• Comunicar situaciones de riesgo.\n• Participar en las formaciones de prevención.'
  },
  {
    n: 13, title: 'Limpieza y orden', category: 'general',
    content: 'Cada trabajador será responsable de:\n• Mantener limpio su puesto.\n• Depositar residuos en los lugares habilitados.\n• Mantener el almacén organizado.\n• Devolver el material utilizado.'
  },
  {
    n: 14, title: 'Prohibiciones', category: 'conducta',
    content: 'Queda prohibido:\n• Robar material.\n• Falsificar documentos.\n• Alterar registros horarios.\n• Agredir física o verbalmente a cualquier persona.\n• Acosar a compañeros.\n• Dañar intencionadamente bienes de la empresa.\n• Revelar información confidencial.\n• Utilizar material de la empresa para beneficio personal sin autorización.\n• Abandonar el puesto sin permiso.'
  },
  {
    n: 15, title: 'Régimen disciplinario', category: 'general',
    content: 'Las infracciones podrán clasificarse en:\n\nFaltas leves, graves y muy graves con sanciones proporcionales según la legislación andorrana.'
  },
  {
    n: 16, title: 'Pla horari (plan de trabajo)', category: 'horarios',
    content: 'Plan de trabajo de todo el personal de obra (Llei 31/2018, art. 59.1):\n\n• Jornada: lunes a viernes de 8:00 a 16:00 (40 h semanales).\n• Pausa: de 12:30 a 13:00, retribuida (cuenta como tiempo de trabajo).\n• Horario de entrada flexible: por acuerdo individual (p. ej. quien tiene otro trabajo), algunos trabajadores pueden entrar entre las 7:00 y las 15:00. Su jornada son 8 h desde la hora de entrada.\n• Descanso semanal: sábado y domingo.\n• Descanso mínimo entre jornadas: 12 horas.\n• Horas extra: solo cuando la empresa las pida; son voluntarias para el trabajador (salvo fuerza mayor). Máximo legal 12 h/semana, 48 h/mes y 426 h/año. Se pagan como mínimo un 40 % más que la hora normal y cotizan a la CASS.\n• Trabajo en sábado o domingo: cuenta como horas extra.\n• Solo se pagan las horas extra que la empresa ha pedido y aprobado en la app (Horas Extras). Las no aprobadas no se pagan.\n• Vacaciones: 30 días naturales al año. Se fijan en el plan con un mínimo de 45 días de antelación.\n• Cualquier cambio de horario se comunica con un mínimo de 7 días naturales de antelación (salvo fuerza mayor).\n• Cada mes se entrega, junto con la nómina, el compte d\'hores (horas trabajadas, extras, festivos trabajados, vacaciones y ausencias). El trabajador tiene 7 días naturales para comunicar cualquier error desde la app (Nóminas → Reclamar).\n\nEste plan está también expuesto en el taller.'
  },
  {
    n: 17, title: 'Fichaje y geolocalización', category: 'general',
    content: 'Información sobre el tratamiento de datos de ubicación (Llei 29/2021 qualificada de protecció de dades personals):\n\n• Responsable: PINTURES I DECORACIÓ NOU COLOR, S.L.\n• Para qué: únicamente para el registro de jornada (saber dónde se ficha la entrada y la salida, en obra o en el taller). Es una obligación legal de la empresa llevar el registro de horas.\n• Cuándo: la ubicación se toma SOLO en el momento de fichar la entrada y la salida. La app no sigue al trabajador durante la jornada ni fuera de ella.\n• Quién la ve: solo la dirección y los administradores de la empresa.\n• Cuánto tiempo: las coordenadas se borran automáticamente a los 2 meses. Las horas de entrada y salida se conservan el tiempo que exige la ley.\n• Derechos: puedes pedir acceso, rectificación o supresión de tus datos a la dirección de la empresa, y reclamar ante la Agència Andorrana de Protecció de Dades (APDA).\n• Para fichar es necesario activar la ubicación precisa del móvil. Si no puedes, avisa al responsable y te abrirá el fichaje manualmente.'
  },
];

export default function ReglamentoInterno() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">Reglamento Interno de Noucolor</h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/15 text-primary">
          15 secciones
        </span>
      </div>
      <Accordion type="multiple" className="space-y-3">
        {reglamento.map(sec => (
          <AccordionItem
            key={sec.n}
            value={`sec-${sec.n}`}
            className="bg-card rounded-xl border border-border px-4 sm:px-5 data-[state=open]:border-primary/30 transition-colors"
          >
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-left min-w-0">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {sec.n}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[sec.category]}`}>
                    {categoryLabels[sec.category]}
                  </span>
                </div>
                <span className="font-medium">{sec.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{sec.content}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}