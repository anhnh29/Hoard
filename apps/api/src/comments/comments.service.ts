import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Comment as PrismaComment, User } from '@prisma/client';
import type { CommentItem } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

type CommentWithAuthor = PrismaComment & { author: User; replies: (PrismaComment & { author: User })[] };

function toCommentItem(c: CommentWithAuthor): CommentItem {
  return {
    id: c.id,
    content: c.content,
    author: { username: c.author.username, name: c.author.name, avatarUrl: c.author.avatarUrl },
    createdAt: c.createdAt.toISOString(),
    replies: (c.replies ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      author: { username: (r as any).author.username, name: (r as any).author.name, avatarUrl: (r as any).author.avatarUrl },
      createdAt: r.createdAt.toISOString(),
      replies: [],
    })),
  };
}

const COMMENT_INCLUDE = {
  author: true,
  replies: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(slug: string): Promise<CommentItem[]> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED') throw new NotFoundException('Article not found');
    const comments = await this.prisma.comment.findMany({
      where: { articleId: article.id, parentId: null },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return comments.map(toCommentItem);
  }

  async create(slug: string, authorId: string, content: string): Promise<CommentItem> {
    if (!content.trim()) throw new BadRequestException('Comment cannot be empty');
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED') throw new NotFoundException('Article not found');
    const comment = await this.prisma.comment.create({
      data: { content: content.trim(), authorId, articleId: article.id, parentId: null },
      include: COMMENT_INCLUDE,
    });
    return toCommentItem(comment as CommentWithAuthor);
  }

  async createReply(slug: string, parentId: string, authorId: string, content: string): Promise<CommentItem> {
    if (!content.trim()) throw new BadRequestException('Comment cannot be empty');
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article || article.status !== 'PUBLISHED') throw new NotFoundException('Article not found');
    const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Comment not found');
    if (parent.parentId !== null) throw new BadRequestException('Cannot reply to a reply');
    const comment = await this.prisma.comment.create({
      data: { content: content.trim(), authorId, articleId: article.id, parentId },
      include: COMMENT_INCLUDE,
    });
    return toCommentItem(comment as CommentWithAuthor);
  }

  async delete(commentId: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException("Cannot delete another user's comment");
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
