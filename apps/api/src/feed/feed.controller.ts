import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  findPage(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.feedService.findPage(cursor, limit ? Number(limit) : undefined);
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  findFollowingPage(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.feedService.findFollowingPage(req.user.id, cursor, limit ? Number(limit) : undefined);
  }
}
