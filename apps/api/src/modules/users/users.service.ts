import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, InviteUserDto, BulkInviteDto } from './dto/user.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(tenantId: string, dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase(), tenantId },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      tenantId,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    return this.userRepository.save(user);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponseDto<User>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = pagination;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.tenantId = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const validSortFields = ['createdAt', 'email', 'firstName', 'lastName', 'status'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    queryBuilder
      .orderBy(`user.${orderField}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findById(id: string, tenantId?: string): Promise<User> {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;
    const user = await this.userRepository.findOne({ where });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string, tenantId: string): Promise<User> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase(), tenantId },
    });
  }

  async update(id: string, tenantId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id, tenantId);
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async deactivate(id: string, tenantId: string): Promise<User> {
    const user = await this.findById(id, tenantId);
    user.status = UserStatus.INACTIVE;
    return this.userRepository.save(user);
  }

  async invite(tenantId: string, dto: InviteUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase(), tenantId },
    });
    if (existing) throw new ConflictException('User with this email already exists');

    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantId,
      status: UserStatus.INVITED,
      passwordHash: await bcrypt.hash(uuidv4(), 12),
    });
    return this.userRepository.save(user);
  }

  async bulkInvite(tenantId: string, dto: BulkInviteDto): Promise<User[]> {
    const results: User[] = [];
    for (const userInvite of dto.users) {
      try {
        const user = await this.invite(tenantId, userInvite);
        results.push(user);
      } catch (e) {
        // skip duplicates in bulk
      }
    }
    return results;
  }
}
