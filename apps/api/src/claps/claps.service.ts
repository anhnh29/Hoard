import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClapStatus } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

const CLAP_CAP = 10;

@Injectable()
export class ClapsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(slug: string, userId?: string): Promise<ClapStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED') throw new NotFoundException('Article not found');

    const agg = await this.prisma.clap.aggregate({
      where: { articleId: article.id },
      _sum: { count: true },
    });
    const totalClaps = agg._sum.count ?? 0;

    let userClaps = 0;
    if (userId) {
      const clap = await this.prisma.clap.findUnique({
        where: { userId_articleId: { userId, articleId: article.id } },
      });
      userClaps = clap?.count ?? 0;
    }

    return { totalClaps, userClaps };
  }

  async clap(slug: string, userId: string): Promise<ClapStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED') throw new NotFoundException('Article not found');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.clap.findUnique({
        where: { userId_articleId: { userId, articleId: article.id } },
      });
      if ((existing?.count ?? 0) >= CLAP_CAP) {
        throw new BadRequestException(`Clap limit of ${CLAP_CAP} reached`);
      }
      await tx.clap.upsert({
        where: { userId_articleId: { userId, articleId: article.id } },
        create: { userId, articleId: article.id, count: 1 },
        update: { count: { increment: 1 } },
      });
    });

    return this.getStatus(slug, userId);
  }
}
