import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Role } from './role.entity';

@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'role_id' })
  roleId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'granted_by', nullable: true })
  grantedBy: string;

  @Column({ name: 'granted_at' })
  grantedAt: Date;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
