import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** provider 검증 후 얻은 유저 프로필 (User upsert 입력) */
export interface ProviderProfile {
  provider: string; // 'apple' | 'google' | 'kakao' | 'dev'
  providerId: string;
  email?: string | null;
  name?: string | null;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** provider+providerId로 유저를 찾거나 생성하고, 프로필(email/name)을 최신으로 갱신한다. */
  upsertByProvider(p: ProviderProfile) {
    return this.prisma.user.upsert({
      where: {
        provider_providerId: { provider: p.provider, providerId: p.providerId },
      },
      create: {
        provider: p.provider,
        providerId: p.providerId,
        email: p.email ?? null,
        name: p.name ?? null,
      },
      update: { email: p.email ?? null, name: p.name ?? null },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
