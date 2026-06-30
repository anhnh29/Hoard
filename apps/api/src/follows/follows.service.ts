import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FollowStatus } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async follow(followerId: string, username: string): Promise<FollowStatus> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === followerId) throw new BadRequestException('Cannot follow yourself');
    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId: target.id } },
      create: { followerId, followingId: target.id },
      update: {},
    });
    return { isFollowing: true };
  }

  async unfollow(followerId: string, username: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.follow.deleteMany({ where: { followerId, followingId: target.id } });
  }

  async getStatus(followerId: string, username: string): Promise<FollowStatus> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    const record = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });
    return { isFollowing: !!record };
  }
}
