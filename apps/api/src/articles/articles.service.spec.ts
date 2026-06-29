import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  const prismaMock = {
    article: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    articleTag: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  };
  const tagsServiceMock = {
    findOrCreateManyByName: jest.fn(),
  };

  const fakeArticle = {
    id: 'a1',
    title: 'Hello',
    slug: null,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    excerpt: 'Hello',
    coverImageUrl: null,
    status: 'DRAFT',
    authorId: 'u1',
    publishedAt: null,
    readingTime: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { username: 'testuser', name: 'Test User', avatarUrl: null },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn) => fn(prismaMock));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TagsService, useValue: tagsServiceMock },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  describe('create', () => {
    it('creates an empty draft owned by the given author', async () => {
      prismaMock.article.create.mockResolvedValue(fakeArticle);

      const result = await service.create('u1');

      expect(prismaMock.article.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authorId: 'u1' }) }),
      );
      expect(result.id).toBe('a1');
    });
  });

  describe('findByIdForAuthor', () => {
    it('throws NotFoundException when the article does not exist', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);
      await expect(service.findByIdForAuthor('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the article belongs to someone else', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, authorId: 'someone-else' });
      await expect(service.findByIdForAuthor('a1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the article when owned by the requester', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      const result = await service.findByIdForAuthor('a1', 'u1');
      expect(result.id).toBe('a1');
    });
  });

  describe('update', () => {
    it('recomputes readingTime and excerpt from new content', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      const longText = 'word '.repeat(250).trim();
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }] };
      prismaMock.article.update.mockResolvedValue({ ...fakeArticle, content: newContent, readingTime: 2 });

      await service.update('a1', 'u1', { content: newContent });

      expect(prismaMock.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readingTime: 2, excerpt: longText.slice(0, 160) }),
        }),
      );
    });

    it('replaces the tag set when tagNames is provided', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      tagsServiceMock.findOrCreateManyByName.mockResolvedValue([{ id: 't1', name: 'vue', slug: 'vue' }]);
      prismaMock.article.update.mockResolvedValue(fakeArticle);

      await service.update('a1', 'u1', { tagNames: ['vue'] });

      expect(prismaMock.articleTag.deleteMany).toHaveBeenCalledWith({ where: { articleId: 'a1' } });
      expect(prismaMock.articleTag.createMany).toHaveBeenCalledWith({
        data: [{ articleId: 'a1', tagId: 't1' }],
      });
    });

    it('throws NotFoundException when updating an article owned by someone else', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, authorId: 'someone-else' });
      await expect(service.update('a1', 'u1', { title: 'New' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('generates a slug and sets status/publishedAt on first publish', async () => {
      prismaMock.article.findUnique
        .mockResolvedValueOnce({ ...fakeArticle, title: 'Hello World' }) // findOwned's ownership check
        .mockResolvedValue(null); // generateUniqueSlug's collision check — no other article has this slug
      prismaMock.article.update.mockResolvedValue({
        ...fakeArticle,
        status: 'PUBLISHED',
        slug: 'hello-world',
        publishedAt: new Date(),
      });

      await service.publish('a1', 'u1');

      const updateCall = prismaMock.article.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('PUBLISHED');
      expect(updateCall.data.slug).toBe('hello-world');
      expect(updateCall.data.publishedAt).toBeInstanceOf(Date);
    });

    it('appends -2 to the slug when the first candidate is already taken', async () => {
      prismaMock.article.findUnique
        .mockResolvedValueOnce({ ...fakeArticle, title: 'Hello World' }) // findOwned's ownership check
        .mockResolvedValueOnce({ ...fakeArticle, id: 'other', slug: 'hello-world' }) // collision: "hello-world" taken
        .mockResolvedValueOnce(null); // "hello-world-2" is free
      prismaMock.article.update.mockResolvedValue({
        ...fakeArticle,
        status: 'PUBLISHED',
        slug: 'hello-world-2',
        publishedAt: new Date(),
      });

      await service.publish('a1', 'u1');

      const updateCall = prismaMock.article.update.mock.calls[0][0];
      expect(updateCall.data.slug).toBe('hello-world-2');
    });

    it('keeps the existing slug and does not reset publishedAt on republish', async () => {
      prismaMock.article.findUnique.mockResolvedValue({
        ...fakeArticle,
        title: 'Hello World',
        slug: 'hello-world',
        publishedAt: new Date('2020-01-01'),
        status: 'DRAFT',
      });
      prismaMock.article.update.mockResolvedValue(fakeArticle);

      await service.publish('a1', 'u1');

      const updateCall = prismaMock.article.update.mock.calls[0][0];
      expect(updateCall.data.slug).toBe('hello-world');
      expect(updateCall.data.publishedAt).toBeUndefined();
    });
  });

  describe('unpublish', () => {
    it('sets status back to DRAFT while keeping the slug', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, status: 'PUBLISHED', slug: 'hello' });
      prismaMock.article.update.mockResolvedValue({ ...fakeArticle, status: 'DRAFT' });

      await service.unpublish('a1', 'u1');

      expect(prismaMock.article.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT' } }),
      );
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns the article when published and the username matches the author', async () => {
      prismaMock.article.findUnique.mockResolvedValue({
        ...fakeArticle,
        status: 'PUBLISHED',
        slug: 'hello-world',
        publishedAt: new Date('2024-01-01'),
      });

      const result = await service.findPublishedBySlug('testuser', 'hello-world');

      expect(result.slug).toBe('hello-world');
      expect(result.author).toEqual({ username: 'testuser', name: 'Test User', avatarUrl: null });
    });

    it('throws NotFoundException when the article does not exist', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);
      await expect(service.findPublishedBySlug('testuser', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the article is still a draft', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, status: 'DRAFT', slug: 'hello-world' });
      await expect(service.findPublishedBySlug('testuser', 'hello-world')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the username does not match the actual author', async () => {
      prismaMock.article.findUnique.mockResolvedValue({
        ...fakeArticle,
        status: 'PUBLISHED',
        slug: 'hello-world',
        publishedAt: new Date('2024-01-01'),
      });
      await expect(service.findPublishedBySlug('someone-else', 'hello-world')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
