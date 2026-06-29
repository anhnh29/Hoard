import type { Article as PrismaArticle, ArticleTag, Tag, User } from '@prisma/client';
import type { Article, ArticleListItem, PublicArticle } from '@hoard/shared';

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

export const ARTICLE_WITH_AUTHOR_INCLUDE = { tags: { include: { tag: true } }, author: true } as const;
export type ArticleWithTagsAndAuthor = ArticleWithTags & { author: User };

export function toPublicArticle(article: ArticleWithTagsAndAuthor): PublicArticle {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug as string,
    content: article.content as Record<string, unknown>,
    coverImageUrl: article.coverImageUrl,
    readingTime: article.readingTime,
    publishedAt: (article.publishedAt as Date).toISOString(),
    tags: article.tags.map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
    author: {
      username: article.author.username,
      name: article.author.name,
      avatarUrl: article.author.avatarUrl,
    },
  };
}

export function toArticleListItem(article: ArticleWithTagsAndAuthor): ArticleListItem {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug as string,
    excerpt: article.excerpt,
    coverImageUrl: article.coverImageUrl,
    readingTime: article.readingTime,
    publishedAt: (article.publishedAt as Date).toISOString(),
    tags: article.tags.map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
    author: {
      username: article.author.username,
      name: article.author.name,
      avatarUrl: article.author.avatarUrl,
    },
  };
}
