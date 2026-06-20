import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  type INestApplication,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: PrismaService.resolveLogLevels(),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  private static resolveLogLevels(): Prisma.LogLevel[] {
    const configuredLevels = process.env.PRISMA_LOG_LEVELS?.split(',')
      .map((level) => level.trim())
      .filter(Boolean) as Prisma.LogLevel[] | undefined;

    if (configuredLevels?.length) {
      return configuredLevels;
    }

    return process.env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['error'];
  }
}
