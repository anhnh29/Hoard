import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';
import { PrismaService } from '../prisma/prisma.service';

const makeBookmark = (createdAt: Date) => ({
  id: 'bm1',
  userId: 'u1',
  articleId: 'art1',
  createdAt,
  article: {
    id: 'art1', title: 'Hello', slug: 'hello', excerpt: null,
    coverImageUrl: null, readingTime: 1, publishedAt: createdAt,
    tags: [], author: { username: 'alice', name: 'Alice', avatarUrl: null },
  },
});

describe('BookmarksService', () => {
  let service: BookmarksService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    bookmark: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookmarksService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<BookmarksService>(BookmarksService);
  });

  it('bookmark upserts and returns isBookmarked: true', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1', status: 'PUBLISHED' });
    prismaMock.bookmark.upsert.mockResolvedValue({});
    const result = await service.bookmark('my-article', 'u1');
    expect(prismaMock.bookmark.upsert).toHaveBeenCalled();
    expect(result).toEqual({ isBookmarked: true });
  });

  it('bookmark throws NotFoundException for unknown slug', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    await expect(service.bookmark('no-such', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('unbookmark calls deleteMany', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1', status: 'PUBLISHED' });
    prismaMock.bookmark.deleteMany.mockResolvedValue({ count: 1 });
    await service.unbookmark('my-article', 'u1');
    expect(prismaMock.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', articleId: 'art1' },
    });
  });

  it('getStatus returns isBookmarked: true when record exists', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1', status: 'PUBLISHED' });
    prismaMock.bookmark.findUnique.mockResolvedValue({ id: 'bm1' });
    const result = await service.getStatus('my-article', 'u1');
    expect(result).toEqual({ isBookmarked: true });
  });

  it('bookmark throws NotFoundException for unpublished article', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1', status: 'DRAFT' });
    await expect(service.bookmark('draft', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('getReadingList returns PaginatedArticles ordered by bookmark createdAt DESC', async () => {
    const date = new Date('2024-01-01');
    prismaMock.bookmark.findMany.mockResolvedValue([makeBookmark(date)]);
    const result = await service.getReadingList('u1');
    expect(result.articles).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(prismaMock.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});
