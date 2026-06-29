import { z } from 'zod';

export type ArticleStatus = 'DRAFT' | 'PUBLISHED';

export interface Article {
  id: string;
  title: string;
  slug: string | null;
  content: Record<string, unknown>;
  excerpt: string | null;
  coverImageUrl: string | null;
  status: ArticleStatus;
  authorId: string;
  publishedAt: string | null;
  readingTime: number;
  tagNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ArticleAuthor {
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface TagSummary {
  name: string;
  slug: string;
}

export interface PublicArticle {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  coverImageUrl: string | null;
  readingTime: number;
  publishedAt: string;
  tags: TagSummary[];
  author: ArticleAuthor;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  readingTime: number;
  publishedAt: string;
  tags: TagSummary[];
  author: ArticleAuthor;
}

export interface TagWithArticles {
  tag: TagSummary;
  articles: ArticleListItem[];
}

export const updateArticleSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  coverImageUrl: z.string().url().optional(),
  tagNames: z.array(z.string().min(1).max(30)).max(10).optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
