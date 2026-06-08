import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => ({ kind: 'jwks' })),
  jwtVerify: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { jwtVerify } = require('jose');
const mockJwtVerify = jwtVerify as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let users: { upsertByProvider: jest.Mock };
  let jwt: { sign: jest.Mock };
  let configMap: Record<string, string | undefined>;

  beforeEach(() => {
    users = {
      upsertByProvider: jest.fn(async (p) => ({ id: 'u1', ...p })),
    };
    jwt = { sign: jest.fn(() => 'access-token') };
    configMap = {
      GOOGLE_CLIENT_ID: 'gid',
      APPLE_CLIENT_ID: 'aid',
      NODE_ENV: 'test',
    };
    const config = { get: jest.fn((k: string) => configMap[k]) };
    service = new AuthService(users as any, jwt as any, config as any);
    mockJwtVerify.mockReset();
    global.fetch = jest.fn();
  });

  describe('login - google', () => {
    it('id_token 검증 후 유저 upsert + 토큰 발급 (email/name 있음)', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: 'g1', email: 'a@b.com', name: '지우' },
      });

      const result = await service.login('google', 'idtok');

      expect(mockJwtVerify).toHaveBeenCalledWith('idtok', expect.anything(), {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: 'gid',
      });
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'g1',
        email: 'a@b.com',
        name: '지우',
      });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1' });
      expect(result.accessToken).toBe('access-token');
      expect(result.user.provider).toBe('google');
    });

    it('email/name 없으면 null', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'g2' } });
      await service.login('google', 'idtok');
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'g2',
        email: null,
        name: null,
      });
    });

    it('GOOGLE_CLIENT_ID 미설정이면 Unauthorized', async () => {
      configMap.GOOGLE_CLIENT_ID = undefined;
      await expect(service.login('google', 'x')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });
  });

  describe('login - apple', () => {
    it('검증 후 email 사용, name은 항상 null', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: 'a1', email: 'x@y.com' },
      });
      await service.login('apple', 'idtok');
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'apple',
        providerId: 'a1',
        email: 'x@y.com',
        name: null,
      });
    });

    it('email 없으면 null', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'a2' } });
      await service.login('apple', 'idtok');
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'apple',
        providerId: 'a2',
        email: null,
        name: null,
      });
    });
  });

  describe('login - kakao', () => {
    it('kakao API로 프로필 조회 (email/nickname 있음)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 777,
          kakao_account: { email: 'k@k.com', profile: { nickname: '카카오' } },
        }),
      });

      await service.login('kakao', 'acctok');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://kapi.kakao.com/v2/user/me',
        { headers: { Authorization: 'Bearer acctok' } },
      );
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'kakao',
        providerId: '777',
        email: 'k@k.com',
        name: '카카오',
      });
    });

    it('account/profile 없으면 email·name null', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });
      await service.login('kakao', 'acctok');
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'kakao',
        providerId: '1',
        email: null,
        name: null,
      });
    });

    it('응답이 ok가 아니면 Unauthorized', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
      await expect(service.login('kakao', 'bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('지원하지 않는 provider면 Unauthorized', async () => {
    await expect(service.login('weird' as any, 't')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('devLogin', () => {
    it('비프로덕션: id/email/name으로 dev 유저 발급', async () => {
      const result = await service.devLogin({
        id: 'custom',
        email: 'd@e.com',
        name: '데브',
      });
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'dev',
        providerId: 'custom',
        email: 'd@e.com',
        name: '데브',
      });
      expect(result.accessToken).toBe('access-token');
    });

    it('id 없으면 dev-user 기본값, email/name null', async () => {
      await service.devLogin({});
      expect(users.upsertByProvider).toHaveBeenCalledWith({
        provider: 'dev',
        providerId: 'dev-user',
        email: null,
        name: null,
      });
    });

    it('프로덕션이면 Forbidden', async () => {
      configMap.NODE_ENV = 'production';
      await expect(service.devLogin({})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(users.upsertByProvider).not.toHaveBeenCalled();
    });
  });
});
