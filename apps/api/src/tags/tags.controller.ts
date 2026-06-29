import { Controller, Get, Param } from '@nestjs/common';
import type { Tag } from '@prisma/client';
import type { TagWithArticles } from '@hoard/shared';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll(): Promise<Tag[]> {
    return this.tagsService.findAll();
  }

  @Get(':slug/articles')
  findArticlesBySlug(@Param('slug') slug: string): Promise<TagWithArticles> {
    return this.tagsService.findBySlugWithPublishedArticles(slug);
  }
}
