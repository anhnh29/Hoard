import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tags (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testTagName = `e2e-tag-${Date.now()}`;
  const testEmail = `e2e-tags-${Date.now()}@e2e-test.local`;
  const testUsername = `e2etags${Date.now()}`;
  let accessToken: string;
  let articleSlug: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL ??= 'http://localhost:3001/auth/google/callback';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await prisma.tag.create({ data: { name: testTagName, slug: testTagName } });

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Tags User', username: testUsername });
    accessToken = signupRes.body.accessToken;

    const createRes = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${accessToken}`);
    await request(app.getHttpServer())
      .patch(`/articles/${createRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Tagged Article', tagNames: [testTagName] });
    const publishRes = await request(app.getHttpServer())
      .post(`/articles/${createRes.body.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`);
    articleSlug = publishRes.body.slug;
  });

  afterAll(async () => {
    await prisma.article.deleteMany({ where: { author: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await prisma.tag.deleteMany({ where: { name: { startsWith: 'e2e-tag-' } } });
    await app.close();
  });

  it('GET /tags returns all tags including the seeded one', async () => {
    const res = await request(app.getHttpServer()).get('/tags').expect(200);
    expect(res.body.some((t: { name: string }) => t.name === testTagName)).toBe(true);
  });

  it('GET /tags/:slug/articles returns the tag and its published articles', async () => {
    const res = await request(app.getHttpServer()).get(`/tags/${testTagName}/articles`).expect(200);
    expect(res.body.tag).toEqual({ name: testTagName, slug: testTagName });
    expect(res.body.articles.some((a: { slug: string }) => a.slug === articleSlug)).toBe(true);
  });

  it('GET /tags/:slug/articles 404s for an unknown tag', async () => {
    await request(app.getHttpServer()).get('/tags/no-such-tag/articles').expect(404);
  });
});
