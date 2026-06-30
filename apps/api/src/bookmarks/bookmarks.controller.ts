import { Controller, Delete, Get, HttpCode, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import type { BookmarkStatus, PaginatedArticles } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post(':slug')
  @UseGuards(JwtAuthGuard)
  bookmark(@Param('slug') slug: string, @Request() req): Promise<BookmarkStatus> {
    return this.bookmarksService.bookmark(slug, req.user.id);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  unbookmark(@Param('slug') slug: string, @Request() req): Promise<void> {
    return this.bookmarksService.unbookmark(slug, req.user.id);
  }

  @Get(':slug/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Param('slug') slug: string, @Request() req): Promise<BookmarkStatus> {
    return this.bookmarksService.getStatus(slug, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getReadingList(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.bookmarksService.getReadingList(req.user.id, cursor, limit ? Number(limit) : undefined);
  }
}
