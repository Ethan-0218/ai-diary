const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * mobile은 독립 pnpm 프로젝트지만 `@ai-diary/shared`를 file: 의존성으로 가져온다.
 * shared 실제 소스/빌드물은 레포 루트의 packages/shared에 있으므로 Metro가 그
 * 디렉터리를 감시·해석하도록 watchFolders에 레포 루트를 추가한다.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
