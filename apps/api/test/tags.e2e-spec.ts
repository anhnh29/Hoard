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
  });

  afterAll(async () => {
    await prisma.tag.deleteMany({ where: { name: { startsWith: 'e2e-tag-' } } });
    await app.close();
  });

  it('GET /tags returns all tags including the seeded one', async () => {
    const res = await request(app.getHttpServer()).get('/tags').expect(200);
    expect(res.body.some((t: { name: string }) => t.name === testTagName)).toBe(true);
  });
});
