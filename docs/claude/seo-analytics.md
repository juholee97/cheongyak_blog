# 검색 노출·색인·통계·애드센스

색인 점검, 서치콘솔·웹마스터도구, 애널리틱스, 애드센스, 검색량 조사를 할 때 읽는다. 괄호 안 날짜로 `history.md` 검색.

## 색인 요청
- 네이버·빙: Rank Math 「Instant Indexing」(IndexNow)이 글을 올리거나 고칠 때마다 자동으로 보낸다(2026-11-05).
- 구글: 일반 글용 API가 없다. 감시 예약 작업 `auleezip-deep-report-watch` 4b단계가 최근 2일 공개 글을 서치콘솔 URL 검사로 보고 「등록되어 있지 않음」만 색인 생성 요청. 이미 요청한 글은 다시 요청하지 않고, 「할당량 초과」면 멈추고 다음 실행으로.
- 예약 글은 공개 시각 전 403이라 색인 요청 불가.
- 사이트맵 점검: `curl -A "Mozilla/5.0 …" https://auleezip.com/post-sitemap.xml | grep -c "<loc>"` = 공개 글 수(2026-11-01).

## 색인 감시 (우리의 집, 2026-11-10 운영 원칙 3)
- `node zip/index_watch.mjs`에 「크롤링됨 - 현재 색인이 생성되지 않음」 글 수를 적는다(피드 제외). 비율이 오르면 `wp.mjs upsert`가 새 공개 글을 멈춘다(한번 멈추면 비율이 같거나 내려간 줄이 더 적혀도 `--release` 전까지 유지). `--release`는 사용자만.
- 서치콘솔 속성은 `https://auleezip.com/`(sc-domain 속성은 권한 없음). 매주 월요일 예약 작업 `cheongyak-weekly-seo-check`가 크롬으로 보고서를 읽어 장부에 적는다(보고서가 안 바뀌었으면 적지 않음).
- 기준선(2026-11-10): 색인 70, 공개 80, 크롤링됨-색인 안 됨 실제 글 5편(6.3%).
- 경과: 11-09~10 일괄 수정 뒤 다시 크롤링된 글이 색인에서 빠짐(원인 미확정) → 수정 한도·멈춤 스위치(`auleezip.md`). 11-14 기준 구글 웹 검색 노출 하루 0, 홈만 색인. 실제 페이지는 200·`index, follow`·자기 canonical·robots.txt 허용으로 정상.
- 그래서 공개 글 수정은 하루 10편 한도(`UPDATE_CAP`)로 나눠 나간다.

## 검색 순위 점검
- `posts/seo_near.mjs`(2026-11-11): 서치콘솔 API로 지난 28일 평균 11~20위 「검색어 × 글」→ `data/seo_near.json`. 키는 GA4 대시보드와 같은 읽기 전용 서비스 계정(`GSC_KEY_FILE` 또는 `D:\dev\blog_ga_dashboard\keys`), 한도 guard `gsc` 하루 100. 그 계정을 서치콘솔 속성에 「제한」 사용자로 추가해야 읽힌다(두 속성에 추가함).
- 제목 시험(2026-11-13): 공개된 심층 분석 13편 제목을 단지명 앞으로. 바꾸기 전 수치와 옛·새 제목은 `docs/title-test-20261113.md`. 그날 공개 글 수정이 36편이라 순위 변동을 제목 탓으로만 읽지 않는다.
- 검색량 도구 `tools/keyword_volume.mjs`(+`.bat`): 네이버 검색광고 API `/keywordstool`로 리서치 조회목록(`D:\dev\blogging_ai\_workspace\research\*조회목록*.txt`)의 월간 검색수 → 같은 폴더 `검색량_날짜.md·json`. 키는 `.env`(`SEARCHAD_API_KEY`·`SEARCHAD_SECRET`·`SEARCHAD_CUSTOMER_ID`, 사용자가 넣음). `--check`는 네트워크 없이 점검.
- 검색 등록 안내(티스토리): `docs/search-registration.md`.

## 웹마스터도구 (우리의 집, 2026-11-13)
- Daum: 인증은 WPCode 스니펫 1621이 robots.txt 끝에 인증 줄을 붙이는 방식. 수집 Seed는 RSS `/feed`, 사이트맵 `/sitemap_index.xml`.
- Bing: 서치콘솔에서 가져오기로 두 사이트 등록.
- 구글 서치콘솔에는 `sitemap_index.xml` 제출됨(2026-11-01 다시 제출). 네이버 서치어드바이저는 주간 점검 작업(`cheongyak-weekly-seo-check`)이 함께 본다.

## 애널리틱스
- 티스토리: GA4 속성 「우리의 청약달력」(측정 ID G-LF6X4XN25G, 스킨 `<head>` gtag), 네이버 애널리틱스(사이트 ID 1cbcc0d3032a6d0, 스킨 끝 wcslog.js).
- 우리의 집: Site Kit(관리자 로그인 방문은 제외 설정).
- **두 GA4 속성에 내부 트래픽 제외 필터(2026-11-13)** — 운영자 PC와 자동화 세션 방문은 쌓이지 않는다. 11-13 전후 숫자를 그대로 비교하지 않고 참여 세션(engagedSessions)과 Search Console 수치로 판단한다.
- 자동화·점검 브라우저는 통계·광고 요청을 막는다(티스토리 `TRACKERS`, 우리의 집 `zip/shot.mjs`).
- GA 이벤트: `todo_download`(내 청약 할 일), `calc_result`·`calc_to_guide_click`(계산기).

## 애드센스
- 2026-11-11 현황: 두 사이트 「준비 중」(검토 요청됨), 정책 위반 없음. 승인 상태 확인과 관리 화면은 사용자.
- 우리의 집 `/ads.txt`는 WPCode 스니펫 1055가 응답한다. 개인정보처리방침에 「광고」 항목(우리의 집 `/privacy/` — `zip/pages.mjs` privacyPage와 같은 문구, 티스토리 `/pages/개인정보처리방침`).
- 지킬 것: 광고와 입력 칸을 맞붙이지 않는다(실수 클릭), 광고 시청을 조건으로 걸지 않는다, 점검 브라우저에서 광고를 띄우지 않는다.

## 검색 AI 답변 인용 대비 (2026-10-25)
가이드 「한 줄 팁!」·「자주 묻는 질문」 칸, 「블로그 소개」 페이지 + 푸터 링크. 글 페이지에 같은 빈 틀이 반복되지 않게 한다(`skin.md`).
