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
];

export default function ReglamentoInterno() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">Reglamento Interno de Noucolor</h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[hsl(35,92%,55%)]/15 text-[hsl(35,92%,65%)]">
          15 secciones
        </span>
      </div>
      <Accordion type="multiple" className="space-y-3">
        {reglamento.map(sec => (
          <AccordionItem
            key={sec.n}
            value={`sec-${sec.n}`}
            className="bg-card rounded-xl border border-border px-5 data-[state=open]:border-[hsl(35,92%,55%)]/30 transition-colors"
          >
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-left">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {sec.n}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[sec.category]}`}>
                  {categoryLabels[sec.category]}
                </span>
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