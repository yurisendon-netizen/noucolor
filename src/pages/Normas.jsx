import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ReglamentoInterno from '@/components/normas/ReglamentoInterno';

export default function Normas() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Normas de Empresa"
        subtitle="Reglamento interno y políticas de Noucolor"
      />

      <ReglamentoInterno />
    </div>
  );
}