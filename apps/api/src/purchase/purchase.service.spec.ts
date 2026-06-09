import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';

describe('PurchaseService', () => {
  let purchases: any, notebooks: any, verifier: any, notebookService: any;
  let service: PurchaseService;

  const tx = {
    productId: 'com.aidiary.notebook.plain_month_w4',
    transactionId: 't1',
    originalTransactionId: 'o1',
    purchaseDate: new Date('2026-06-09T00:00:00Z'),
    environment: 'Xcode',
  };

  beforeEach(() => {
    purchases = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue({ id: 'pur1' }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    notebooks = { findOne: jest.fn().mockResolvedValue(null) };
    verifier = { verify: jest.fn().mockResolvedValue(tx) };
    notebookService = {
      mintFromProduct: jest.fn().mockResolvedValue({ id: 'nb1' }),
      getNotebook: jest.fn().mockResolvedValue({ id: 'nbExisting' }),
    };
    service = new PurchaseService(purchases, notebooks, verifier, notebookService);
  });

  it('빈 토큰 → BadRequest', async () => {
    await expect(service.verifyAndMint('u1', '')).rejects.toBeInstanceOf(BadRequestException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('신규 결제 → 검증·Purchase 저장·발행', async () => {
    const r = await service.verifyAndMint('u1', 'jws');
    expect(verifier.verify).toHaveBeenCalledWith('jws');
    expect(purchases.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        appStoreProductId: tx.productId,
        transactionId: 't1',
        originalTransactionId: 'o1',
        environment: 'Xcode',
        status: 'valid',
        rawPayload: 'jws',
      }),
    );
    expect(notebookService.mintFromProduct).toHaveBeenCalledWith('u1', tx.productId, {
      source: 'purchase',
      purchaseId: 'pur1',
    });
    expect(r).toEqual({ id: 'nb1' });
  });

  it('이미 처리된 결제(같은 유저, 발행된 권 있음) → 그 권 반환(멱등)', async () => {
    purchases.findOne.mockResolvedValue({ id: 'purX', userId: 'u1' });
    notebooks.findOne.mockResolvedValue({ id: 'nbX' });
    const r = await service.verifyAndMint('u1', 'jws');
    expect(purchases.save).not.toHaveBeenCalled();
    expect(notebookService.getNotebook).toHaveBeenCalledWith('nbX', 'u1');
    expect(r).toEqual({ id: 'nbExisting' });
  });

  it('이미 처리됐지만 발행 누락 → 재발행', async () => {
    purchases.findOne.mockResolvedValue({ id: 'purX', userId: 'u1' });
    notebooks.findOne.mockResolvedValue(null);
    await service.verifyAndMint('u1', 'jws');
    expect(notebookService.mintFromProduct).toHaveBeenCalledWith('u1', tx.productId, {
      source: 'purchase',
      purchaseId: 'purX',
    });
  });

  it('다른 계정이 같은 트랜잭션 제출 → Forbidden', async () => {
    purchases.findOne.mockResolvedValue({ id: 'purX', userId: 'other' });
    await expect(service.verifyAndMint('u1', 'jws')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
