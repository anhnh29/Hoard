import { Body, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, PublicProfile } from '@hoard/shared';
import { UsersService } from './users.service';
import { toPublicProfile } from './users.mapper';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import type { SignedUploadParams } from '../cloudinary/cloudinary.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get(':username')
  async getByUsername(@Param('username') username: string): Promise<PublicProfile> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/avatar-upload-signature')
  getAvatarUploadSignature(): SignedUploadParams {
    return this.cloudinaryService.generateSignedUploadParams('avatars');
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
