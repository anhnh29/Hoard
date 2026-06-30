import { Test, TestingModule } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../prisma/prisma.service';

const makeArticle = (publishedAt: Date, id = 'a1') => ({
  id,
  title: 'Hello',
  slug: 'hello',
  excerpt: 'Hi',
  coverImageUrl: null,
  readingTime: 1,
  publishedAt,
  tags: [{ tag: { name: 'vue', slug: 'vue' } }],
  author: { username: 'user', name: 'User', avatarUrl: null },
});

describe('FeedService', () => {
  let service: FeedService;
  const prismaMock = { article: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<FeedService>(FeedService);
  });

  it('returns empty list with null nextCursor when no articles exist', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    const result = await service.findPage();
    expect(result).toEqual({ articles: [], nextCursor: null });
  });

  it('returns articles and null nextCursor when count is at or below limit', async () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    prismaMock.article.findMany.mockResolvedValue([makeArticle(date)]);
    const result = await service.findPage(undefined, 10);
    expect(result.articles).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns limit articles and a nextCursor when more than limit exist', async () => {
    const articles = Array.from({ length: 11 }, (_, i) =>
      makeArticle(new Date(`2024-01-${String(11 - i).padStart(2, '0')}T00:00:00.000Z`), `a${i}`),
    );
    prismaMock.article.findMany.mockResolvedValue(articles);
    const result = await service.findPage(undefined, 10);
    expect(result.articles).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor).toBe(articles[9].publishedAt.toISOString());
  });

  it('passes cursor as publishedAt lt filter', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    await service.findPage('2024-06-01T00:00:00.000Z');
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          publishedAt: { lt: new Date('2024-06-01T00:00:00.000Z') },
        },
      }),
    );
  });

  it('queries without cursor filter when cursor is not provided', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    await service.findPage();
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });
});
