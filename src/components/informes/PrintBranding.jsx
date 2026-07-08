import React from 'react';
import moment from 'moment';

const NOUCOLOR_LOGO = 'https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png';

export function PrintHeader({ periodLabel, title = 'Informe de Productividad' }) {
  return (
    <div className="print-only np-header">
      <div className="np-header-top">
        <img src={NOUCOLOR_LOGO} alt="Noucolor" className="np-logo" />
        <div className="np-company">
          <h1 className="np-company-name">NOUCOLOR PRO</h1>
          <p className="np-company-sub">Pintura i Decoració · Principat d'Andorra</p>
        </div>
        <div className="np-meta">
          <p className="np-meta-title">{title}</p>
          <p className="np-meta-period">{periodLabel}</p>
          <p className="np-meta-date">Generat el {moment().format('DD/MM/YYYY')}</p>
        </div>
      </div>
      <div className="np-accent-bar" />
    </div>
  );
}

export function PrintFooter() {
  return (
    <div className="print-only np-footer">
      <div className="np-accent-bar" />
      <div className="np-footer-content">
        <p className="np-footer-company">Noucolor Pro · Pintura i Decoració</p>
        <p>Document confidencial · Ús intern</p>
      </div>
    </div>
  );
}