import { Controller, Get, Query } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
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
}
