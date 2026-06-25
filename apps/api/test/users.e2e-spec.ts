import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-users-${Date.now()}@e2e-test.local`;
  const testUsername = `e2eusers${Date.now()}`;
  let accessToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL ??= 'http://localhost:3001/auth/google/callback';
    process.env.CLOUDINARY_URL = 'cloudinary://test-key:test-secret@test-cloud';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Profile User', username: testUsername });
    accessToken = signupRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('GET /users/:username returns the public profile', async () => {
    const res = await request(app.getHttpServer()).get(`/users/${testUsername}`).expect(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      username: testUsername,
      name: 'Profile User',
      bio: null,
      avatarUrl: null,
    });
  });

  it('GET /users/:username 404s for an unknown username', async () => {
    await request(app.getHttpServer()).get('/users/does-not-exist').expect(404);
  });

  it('PATCH /users/me updates the current user and rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).patch('/users/me').send({ name: 'New Name' }).expect(401);

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Name', bio: 'Hello world' })
      .expect(200);

    expect(res.body.name).toBe('New Name');
    expect(res.body.bio).toBe('Hello world');
  });

  it('PATCH /users/me updates avatarUrl', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/avatar.png' })
      .expect(200);

    expect(res.body.avatarUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/avatar.png');
  });

  it('GET /users/me/avatar-upload-signature returns signed Cloudinary upload params', async () => {
    await request(app.getHttpServer()).get('/users/me/avatar-upload-signature').expect(401);

    const res = await request(app.getHttpServer())
      .get('/users/me/avatar-upload-signature')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      timestamp: expect.any(Number),
      signature: expect.any(String),
      apiKey: 'test-key',
      cloudName: 'test-cloud',
      folder: 'avatars',
    });
  });
});
