import { Injectable, NotFoundException } from '@nestjs/common';
import type { BookmarkStatus, PaginatedArticles } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async bookmark(slug: string, userId: string): Promise<BookmarkStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED')
      throw new NotFoundException('Article not found');
    await this.prisma.bookmark.upsert({
      where: { userId_articleId: { userId, articleId: article.id } },
      create: { userId, articleId: article.id },
      update: {},
    });
    return { isBookmarked: true };
  }

  async unbookmark(slug: string, userId: string): Promise<void> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED')
      throw new NotFoundException('Article not found');
    await this.prisma.bookmark.deleteMany({ where: { userId, articleId: article.id } });
  }

  async getStatus(slug: string, userId: string): Promise<BookmarkStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED')
      throw new NotFoundException('Article not found');
    const record = await this.prisma.bookmark.findUnique({
      where: { userId_articleId: { userId, articleId: article.id } },
    });
    return { isBookmarked: !!record };
  }

  async getReadingList(userId: string, cursor?: string, limit = DEFAULT_LIMIT): Promise<PaginatedArticles> {
    const effectiveLimit = Math.min(Number.isFinite(limit) ? limit : DEFAULT_LIMIT, MAX_LIMIT);
    const take = effectiveLimit + 1;
    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { article: { include: ARTICLE_WITH_AUTHOR_INCLUDE } },
    });
    const hasNext = bookmarks.length > effectiveLimit;
    const page = hasNext ? bookmarks.slice(0, effectiveLimit) : bookmarks;
    return {
      articles: page.map((b) => toArticleListItem(b.article as ArticleWithTagsAndAuthor)),
      nextCursor: hasNext ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }
}
