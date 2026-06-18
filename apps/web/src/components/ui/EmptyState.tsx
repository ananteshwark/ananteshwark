import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    {icon && (
      <div className="mb-4 text-gray-400">
        {icon}
      </div>
    )}
    <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
    {description && <p className="text-sm text-gray-500 mb-4 max-w-sm">{description}</p>}
    {action && (
      <Button onClick={action.onClick} size="sm">
        {action.label}
      </Button>
    )}
  </div>
);
