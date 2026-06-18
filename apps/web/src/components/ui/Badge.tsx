import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export const Badge = ({ variant = 'default', className, children, ...props }: BadgeProps) => (
  <span
    className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variantClasses[variant],
      className,
    )}
    {...props}
  >
    {children}
  </span>
);
