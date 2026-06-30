import { Controller, Delete, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { FollowStatus } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FollowsService } from './follows.service';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':username')
  @UseGuards(JwtAuthGuard)
  follow(@Param('username') username: string, @Request() req): Promise<FollowStatus> {
    return this.followsService.follow(req.user.id, username);
  }

  @Delete(':username')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  unfollow(@Param('username') username: string, @Request() req): Promise<void> {
    return this.followsService.unfollow(req.user.id, username);
  }

  @Get(':username/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Param('username') username: string, @Request() req): Promise<FollowStatus> {
    return this.followsService.getStatus(req.user.id, username);
  }
}
