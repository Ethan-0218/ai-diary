/** Jest 설정 — @swc/jest 변환(빠름) + NestJS 데코레이터 메타데이터.
 *  커버리지 100% 게이트(로직 없는 부트스트랩/DI 와이어링은 제외해 "의미 있는 100%"). */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'], // TypeORM/Nest 데코레이터 메타데이터

  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  // jose(v6)는 ESM 전용이라 jest의 require에서 깨진다 → @swc/jest로 변환되도록 ignore에서 제외.
  transformIgnorePatterns: ['/node_modules/\\.pnpm/(?!jose@)'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2021',
        },
      },
    ],
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!main.ts', // 부트스트랩
    '!**/*.module.ts', // DI 와이어링
    '!**/*.entity.ts', // 선언적 스키마 (TypeORM 엔티티)
    '!entities/index.ts', // 배럴
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
