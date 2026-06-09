import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
} from '@apple/app-store-server-library';

/** 검증·디코드된 트랜잭션에서 우리가 쓰는 핵심 필드 */
export interface VerifiedTransaction {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  environment: string; // 'Xcode' | 'Sandbox' | 'Production'
}

const CERTS_DIR = join(process.cwd(), 'certs');
const ROOT_CERT_FILES = ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer'];

/**
 * JWS(purchaseToken)의 페이로드만 디코드해 environment를 읽는다(서명 검증 전 라우팅용).
 * 페이로드는 서명되어 있어 이 값 자체로 신뢰하지 않고, 어느 검증기를 쓸지 고르는 데만 쓴다.
 */
export function decodeTransactionEnvironment(jws: string): string {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('결제 영수증 형식이 올바르지 않아요.');
  }
  let payload: { environment?: unknown };
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedException('결제 영수증을 해독하지 못했어요.');
  }
  if (typeof payload.environment !== 'string') {
    throw new UnauthorizedException('결제 영수증에 환경 정보가 없어요.');
  }
  return payload.environment;
}

/**
 * StoreKit 2 서명 트랜잭션(JWS) 검증. (App Store Server Library)
 * - Production/Sandbox: Apple 루트 인증서 체인 검증.
 * - Xcode(.storekit 로컬): App Store 서명이 아니므로 라이브러리가 검증을 스킵 → **비프로덕션에서만** 허용.
 */
@Injectable()
export class ReceiptVerifierService {
  private readonly bundleId: string;
  private readonly appAppleId?: number;
  private readonly rootCerts: Buffer[];
  private readonly verifiers = new Map<string, SignedDataVerifier>();

  constructor(private readonly config: ConfigService) {
    this.bundleId = config.get<string>('APPLE_BUNDLE_ID') ?? 'com.ai-diary.app';
    const appleId = config.get<string>('APPLE_APP_APPLE_ID');
    this.appAppleId = appleId ? Number(appleId) : undefined;
    this.rootCerts = loadRootCerts();
  }

  async verify(jws: string): Promise<VerifiedTransaction> {
    const env = decodeTransactionEnvironment(jws);
    const verifier = this.verifierFor(env);
    let decoded: { productId?: string; transactionId?: string; originalTransactionId?: string; purchaseDate?: number };
    try {
      decoded = await verifier.verifyAndDecodeTransaction(jws);
    } catch (e) {
      if (e instanceof VerificationException) {
        throw new UnauthorizedException('결제 영수증 검증에 실패했어요.');
      }
      throw e;
    }
    if (!decoded.productId || !decoded.transactionId) {
      throw new UnauthorizedException('결제 영수증에 필요한 정보가 없어요.');
    }
    return {
      productId: decoded.productId,
      transactionId: decoded.transactionId,
      originalTransactionId: decoded.originalTransactionId ?? decoded.transactionId,
      purchaseDate: new Date(decoded.purchaseDate ?? Date.now()),
      environment: env,
    };
  }

  private verifierFor(env: string): SignedDataVerifier {
    const cached = this.verifiers.get(env);
    if (cached) return cached;
    const built = this.buildVerifier(env);
    this.verifiers.set(env, built);
    return built;
  }

  private buildVerifier(env: string): SignedDataVerifier {
    const e = toEnvironment(env);
    if (e === Environment.XCODE) {
      // 로컬 테스트 결제 — 프로덕션에서는 절대 받지 않는다.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ForbiddenException('테스트 결제는 프로덕션에서 허용되지 않아요.');
      }
      return new SignedDataVerifier([], false, Environment.XCODE, this.bundleId, this.appAppleId);
    }
    return new SignedDataVerifier(this.rootCerts, false, e, this.bundleId, this.appAppleId);
  }
}

function toEnvironment(env: string): Environment {
  switch (env) {
    case 'Xcode':
      return Environment.XCODE;
    case 'Sandbox':
      return Environment.SANDBOX;
    case 'Production':
      return Environment.PRODUCTION;
    default:
      throw new UnauthorizedException(`알 수 없는 결제 환경: ${env}`);
  }
}

/** 커밋된 Apple 루트 인증서(certs/)를 로드. Sandbox/Production 체인 검증용. */
function loadRootCerts(): Buffer[] {
  return ROOT_CERT_FILES.map((f) => readFileSync(join(CERTS_DIR, f)));
}
