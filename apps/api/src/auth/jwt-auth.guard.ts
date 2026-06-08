import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/** Authorization: Bearer <jwt> 를 검증하고 req.userId 에 sub를 붙인다. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      (req as Request & { userId: string }).userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [type, value] = header.split(' ');
  return type === 'Bearer' && value ? value : null;
}
