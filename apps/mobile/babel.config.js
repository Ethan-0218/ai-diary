module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // ai SDK가 의존하는 zod v4가 `export * as ns` 구문을 써서 이 플러그인이 필요하다.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
