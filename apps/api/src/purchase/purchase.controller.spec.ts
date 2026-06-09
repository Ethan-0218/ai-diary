import { PurchaseController } from './purchase.controller';

describe('PurchaseController', () => {
  const req: any = { userId: 'u1' };
  let svc: any, c: PurchaseController;

  beforeEach(() => {
    svc = { verifyAndMint: jest.fn().mockResolvedValue({ id: 'nb1' }) };
    c = new PurchaseController(svc);
  });

  it('verify: userId + 트림된 토큰 위임', async () => {
    expect(await c.verify(req, { purchaseToken: '  jws  ' })).toEqual({ id: 'nb1' });
    expect(svc.verifyAndMint).toHaveBeenCalledWith('u1', 'jws');
  });

  it('verify: 토큰 없으면 빈 문자열', async () => {
    await c.verify(req, {});
    expect(svc.verifyAndMint).toHaveBeenCalledWith('u1', '');
  });
});
