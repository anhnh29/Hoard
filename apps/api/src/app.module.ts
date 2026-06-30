import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TagsModule } from './tags/tags.module';
import { ArticlesModule } from './articles/articles.module';
import { FeedModule } from './feed/feed.module';
import { SearchModule } from './search/search.module';
import { FollowsModule } from './follows/follows.module';
import { ClapsModule } from './claps/claps.module';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    UsersModule,
    AuthModule,
    TagsModule,
    ArticlesModule,
    FeedModule,
    SearchModule,
    FollowsModule,
    ClapsModule,
    CommentsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
