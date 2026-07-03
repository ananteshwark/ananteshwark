import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, InviteUserDto, BulkInviteDto } from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

// RbacGuard only enforces routes that declare @RequirePermission; the
// self-service routes (me / me/profile) intentionally omit it so any
// authenticated user can view and edit their own profile.
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users:users:read')
  @ApiOperation({ summary: 'List all users in tenant' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(user.tenantId, pagination, search);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.id, user.tenantId);
  }

  @Get(':id')
  @RequirePermission('users:users:read')
  @ApiOperation({ summary: 'Get user by ID' })
  findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findById(id, user.tenantId);
  }

  @Post()
  @RequirePermission('users:users:create')
  @ApiOperation({ summary: 'Create a new user' })
  create(@CurrentUser() user: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.tenantId, dto);
  }

  @Post('invite')
  @RequirePermission('users:users:create')
  @ApiOperation({ summary: 'Invite a user by email' })
  invite(@CurrentUser() user: any, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.tenantId, dto);
  }

  @Post('bulk-invite')
  @RequirePermission('users:users:create')
  @ApiOperation({ summary: 'Invite multiple users' })
  bulkInvite(@CurrentUser() user: any, @Body() dto: BulkInviteDto) {
    return this.usersService.bulkInvite(user.tenantId, dto);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('users:users:update')
  @ApiOperation({ summary: 'Update user' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermission('users:users:delete')
  @ApiOperation({ summary: 'Deactivate user' })
  deactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.deactivate(id, user.tenantId);
  }

  @Post(':id/unlock')
  @RequirePermission('users:users:update')
  @ApiOperation({ summary: 'Clear a lockout and re-activate a locked user' })
  unlock(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.unlock(id, user.tenantId);
  }
}
