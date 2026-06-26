import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-articles-${Date.now()}@e2e-test.local`;
  const testUsername = `e2earticles${Date.now()}`;
  let accessToken: string;

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

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Articles User', username: testUsername });
    accessToken = signupRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.article.deleteMany({ where: { author: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('creates a draft, updates it, publishes it, then unpublishes it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const articleId = createRes.body.id;
    expect(createRes.body.status).toBe('DRAFT');
    expect(createRes.body.slug).toBeNull();

    const updateRes = await request(app.getHttpServer())
      .patch(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'My First Article',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] },
        tagNames: ['vue', 'testing'],
      })
      .expect(200);
    expect(updateRes.body.title).toBe('My First Article');
    expect(updateRes.body.tagNames.sort()).toEqual(['testing', 'vue']);
    expect(updateRes.body.readingTime).toBe(1);

    const publishRes = await request(app.getHttpServer())
      .post(`/articles/${articleId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(publishRes.body.status).toBe('PUBLISHED');
    expect(publishRes.body.slug).toBe('my-first-article');
    expect(publishRes.body.publishedAt).not.toBeNull();

    const unpublishRes = await request(app.getHttpServer())
      .post(`/articles/${articleId}/unpublish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(unpublishRes.body.status).toBe('DRAFT');
    expect(unpublishRes.body.slug).toBe('my-first-article');
  });

  it('rejects access to another author\'s article with 404, and rejects unauthenticated requests', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const articleId = createRes.body.id;

    await request(app.getHttpServer()).get(`/articles/${articleId}`).expect(401);

    const otherSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `e2e-articles-other-${Date.now()}@e2e-test.local`,
        password: 'password123',
        name: 'Other',
        username: `e2eother${Date.now()}`,
      });
    await request(app.getHttpServer())
      .get(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${otherSignup.body.accessToken}`)
      .expect(404);
  });

  it('GET /articles/cover-upload-signature returns signed upload params, and is not swallowed by the :id route', async () => {
    const res = await request(app.getHttpServer())
      .get('/articles/cover-upload-signature')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ folder: 'covers', apiKey: expect.any(String), signature: expect.any(String) }),
    );
  });
});
