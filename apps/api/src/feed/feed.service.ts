import { Injectable } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(cursor?: string, limit = DEFAULT_LIMIT): Promise<PaginatedArticles> {
    const take = Math.min(limit, MAX_LIMIT) + 1;
    const articles = await this.prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        ...(cursor ? { publishedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take,
      include: ARTICLE_WITH_AUTHOR_INCLUDE,
    });
    const hasNext = articles.length > limit;
    const page = hasNext ? articles.slice(0, limit) : articles;
    return {
      articles: page.map((a) => toArticleListItem(a as ArticleWithTagsAndAuthor)),
      nextCursor: hasNext ? (page[page.length - 1].publishedAt as Date).toISOString() : null,
    };
  }
}
