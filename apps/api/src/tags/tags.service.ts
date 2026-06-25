import { Injectable } from '@nestjs/common';
import type { Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../articles/slug.util';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Tag[]> {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOrCreateManyByName(names: string[]): Promise<Tag[]> {
    const uniqueNames = Array.from(new Set(names));
    const tags: Tag[] = [];
    for (const name of uniqueNames) {
      const existing = await this.prisma.tag.findUnique({ where: { name } });
      if (existing) {
        tags.push(existing);
        continue;
      }
      const created = await this.prisma.tag.create({ data: { name, slug: slugify(name) } });
      tags.push(created);
    }
    return tags;
  }
}
