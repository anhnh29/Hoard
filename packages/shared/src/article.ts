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

export const updateArticleSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  coverImageUrl: z.string().url().optional(),
  tagNames: z.array(z.string().min(1).max(30)).max(10).optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
