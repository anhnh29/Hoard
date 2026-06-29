import { Injectable, NotFoundException } from '@nestjs/common';
import type { Tag } from '@prisma/client';
import type { TagWithArticles } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../articles/slug.util';
import { ARTICLE_WITH_AUTHOR_INCLUDE, toArticleListItem, type ArticleWithTagsAndAuthor } from '../articles/articles.mapper';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Tag[]> {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOrCreateManyByName(names: string[]): Promise<Tag[]> {
    const uniqueNames = Array.from(new Set(names));
    const tags: Tag[] = [];
    for (const name of uniqueNames) {
      const existing = await this.prisma.tag.findUnique({ where: { name } });
      if (existing) {
        tags.push(existing);
        continue;
      }
      const created = await this.prisma.tag.create({ data: { name, slug: slugify(name) } });
      tags.push(created);
    }
    return tags;
  }

  async findBySlugWithPublishedArticles(slug: string): Promise<TagWithArticles> {
    const tag = await this.prisma.tag.findUnique({ where: { slug } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    const articleTags = await this.prisma.articleTag.findMany({
      where: { tagId: tag.id, article: { status: 'PUBLISHED' } },
      include: { article: { include: ARTICLE_WITH_AUTHOR_INCLUDE } },
      orderBy: { article: { publishedAt: 'desc' } },
    });
    return {
      tag: { name: tag.name, slug: tag.slug },
      articles: articleTags.map((at) => toArticleListItem(at.article as ArticleWithTagsAndAuthor)),
    };
  }
}
