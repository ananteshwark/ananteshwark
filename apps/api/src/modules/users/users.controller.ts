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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
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
  @ApiOperation({ summary: 'Get user by ID' })
  findById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findById(id, user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  create(@CurrentUser() user: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.tenantId, dto);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a user by email' })
  invite(@CurrentUser() user: any, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.tenantId, dto);
  }

  @Post('bulk-invite')
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
  @ApiOperation({ summary: 'Update user' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user' })
  deactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.deactivate(id, user.tenantId);
  }

  @Post(':id/unlock')
  @ApiOperation({ summary: 'Clear a lockout and re-activate a locked user' })
  unlock(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.unlock(id, user.tenantId);
  }
}
