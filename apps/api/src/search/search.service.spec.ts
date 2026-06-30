import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SearchService', () => {
  let service: SearchService;
  const prismaMock = {
    $queryRaw: jest.fn(),
    article: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<SearchService>(SearchService);
  });

  it('returns empty array when no articles match', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const result = await service.search('nothing');
    expect(result).toEqual([]);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('returns mapped ArticleListItems for matching articles', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const date = new Date('2024-01-01');
    prismaMock.article.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Hello',
        slug: 'hello',
        excerpt: 'Hi',
        coverImageUrl: null,
        readingTime: 1,
        publishedAt: date,
        tags: [{ tag: { name: 'vue', slug: 'vue' } }],
        author: { username: 'user', name: 'User', avatarUrl: null },
      },
      {
        id: 'a2',
        title: 'World',
        slug: 'world',
        excerpt: 'Hi2',
        coverImageUrl: null,
        readingTime: 2,
        publishedAt: date,
        tags: [],
        author: { username: 'user', name: 'User', avatarUrl: null },
      },
    ]);
    const result = await service.search('hello');
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('hello');
    expect(result[1].slug).toBe('world');
  });

  it('preserves rank order from the raw query', async () => {
    // raw query returns a2 first (higher rank), a1 second
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'a2' }, { id: 'a1' }]);
    const date = new Date('2024-01-01');
    prismaMock.article.findMany.mockResolvedValue([
      { id: 'a1', title: 'H', slug: 'h1', excerpt: null, coverImageUrl: null, readingTime: 1, publishedAt: date, tags: [], author: { username: 'u', name: 'U', avatarUrl: null } },
      { id: 'a2', title: 'W', slug: 'w2', excerpt: null, coverImageUrl: null, readingTime: 1, publishedAt: date, tags: [], author: { username: 'u', name: 'U', avatarUrl: null } },
    ]);
    const result = await service.search('w');
    expect(result[0].slug).toBe('w2');
    expect(result[1].slug).toBe('h1');
  });
});
