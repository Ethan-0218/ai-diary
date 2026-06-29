// zero-width space (폭 0, 화면에 보이지 않음). 소스에 보이지 않는 문자가 섞이지
// 않도록 코드포인트로 생성한다.
const ZWSP = String.fromCharCode(0x200b);

/**
 * 한글(CJK)·따옴표가 강조 구분자에 바로 붙으면 CommonMark의 flanking 규칙 때문에
 * markdown-it이 굵게(이중 별표)·__굵게__를 닫지 못해 별표가 그대로 노출되는 문제를 보정한다.
 *
 * 예) 닫는 구분자 앞이 따옴표(구두점)이고 뒤가 한글이면 right-flanking이 아니어서
 *     강조가 닫히지 않는다. 구분자 안쪽에 zero-width space를 끼워 넣어 구분자가 항상
 *     비공백·비구두점 문자에 접하게 만들면 flanking이 성립한다(ZWSP는 보이지 않음).
 */
export function fixCjkEmphasis(md: string): string {
  return md.replace(
    /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,
    (_m, delim: string, inner: string) =>
      `${delim}${ZWSP}${inner}${ZWSP}${delim}`,
  );
}
