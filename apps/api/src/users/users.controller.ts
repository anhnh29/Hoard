import { Body, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, PublicProfile } from '@hoard/shared';
import { UsersService } from './users.service';
import { toPublicProfile } from './users.mapper';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  async getByUsername(@Param('username') username: string): Promise<PublicProfile> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicProfile> {
    const updated = await this.usersService.updateProfile(req.user.id, dto);
    return toPublicProfile(updated);
  }
}
