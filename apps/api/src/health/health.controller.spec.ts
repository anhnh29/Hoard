import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok with dbConnected true when the db query succeeds', async () => {
    await expect(controller.check()).resolves.toEqual({ status: 'ok', dbConnected: true });
  });

  it('returns error with dbConnected false when the db query throws', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.check()).resolves.toEqual({ status: 'error', dbConnected: false });
  });
});
