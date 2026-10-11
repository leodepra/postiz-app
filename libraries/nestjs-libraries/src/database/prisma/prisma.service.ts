import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { isLocalProfile } from '@gitroom/helpers/security/local-profile';
import { integrationCipherMiddleware } from '@gitroom/helpers/security/integration-cipher-middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
      ],
    });
    if (isLocalProfile()) {
      this.$use(integrationCipherMiddleware);
    }
  }
  async onModuleInit() {
    await this.$connect();
    if (isLocalProfile()) {
      const unsafe = await this.integration.count({ where: { OR: [
        { token: { not: { startsWith: 'postiz:v1:' } } },
        { refreshToken: { not: '' }, NOT: { refreshToken: { startsWith: 'postiz:v1:' } } },
        { providerIdentifier: { not: 'youtube' } },
      ] } });
      if (unsafe) throw new Error('Local profile requires a new database or a reviewed token migration');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Injectable()
export class PrismaRepository<T extends keyof PrismaService> {
  public model: Pick<PrismaService, T>;
  constructor(private _prismaService: PrismaService) {
    this.model = this._prismaService;
  }
}

@Injectable()
export class PrismaTransaction {
  public model: Pick<PrismaService, '$transaction'>;
  constructor(private _prismaService: PrismaService) {
    this.model = this._prismaService;
  }
}
