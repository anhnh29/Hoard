import { Module } from '@nestjs/common';
import { ClapsController } from './claps.controller';
import { ClapsService } from './claps.service';

@Module({
  controllers: [ClapsController],
  providers: [ClapsService],
})
export class ClapsModule {}
