import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { ArticleListItem } from '@hoard/shared';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query('q') q?: string): Promise<ArticleListItem[]> {
    if (!q || !q.trim()) {
      throw new BadRequestException('q is required');
    }
    return this.searchService.search(q.trim());
  }
}
