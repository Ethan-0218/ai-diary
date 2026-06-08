import { absoluteUrl } from './api';

interface AttachmentLike {
  url: string;
}

/**
 * 일기 본문의 `![](사진N)` 플레이스홀더를 N번째 첨부의 실제 절대 URL로 치환.
 * (web diary 페이지와 동일 로직 + RN용 absoluteUrl 적용)
 */
export function resolvePhotoTokens(
  content: string,
  attachments: AttachmentLike[],
): string {
  return content.replace(
    /(!\[[^\]]*\]\()\s*사진\s*(\d+)\s*(\))/g,
    (full, pre: string, n: string, post: string) => {
      const att = attachments[Number(n) - 1];
      return att ? `${pre}${absoluteUrl(att.url)}${post}` : full;
    },
  );
}
