import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  type INestApplication,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const PRISMA_LOG_LEVELS = ['info', 'query', 'warn', 'error'] as const;

type PrismaLogLevel = (typeof PRISMA_LOG_LEVELS)[number];

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

  private static resolveLogLevels(): PrismaLogLevel[] {
    const configuredLevels = process.env.PRISMA_LOG_LEVELS?.split(',')
      .map((level) => level.trim())
      .filter((level): level is PrismaLogLevel => isPrismaLogLevel(level));

    if (configuredLevels?.length) {
      return configuredLevels;
    }

    return process.env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['error'];
  }
}

function isPrismaLogLevel(level: string): level is PrismaLogLevel {
  return PRISMA_LOG_LEVELS.some((logLevel) => logLevel === level);
}
