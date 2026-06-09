import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { NotebookDetailDto } from '@ai-diary/shared';
import { Notebook, Purchase } from '../entities';
import { NotebookService } from '../notebook/notebook.service';
import { ReceiptVerifierService } from './receipt-verifier.service';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Notebook)
    private readonly notebooks: Repository<Notebook>,
    private readonly verifier: ReceiptVerifierService,
    private readonly notebookService: NotebookService,
  ) {}

  /**
   * 구매 영수증(JWS)을 검증해 일기장을 발행한다.
   * transactionId 유니크로 멱등(같은 결제 재검증/재시도는 이미 발행한 권을 돌려줌).
   */
  async verifyAndMint(
    userId: string,
    purchaseToken: string,
  ): Promise<NotebookDetailDto> {
    if (!purchaseToken) {
      throw new BadRequestException('결제 정보가 비어 있어요.');
    }
    const tx = await this.verifier.verify(purchaseToken);

    const existing = await this.purchases.findOne({
      where: { transactionId: tx.transactionId },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('이미 다른 계정에서 처리된 결제예요.');
      }
      const minted = await this.notebooks.findOne({
        where: { purchaseId: existing.id },
      });
      if (minted) return this.notebookService.getNotebook(minted.id, userId);
      // 결제는 기록됐지만 발행이 누락된 경우 재발행(멱등).
      return this.notebookService.mintFromProduct(userId, tx.productId, {
        source: 'purchase',
        purchaseId: existing.id,
      });
    }

    const purchase = await this.purchases.save(
      this.purchases.create({
        userId,
        appStoreProductId: tx.productId,
        transactionId: tx.transactionId,
        originalTransactionId: tx.originalTransactionId,
        purchaseDate: tx.purchaseDate,
        environment: tx.environment,
        status: 'valid',
        rawPayload: purchaseToken,
      }),
    );
    return this.notebookService.mintFromProduct(userId, tx.productId, {
      source: 'purchase',
      purchaseId: purchase.id,
    });
  }
}
