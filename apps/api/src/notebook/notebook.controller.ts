import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { StarterFormat } from '@ai-diary/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotebookService } from './notebook.service';

type AuthedRequest = Request & { userId: string };

/** 진열 상품 카탈로그 — 인증 불필요(가격은 클라가 StoreKit으로 합친다). */
@Controller('products')
export class ProductController {
  constructor(private readonly notebooks: NotebookService) {}

  @Get()
  list() {
    return this.notebooks.getProducts();
  }
}

@UseGuards(JwtAuthGuard)
@Controller('notebooks')
export class NotebookController {
  constructor(
    private readonly notebooks: NotebookService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.notebooks.listNotebooks(req.userId);
  }

  /** 적응형 홈(오늘) 요약. tz는 유저 IANA 타임존(없으면 서버 기본). */
  @Get('home')
  home(@Req() req: AuthedRequest, @Query('tz') tz?: string) {
    return this.notebooks.getHomeSummary(req.userId, tz || undefined);
  }

  @Post('starter')
  starter(@Req() req: AuthedRequest, @Body() body: { format?: string }) {
    return this.notebooks.mintStarter(
      req.userId,
      (body?.format ?? 'plain') as StarterFormat,
    );
  }

  /** 개발 전용 — IAP 검증 전 일기장 발행 언블락. 프로덕션 금지. */
  @Post('dev-grant')
  devGrant(
    @Req() req: AuthedRequest,
    @Body() body: { appStoreProductId?: string },
  ) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('dev grant is disabled in production');
    }
    return this.notebooks.mintFromProduct(
      req.userId,
      (body?.appStoreProductId ?? '').trim(),
      { source: 'grant' },
    );
  }

  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notebooks.getNotebook(id, req.userId);
  }
}
