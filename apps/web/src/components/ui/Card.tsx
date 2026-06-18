import React from 'react';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = ({ className, children, ...props }: CardProps) => (
  <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm', className)} {...props}>
    {children}
  </div>
);

export const CardHeader = ({ className, children, ...props }: CardProps) => (
  <div className={clsx('px-6 py-4 border-b border-gray-100', className)} {...props}>
    {children}
  </div>
);

export const CardContent = ({ className, children, ...props }: CardProps) => (
  <div className={clsx('px-6 py-4', className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ className, children, ...props }: CardProps) => (
  <div className={clsx('px-6 py-4 border-t border-gray-100', className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={clsx('text-base font-semibold text-gray-900', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={clsx('text-sm text-gray-500 mt-0.5', className)} {...props}>
    {children}
  </p>
);
