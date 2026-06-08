import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(headers: Record<string, string>): ExecutionContext {
  const req: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(jwt as any);
  });

  it('유효한 Bearer 토큰이면 true + req.userId 설정', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    const req: any = { headers: { authorization: 'Bearer tok' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('tok');
    expect(req.userId).toBe('u1');
  });

  it('authorization 헤더 없으면 Unauthorized', async () => {
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('Bearer 스킴이 아니면 Unauthorized', async () => {
    await expect(
      guard.canActivate(ctx({ authorization: 'Basic abc' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Bearer 뒤 토큰이 없으면 Unauthorized', async () => {
    await expect(
      guard.canActivate(ctx({ authorization: 'Bearer' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('토큰 검증 실패면 Unauthorized', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      guard.canActivate(ctx({ authorization: 'Bearer bad' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
