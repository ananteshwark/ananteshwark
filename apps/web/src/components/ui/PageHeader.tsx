import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-3">{actions}</div>}
  </div>
);
