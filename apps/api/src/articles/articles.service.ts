import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article as PrismaArticle, ArticleTag, Tag } from '@prisma/client';
import type { Article, UpdateArticleInput } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { slugify } from './slug.util';
import { calculateExcerpt, calculateReadingTime } from './reading-time.util';
import { toArticle } from './articles.mapper';

const ARTICLE_INCLUDE = { tags: { include: { tag: true } } } as const;
type ArticleWithTags = PrismaArticle & { tags: (ArticleTag & { tag: Tag })[] };

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagsService: TagsService,
  ) {}

  async create(authorId: string): Promise<Article> {
    const article = await this.prisma.article.create({
      data: { authorId },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(article as ArticleWithTags);
  }

  async findByIdForAuthor(id: string, authorId: string): Promise<Article> {
    const article = await this.findOwned(id, authorId);
    return toArticle(article);
  }

  async update(id: string, authorId: string, dto: UpdateArticleInput): Promise<Article> {
    await this.findOwned(id, authorId);

    if (dto.tagNames) {
      const tags = await this.tagsService.findOrCreateManyByName(dto.tagNames);
      await this.prisma.$transaction(async (tx) => {
        await tx.articleTag.deleteMany({ where: { articleId: id } });
        if (tags.length > 0) {
          await tx.articleTag.createMany({ data: tags.map((tag) => ({ articleId: id, tagId: tag.id })) });
        }
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.content !== undefined) {
      data.content = dto.content;
      data.readingTime = calculateReadingTime(dto.content);
      data.excerpt = calculateExcerpt(dto.content);
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  async publish(id: string, authorId: string): Promise<Article> {
    const article = await this.findOwned(id, authorId);
    const data: Record<string, unknown> = {
      status: 'PUBLISHED',
      slug: article.slug ?? slugify(article.title),
    };
    if (!article.publishedAt) {
      data.publishedAt = new Date();
    }
    const updated = await this.prisma.article.update({
      where: { id },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  async unpublish(id: string, authorId: string): Promise<Article> {
    await this.findOwned(id, authorId);
    const updated = await this.prisma.article.update({
      where: { id },
      data: { status: 'DRAFT' },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  private async findOwned(id: string, authorId: string): Promise<ArticleWithTags> {
    const article = await this.prisma.article.findUnique({ where: { id }, include: ARTICLE_INCLUDE });
    if (!article || article.authorId !== authorId) {
      throw new NotFoundException('Article not found');
    }
    return article as ArticleWithTags;
  }
}
