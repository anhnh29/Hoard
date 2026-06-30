import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

const makeComment = (overrides = {}) => ({
  id: 'c1',
  content: 'Hello',
  authorId: 'u1',
  articleId: 'art1',
  parentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  author: { username: 'user', name: 'User', avatarUrl: null },
  replies: [],
  ...overrides,
});

describe('CommentsService', () => {
  let service: CommentsService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    comment: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  };

  const article = { id: 'art1', slug: 'my-article' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<CommentsService>(CommentsService);
  });

  it('findAll returns top-level comments with replies', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findMany.mockResolvedValue([makeComment()]);
    const result = await service.findAll('my-article');
    expect(result).toHaveLength(1);
    expect(result[0].replies).toEqual([]);
  });

  it('create adds a top-level comment with parentId: null', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.create.mockResolvedValue(makeComment());
    const result = await service.create('my-article', 'u1', 'Hello');
    expect(prismaMock.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: null, content: 'Hello' }),
      }),
    );
    expect(result.content).toBe('Hello');
  });

  it('create throws BadRequestException for empty content', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    await expect(service.create('my-article', 'u1', '   ')).rejects.toThrow(BadRequestException);
  });

  it('createReply sets parentId correctly', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ id: 'c1', parentId: null }));
    prismaMock.comment.create.mockResolvedValue(makeComment({ id: 'c2', parentId: 'c1' }));
    await service.createReply('my-article', 'c1', 'u1', 'Nice!');
    expect(prismaMock.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'c1' }),
      }),
    );
  });

  it('createReply throws BadRequestException when trying to reply to a reply', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ parentId: 'c0' }));
    await expect(service.createReply('my-article', 'c1', 'u1', 'Nested')).rejects.toThrow(BadRequestException);
  });

  it('delete removes own comment', async () => {
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ authorId: 'u1' }));
    prismaMock.comment.delete.mockResolvedValue({});
    await service.delete('c1', 'u1');
    expect(prismaMock.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('delete throws ForbiddenException when deleting another user comment', async () => {
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ authorId: 'u2' }));
    await expect(service.delete('c1', 'u1')).rejects.toThrow(ForbiddenException);
  });
});
