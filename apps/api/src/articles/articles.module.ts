import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { TagsModule } from '../tags/tags.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [TagsModule, CloudinaryModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
