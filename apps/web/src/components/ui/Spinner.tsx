import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export const Spinner = ({ size = 'md', className }: SpinnerProps) => (
  <Loader2 className={clsx('animate-spin text-blue-600', sizeClasses[size], className)} />
);

export const PageSpinner = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <Spinner size="lg" />
  </div>
);
