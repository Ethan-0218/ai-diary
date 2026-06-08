import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthProvider, AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) {}

  /** 모바일이 받은 provider 토큰으로 로그인 → 우리 액세스 토큰 발급 */
  @Post('login')
  login(@Body() body: { provider: AuthProvider; token: string }) {
    return this.auth.login(body.provider, body.token);
  }

  /** 개발 전용 — 외부 OAuth 없이 테스트 유저로 로그인 */
  @Post('dev-login')
  devLogin(@Body() body: { id?: string; email?: string; name?: string }) {
    return this.auth.devLogin(body ?? {});
  }

  /** 현재 로그인한 유저 */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { userId: string }) {
    return this.users.findById(req.userId);
  }
}
