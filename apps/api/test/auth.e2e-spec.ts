import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@e2e-test.local`;

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
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('signs up, logs in, refreshes, fetches /me, then logs out', async () => {
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'E2E User', username: `e2e${Date.now()}` })
      .expect(201);

    expect(signupRes.body.user.email).toBe(testEmail);
    expect(signupRes.body.accessToken).toBeDefined();
    const signupCookie = signupRes.headers['set-cookie'];
    expect(signupCookie).toBeDefined();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'password123' })
      .expect(201);

    expect(loginRes.body.accessToken).toBeDefined();
    const refreshCookie = loginRes.headers['set-cookie'];

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
    expect(meRes.body.email).toBe(testEmail);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(201);
    expect(refreshRes.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(204);
  });

  it('rejects login with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'totally-wrong' })
      .expect(401);
  });

  it('rejects signup with a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Dupe', username: `dupe${Date.now()}` })
      .expect(409);
  });

  it('rejects /me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/google redirects to Google\'s OAuth consent screen', async () => {
    const res = await request(app.getHttpServer()).get('/auth/google').expect(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });
});
