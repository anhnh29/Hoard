import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FollowsService', () => {
  let service: FollowsService;
  const prismaMock = {
    user: { findUnique: jest.fn() },
    follow: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FollowsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<FollowsService>(FollowsService);
  });

  it('follow creates a Follow record and returns isFollowing: true', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.upsert.mockResolvedValue({});
    const result = await service.follow('u1', 'alice');
    expect(prismaMock.follow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { followerId_followingId: { followerId: 'u1', followingId: 'u2' } } }),
    );
    expect(result).toEqual({ isFollowing: true });
  });

  it('follow throws BadRequestException when following self', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.follow('u1', 'self')).rejects.toThrow(BadRequestException);
    expect(prismaMock.follow.upsert).not.toHaveBeenCalled();
  });

  it('follow throws NotFoundException when target user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.follow('u1', 'nobody')).rejects.toThrow(NotFoundException);
  });

  it('unfollow removes the Follow record', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.deleteMany.mockResolvedValue({ count: 1 });
    await service.unfollow('u1', 'alice');
    expect(prismaMock.follow.deleteMany).toHaveBeenCalledWith({
      where: { followerId: 'u1', followingId: 'u2' },
    });
  });

  it('getStatus returns isFollowing: true when record exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.findUnique.mockResolvedValue({ id: 'f1' });
    const result = await service.getStatus('u1', 'alice');
    expect(result).toEqual({ isFollowing: true });
  });

  it('getStatus returns isFollowing: false when record does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.findUnique.mockResolvedValue(null);
    const result = await service.getStatus('u1', 'alice');
    expect(result).toEqual({ isFollowing: false });
  });
});
