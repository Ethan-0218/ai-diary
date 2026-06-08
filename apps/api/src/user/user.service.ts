import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';

/** provider 검증 후 얻은 유저 프로필 (User upsert 입력) */
export interface ProviderProfile {
  provider: string; // 'apple' | 'google' | 'kakao' | 'dev'
  providerId: string;
  email?: string | null;
  name?: string | null;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** provider+providerId로 유저를 찾거나 생성하고, 프로필(email/name)을 최신으로 갱신한다. */
  async upsertByProvider(p: ProviderProfile): Promise<User> {
    await this.users.upsert(
      {
        provider: p.provider,
        providerId: p.providerId,
        email: p.email ?? null,
        name: p.name ?? null,
      },
      ['provider', 'providerId'],
    );
    return this.users.findOneOrFail({
      where: { provider: p.provider, providerId: p.providerId },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }
}
