import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit_resource';
export const Audit = (resourceType: string) => SetMetadata(AUDIT_KEY, resourceType);
