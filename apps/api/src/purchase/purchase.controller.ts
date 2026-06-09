import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PurchaseService } from './purchase.service';

type AuthedRequest = Request & { userId: string };

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchaseController {
  constructor(private readonly purchases: PurchaseService) {}

  /** 구매 영수증(StoreKit JWS=purchaseToken) 검증 → 일기장 발행. */
  @Post('verify')
  verify(@Req() req: AuthedRequest, @Body() body: { purchaseToken?: string }) {
    return this.purchases.verifyAndMint(
      req.userId,
      (body?.purchaseToken ?? '').trim(),
    );
  }
}
