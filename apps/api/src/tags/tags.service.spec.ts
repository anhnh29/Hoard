import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TagsService', () => {
  let service: TagsService;
  const prismaMock = {
    tag: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    articleTag: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('returns existing tags without creating duplicates', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue']);

    expect(prismaMock.tag.create).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 't1', name: 'vue', slug: 'vue' }]);
  });

  it('creates a tag that does not exist yet', async () => {
    prismaMock.tag.findUnique.mockResolvedValue(null);
    prismaMock.tag.create.mockResolvedValue({ id: 't2', name: 'new tag', slug: 'new-tag' });

    const result = await service.findOrCreateManyByName(['new tag']);

    expect(prismaMock.tag.create).toHaveBeenCalledWith({
      data: { name: 'new tag', slug: 'new-tag' },
    });
    expect(result).toEqual([{ id: 't2', name: 'new tag', slug: 'new-tag' }]);
  });

  it('deduplicates repeated names in the input', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue', 'vue']);

    expect(result).toHaveLength(1);
  });

  describe('findBySlugWithPublishedArticles', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      prismaMock.tag.findUnique.mockResolvedValue(null);
      await expect(service.findBySlugWithPublishedArticles('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the tag and its published articles, newest first', async () => {
      prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });
      prismaMock.articleTag.findMany.mockResolvedValue([
        {
          article: {
            id: 'a1',
            title: 'Hello',
            slug: 'hello',
            excerpt: 'Hi',
            coverImageUrl: null,
            readingTime: 1,
            publishedAt: new Date('2024-01-01'),
            tags: [{ tag: { name: 'vue', slug: 'vue' } }],
            author: { username: 'testuser', name: 'Test User', avatarUrl: null },
          },
        },
      ]);

      const result = await service.findBySlugWithPublishedArticles('vue');

      expect(result.tag).toEqual({ name: 'vue', slug: 'vue' });
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].slug).toBe('hello');
      expect(prismaMock.articleTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tagId: 't1', article: { status: 'PUBLISHED' } },
          orderBy: { article: { publishedAt: 'desc' } },
        }),
      );
    });
  });
});
