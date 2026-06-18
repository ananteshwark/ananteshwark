import React from 'react';

interface PermissionGateProps {
  permission: string;
  userPermissions?: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PermissionGate = ({
  permission,
  userPermissions = [],
  children,
  fallback = null,
}: PermissionGateProps) => {
  const hasPermission = userPermissions.includes(permission);
  return hasPermission ? <>{children}</> : <>{fallback}</>;
};
