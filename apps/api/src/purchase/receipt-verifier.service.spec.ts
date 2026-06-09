jest.mock('@apple/app-store-server-library', () => {
  const verifyAndDecodeTransaction = jest.fn();
  class VerificationException extends Error {}
  const SignedDataVerifier = jest
    .fn()
    .mockImplementation(() => ({ verifyAndDecodeTransaction }));
  return {
    __verify: verifyAndDecodeTransaction,
    SignedDataVerifier,
    VerificationException,
    Environment: {
      XCODE: 'Xcode',
      SANDBOX: 'Sandbox',
      PRODUCTION: 'Production',
      LOCAL_TESTING: 'LocalTesting',
    },
  };
});

import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ReceiptVerifierService,
  decodeTransactionEnvironment,
} from './receipt-verifier.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('@apple/app-store-server-library');

const mkJws = (payload: any) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

describe('decodeTransactionEnvironment', () => {
  it('정상 페이로드에서 environment 추출', () => {
    expect(decodeTransactionEnvironment(mkJws({ environment: 'Xcode' }))).toBe('Xcode');
  });
  it('3등분 아니면 Unauthorized', () => {
    expect(() => decodeTransactionEnvironment('a.b')).toThrow(UnauthorizedException);
  });
  it('페이로드가 JSON 아니면 Unauthorized', () => {
    expect(() => decodeTransactionEnvironment('h.@@@notjson@@@.s')).toThrow(
      UnauthorizedException,
    );
  });
  it('environment 필드 없으면 Unauthorized', () => {
    expect(() => decodeTransactionEnvironment(mkJws({ foo: 1 }))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('ReceiptVerifierService', () => {
  let config: any;
  let service: ReceiptVerifierService;

  const makeConfig = (over: Record<string, string | undefined> = {}) => ({
    get: jest.fn(
      (k: string) =>
        ({
          NODE_ENV: 'test',
          APPLE_BUNDLE_ID: 'com.ai-diary.app',
          APPLE_APP_APPLE_ID: '6778283347',
          ...over,
        })[k],
    ),
  });

  beforeEach(() => {
    lib.__verify.mockReset();
    lib.SignedDataVerifier.mockClear();
    config = makeConfig();
    service = new ReceiptVerifierService(config);
  });

  it('Xcode(비프로덕션) 성공 → 핵심 필드 추출', async () => {
    lib.__verify.mockResolvedValue({
      productId: 'com.aidiary.notebook.plain_month_w4',
      transactionId: 't1',
      originalTransactionId: 'o1',
      purchaseDate: 1750000000000,
    });
    const tx = await service.verify(mkJws({ environment: 'Xcode' }));
    expect(tx).toMatchObject({
      productId: 'com.aidiary.notebook.plain_month_w4',
      transactionId: 't1',
      originalTransactionId: 'o1',
      environment: 'Xcode',
    });
    expect(tx.purchaseDate).toEqual(new Date(1750000000000));
    // Xcode 검증기는 빈 인증서 + Environment.XCODE
    expect(lib.SignedDataVerifier).toHaveBeenCalledWith([], false, 'Xcode', 'com.ai-diary.app', 6778283347);
  });

  it('originalTransactionId/purchaseDate 누락 시 폴백', async () => {
    lib.__verify.mockResolvedValue({ productId: 'p', transactionId: 't1' });
    const tx = await service.verify(mkJws({ environment: 'Xcode' }));
    expect(tx.originalTransactionId).toBe('t1');
    expect(tx.purchaseDate).toBeInstanceOf(Date);
  });

  it('VerificationException → Unauthorized', async () => {
    lib.__verify.mockRejectedValue(new lib.VerificationException('bad'));
    await expect(service.verify(mkJws({ environment: 'Sandbox' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('그 외 에러는 그대로 전파', async () => {
    lib.__verify.mockRejectedValue(new Error('boom'));
    await expect(service.verify(mkJws({ environment: 'Sandbox' }))).rejects.toThrow('boom');
  });

  it('productId/transactionId 없으면 Unauthorized', async () => {
    lib.__verify.mockResolvedValue({ transactionId: 't1' }); // productId 없음
    await expect(service.verify(mkJws({ environment: 'Sandbox' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('같은 환경이면 검증기 캐시(생성 1회)', async () => {
    lib.__verify.mockResolvedValue({ productId: 'p', transactionId: 't' });
    await service.verify(mkJws({ environment: 'Xcode' }));
    await service.verify(mkJws({ environment: 'Xcode' }));
    expect(lib.SignedDataVerifier).toHaveBeenCalledTimes(1);
  });

  it('Sandbox/Production은 루트 인증서로 생성', async () => {
    lib.__verify.mockResolvedValue({ productId: 'p', transactionId: 't' });
    await service.verify(mkJws({ environment: 'Sandbox' }));
    await service.verify(mkJws({ environment: 'Production' }));
    const envs = lib.SignedDataVerifier.mock.calls.map((c: any[]) => c[2]);
    expect(envs).toEqual(['Sandbox', 'Production']);
    // 루트 인증서 배열이 비어있지 않음
    expect(lib.SignedDataVerifier.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('Xcode인데 프로덕션이면 Forbidden', async () => {
    service = new ReceiptVerifierService(makeConfig({ NODE_ENV: 'production' }));
    await expect(service.verify(mkJws({ environment: 'Xcode' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('알 수 없는 환경이면 Unauthorized', async () => {
    await expect(service.verify(mkJws({ environment: 'Weird' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('APPLE_APP_APPLE_ID 미설정도 동작(undefined 전달)', async () => {
    service = new ReceiptVerifierService(makeConfig({ APPLE_APP_APPLE_ID: undefined }));
    lib.__verify.mockResolvedValue({ productId: 'p', transactionId: 't' });
    await service.verify(mkJws({ environment: 'Xcode' }));
    expect(lib.SignedDataVerifier).toHaveBeenCalledWith([], false, 'Xcode', 'com.ai-diary.app', undefined);
  });

  it('APPLE_BUNDLE_ID 미설정 시 기본값 사용', async () => {
    service = new ReceiptVerifierService(makeConfig({ APPLE_BUNDLE_ID: undefined }));
    lib.__verify.mockResolvedValue({ productId: 'p', transactionId: 't' });
    await service.verify(mkJws({ environment: 'Xcode' }));
    expect(lib.SignedDataVerifier.mock.calls[0][3]).toBe('com.ai-diary.app');
  });
});
