import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../entities';

/** TypeORM(Postgres) 연결. dev는 synchronize로 엔티티→스키마 자동 반영.
 *  prod는 기본 synchronize off — 단, 새 DB 첫 배포 시 DB_SYNCHRONIZE=true로 1회 켜서
 *  스키마를 생성한 뒤 다시 끈다(정식 마이그레이션 전환은 후속). */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: ENTITIES,
        synchronize:
          config.get<string>('DB_SYNCHRONIZE') === 'true' ||
          config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
