import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { ClapStatus } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ClapsService } from './claps.service';

@Controller('articles')
export class ClapsController {
  constructor(private readonly clapsService: ClapsService) {}

  @Get(':slug/claps')
  @UseGuards(OptionalJwtAuthGuard)
  getStatus(@Param('slug') slug: string, @Request() req): Promise<ClapStatus> {
    return this.clapsService.getStatus(slug, req.user?.id);
  }

  @Post(':slug/claps')
  @UseGuards(JwtAuthGuard)
  clap(@Param('slug') slug: string, @Request() req): Promise<ClapStatus> {
    return this.clapsService.clap(slug, req.user.id);
  }
}
