import React from 'react';

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <img src="https://media.base44.com/images/public/6a477a12854ad64ff8bd1b46/7e1a8455e_image.png" alt="Noucolor" className="h-12 w-auto rounded-lg bg-white p-1" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}