import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ProviderProfile, UserService } from '../user/user.service';

/** 실제 소셜 로그인 provider (dev-login은 별도 경로) */
export type AuthProvider = 'google' | 'apple' | 'kakao';

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
const APPLE_ISS = 'https://appleid.apple.com';
const KAKAO_ME = 'https://kapi.kakao.com/v2/user/me';

@Injectable()
export class AuthService {
  private readonly googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS));
  private readonly appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS));

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** provider 토큰을 검증 → 유저 upsert → 우리 액세스 토큰 발급 */
  async login(provider: AuthProvider, token: string) {
    const profile = await this.verify(provider, token);
    const user = await this.users.upsertByProvider(profile);
    return { accessToken: this.issueToken(user.id), user };
  }

  /** 개발 전용 로그인 — 외부 검증 없이 테스트 유저 발급. 프로덕션에서는 금지. */
  async devLogin(input: { id?: string; email?: string; name?: string }) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('dev login is disabled in production');
    }
    const user = await this.users.upsertByProvider({
      provider: 'dev',
      providerId: input.id?.trim() || 'dev-user',
      email: input.email ?? null,
      name: input.name ?? null,
    });
    return { accessToken: this.issueToken(user.id), user };
  }

  issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private verify(provider: AuthProvider, token: string): Promise<ProviderProfile> {
    switch (provider) {
      case 'google':
        return this.verifyGoogle(token);
      case 'apple':
        return this.verifyApple(token);
      case 'kakao':
        return this.verifyKakao(token);
      default:
        throw new UnauthorizedException(`unsupported provider: ${provider}`);
    }
  }

  private async verifyGoogle(token: string): Promise<ProviderProfile> {
    const audience = this.requireConfig('GOOGLE_CLIENT_ID');
    const { payload } = await jwtVerify(token, this.googleJwks, {
      issuer: GOOGLE_ISS,
      audience,
    });
    return {
      provider: 'google',
      providerId: String(payload.sub),
      email: (payload.email as string) ?? null,
      name: (payload.name as string) ?? null,
    };
  }

  private async verifyApple(token: string): Promise<ProviderProfile> {
    const audience = this.requireConfig('APPLE_CLIENT_ID');
    const { payload } = await jwtVerify(token, this.appleJwks, {
      issuer: APPLE_ISS,
      audience,
    });
    return {
      provider: 'apple',
      providerId: String(payload.sub),
      email: (payload.email as string) ?? null,
      name: null, // Apple은 id_token에 이름을 담지 않음(최초 동의 시 별도 전달)
    };
  }

  private async verifyKakao(token: string): Promise<ProviderProfile> {
    const res = await fetch(KAKAO_ME, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new UnauthorizedException('kakao token verification failed');
    }
    const data: any = await res.json();
    const account = data.kakao_account ?? {};
    return {
      provider: 'kakao',
      providerId: String(data.id),
      email: account.email ?? null,
      name: account.profile?.nickname ?? null,
    };
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new UnauthorizedException(`${key} is not configured`);
    }
    return value;
  }
}
