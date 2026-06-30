import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { CommentItem } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('articles/:slug/comments')
  findAll(@Param('slug') slug: string): Promise<CommentItem[]> {
    return this.commentsService.findAll(slug);
  }

  @Post('articles/:slug/comments')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('slug') slug: string,
    @Body('content') content: string,
    @Request() req,
  ): Promise<CommentItem> {
    return this.commentsService.create(slug, req.user.id, content);
  }

  @Post('articles/:slug/comments/:commentId/replies')
  @UseGuards(JwtAuthGuard)
  createReply(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @Body('content') content: string,
    @Request() req,
  ): Promise<CommentItem> {
    return this.commentsService.createReply(slug, commentId, req.user.id, content);
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  delete(@Param('commentId') commentId: string, @Request() req): Promise<void> {
    return this.commentsService.delete(commentId, req.user.id);
  }
}
