import { ForbiddenException } from '@nestjs/common';
import { NotebookController, ProductController } from './notebook.controller';

describe('ProductController', () => {
  it('list가 getProducts 위임', async () => {
    const svc: any = { getProducts: jest.fn().mockResolvedValue(['p']) };
    const c = new ProductController(svc);
    expect(await c.list()).toEqual(['p']);
  });
});

describe('NotebookController', () => {
  const req: any = { userId: 'u1' };
  let svc: any, config: any, c: NotebookController;

  beforeEach(() => {
    svc = {
      listNotebooks: jest.fn().mockResolvedValue(['nb']),
      getHomeSummary: jest.fn().mockResolvedValue('summary'),
      mintStarter: jest.fn().mockResolvedValue('starter'),
      mintFromProduct: jest.fn().mockResolvedValue('granted'),
      getNotebook: jest.fn().mockResolvedValue('detail'),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    c = new NotebookController(svc, config);
  });

  it('list/getOne가 userId와 위임', async () => {
    expect(await c.list(req)).toEqual(['nb']);
    expect(svc.listNotebooks).toHaveBeenCalledWith('u1');
    expect(await c.getOne(req, 'nb1')).toBe('detail');
    expect(svc.getNotebook).toHaveBeenCalledWith('nb1', 'u1');
  });

  it('home: tz 전달, 빈 tz는 기본(undefined)', async () => {
    expect(await c.home(req, 'Asia/Seoul')).toBe('summary');
    expect(svc.getHomeSummary).toHaveBeenCalledWith('u1', 'Asia/Seoul');
    await c.home(req, '');
    expect(svc.getHomeSummary).toHaveBeenCalledWith('u1', undefined);
    await c.home(req);
    expect(svc.getHomeSummary).toHaveBeenCalledWith('u1', undefined);
  });

  it('starter: format 전달, 기본 plain', async () => {
    await c.starter(req, { format: 'novel' });
    expect(svc.mintStarter).toHaveBeenCalledWith('u1', 'novel');
    await c.starter(req, {});
    expect(svc.mintStarter).toHaveBeenCalledWith('u1', 'plain');
  });

  it('devGrant: 개발에선 grant 발행', async () => {
    expect(await c.devGrant(req, { appStoreProductId: ' pm ' })).toBe('granted');
    expect(svc.mintFromProduct).toHaveBeenCalledWith('u1', 'pm', { source: 'grant' });
  });

  it('devGrant: 빈 productId 기본 처리', async () => {
    await c.devGrant(req, {});
    expect(svc.mintFromProduct).toHaveBeenCalledWith('u1', '', { source: 'grant' });
  });

  it('devGrant: 프로덕션 금지', async () => {
    config.get.mockReturnValue('production');
    expect(() => c.devGrant(req, { appStoreProductId: 'pm' })).toThrow(ForbiddenException);
    expect(svc.mintFromProduct).not.toHaveBeenCalled();
  });
});
