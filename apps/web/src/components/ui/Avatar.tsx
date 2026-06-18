import React from 'react';
import { clsx } from 'clsx';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

const colors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
];

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColor(name?: string): string {
  if (!name) return colors[0];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export const Avatar = ({ src, name, size = 'md', className }: AvatarProps) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={clsx('rounded-full object-cover', sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center font-semibold text-white',
        sizeClasses[size],
        getColor(name),
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
};
