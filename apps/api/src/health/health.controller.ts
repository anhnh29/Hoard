import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', dbConnected: true };
    } catch {
      return { status: 'error', dbConnected: false };
    }
  }
}
