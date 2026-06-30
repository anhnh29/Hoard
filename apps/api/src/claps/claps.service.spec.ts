import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClapsService } from './claps.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClapsService', () => {
  let service: ClapsService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    clap: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const article = { id: 'art1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClapsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<ClapsService>(ClapsService);
  });

  it('getStatus returns totalClaps and userClaps: 0 when unauthenticated', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 5 } });
    const result = await service.getStatus('my-article');
    expect(result).toEqual({ totalClaps: 5, userClaps: 0 });
    expect(prismaMock.clap.findUnique).not.toHaveBeenCalled();
  });

  it('getStatus returns userClaps from DB when userId is provided', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 10 } });
    prismaMock.clap.findUnique.mockResolvedValue({ count: 3 });
    const result = await service.getStatus('my-article', 'u1');
    expect(result).toEqual({ totalClaps: 10, userClaps: 3 });
  });

  it('getStatus throws NotFoundException for unknown slug', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    await expect(service.getStatus('no-such-slug')).rejects.toThrow(NotFoundException);
  });

  it('clap increments count and returns updated totals', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.findUnique.mockResolvedValueOnce(null); // before upsert
    prismaMock.clap.upsert.mockResolvedValue({});
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 1 } });
    prismaMock.clap.findUnique.mockResolvedValueOnce({ count: 1 }); // after upsert (getStatus)
    const result = await service.clap('my-article', 'u1');
    expect(prismaMock.clap.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_articleId: { userId: 'u1', articleId: 'art1' } },
        create: { userId: 'u1', articleId: 'art1', count: 1 },
        update: { count: { increment: 1 } },
      }),
    );
    expect(result.userClaps).toBe(1);
  });

  it('clap throws BadRequestException when userClaps is already at cap', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.findUnique.mockResolvedValue({ count: 10 });
    await expect(service.clap('my-article', 'u1')).rejects.toThrow(BadRequestException);
    expect(prismaMock.clap.upsert).not.toHaveBeenCalled();
  });
});
