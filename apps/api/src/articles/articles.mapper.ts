import type { Article as PrismaArticle, ArticleTag, Tag } from '@prisma/client';
import type { Article } from '@hoard/shared';

type ArticleWithTags = PrismaArticle & { tags: (ArticleTag & { tag: Tag })[] };

export function toArticle(article: ArticleWithTags): Article {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content as Record<string, unknown>,
    excerpt: article.excerpt,
    coverImageUrl: article.coverImageUrl,
    status: article.status,
    authorId: article.authorId,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    readingTime: article.readingTime,
    tagNames: article.tags.map((t) => t.tag.name),
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}
