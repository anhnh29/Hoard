import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Article, AuthUser } from '@hoard/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CloudinaryService, type SignedUploadParams } from '../cloudinary/cloudinary.service';

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.create(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cover-upload-signature')
  getCoverUploadSignature(): SignedUploadParams {
    return this.cloudinaryService.generateSignedUploadParams('covers');
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.findByIdForAuthor(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<Article> {
    return this.articlesService.update(id, req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.publish(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.unpublish(id, req.user.id);
  }
}
