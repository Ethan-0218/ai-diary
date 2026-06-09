import { Controller, Get, Header } from '@nestjs/common';

const CONTACT_EMAIL = process.env.PRIVACY_CONTACT_EMAIL || 'ehdtls901@gmail.com';
const EFFECTIVE_DATE = '2026-06-09';

/** 개인정보처리방침 HTML (외부 검수/App Store용 공개 페이지). 인증 불필요. */
function privacyHtml(): string {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 일기 개인정보처리방침</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;line-height:1.7;color:#222;max-width:720px;margin:40px auto;padding:0 20px}
  h1{font-size:1.6rem} h2{font-size:1.15rem;margin-top:1.8em} ul{padding-left:1.2em}
  .muted{color:#666;font-size:.9rem} a{color:#4f5bd5}
</style></head><body>
<h1>AI 일기 개인정보처리방침</h1>
<p class="muted">시행일: ${EFFECTIVE_DATE}</p>
<p>AI 일기(이하 ‘서비스’)는 이용자의 개인정보를 소중히 다룹니다. 본 방침은 서비스가 수집하는 정보와 이용 방식을 설명합니다.</p>

<h2>1. 수집하는 정보</h2>
<ul>
  <li><b>계정 정보</b>: Apple 로그인 시 제공되는 식별자, 이메일, 이름(이름은 최초 동의 시에 한함).</li>
  <li><b>작성 콘텐츠</b>: 이용자가 입력한 대화 내용, 생성된 일기, 첨부한 사진.</li>
  <li><b>위치 정보</b>: 날씨를 일기에 반영하기 위한 위치(선택 · 권한 동의 시에만, 사용 중에만).</li>
  <li><b>결제 정보</b>: 인앱 구매 영수증·거래 식별자(결제는 Apple이 처리하며 카드 정보는 수집하지 않습니다).</li>
  <li><b>이용 로그</b>: 서비스 운영을 위한 기술적 로그.</li>
</ul>

<h2>2. 이용 목적</h2>
<ul>
  <li>대화 기반 일기 생성·수정·보관 및 맞춤 기억 기능 제공.</li>
  <li>날씨 등 맥락 정보 반영.</li>
  <li>인앱 구매(일기장) 영수증 검증 및 제공.</li>
  <li>서비스 운영·품질 개선·문의 응대.</li>
</ul>

<h2>3. 제3자 처리 및 공유</h2>
<ul>
  <li><b>AI 처리</b>: 일기 생성·요약·사진 설명을 위해 대화 내용과 사진이 AI 제공자(Google, OpenAI)의 API로 전송되어 처리됩니다.</li>
  <li><b>날씨</b>: 위치 좌표가 날씨 제공자에게 전송됩니다.</li>
  <li><b>Apple</b>: 로그인 및 결제 처리.</li>
  <li>위 외에는 이용자 동의 없이 개인정보를 판매하거나 공유하지 않습니다.</li>
</ul>

<h2>4. 보관 및 파기</h2>
<p>정보는 서비스 제공에 필요한 기간 동안 보관하며, 이용자가 콘텐츠 또는 계정을 삭제하면 관련 정보를 지체 없이 파기합니다.</p>

<h2>5. 이용자의 권리</h2>
<p>이용자는 자신의 일기·계정 정보를 열람·삭제할 수 있으며, 앱 내 또는 아래 연락처를 통해 계정 삭제를 요청할 수 있습니다.</p>

<h2>6. 보안</h2>
<p>전송 구간 암호화(HTTPS) 등 합리적인 보호 조치를 적용합니다.</p>

<h2>7. 아동</h2>
<p>본 서비스는 만 14세 미만 아동을 대상으로 하지 않습니다.</p>

<h2>8. 문의</h2>
<p>개인정보 관련 문의: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body></html>`;
}

@Controller()
export class LegalController {
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  privacy(): string {
    return privacyHtml();
  }
}
