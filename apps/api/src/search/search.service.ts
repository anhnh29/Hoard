import { Injectable } from '@nestjs/common';
import type { ArticleListItem } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const SEARCH_LIMIT = 20;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string): Promise<ArticleListItem[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Article"
      WHERE status = 'PUBLISHED'
        AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
            @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')),
        plainto_tsquery('english', ${q})
      ) DESC
      LIMIT ${SEARCH_LIMIT}
    `;

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const articles = await this.prisma.article.findMany({
      where: { id: { in: ids } },
      include: ARTICLE_WITH_AUTHOR_INCLUDE,
    });

    const rankOrder = new Map(ids.map((id, i) => [id, i]));
    return articles
      .sort((a, b) => (rankOrder.get(a.id) ?? 0) - (rankOrder.get(b.id) ?? 0))
      .map((a) => toArticleListItem(a as ArticleWithTagsAndAuthor));
  }
}
