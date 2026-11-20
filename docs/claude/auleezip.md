# 우리의 집 auleezip.com 운영 (`zip/`)

워드프레스 사이트의 발행·수정·화면·설정을 다룰 때 읽는다. 심층 분석 글 쓰기는 `auleezip-deep.md`, 색인·통계는 `seo-analytics.md`. 괄호 안 날짜로 `history.md` 검색.

## 사이트
- 카페24 뉴매니지드 워드프레스, 도메인 Cloudflare Registrar(DNS만, 프록시 끔 — **프록시를 켜면 안 된다**: 카페24 서버가 Cloudflare 해외 지점 주소로 온 요청에 봇 확인 쿠키(cupid.js)를 걸고 403을 낸다. 2026-11-17 03:46~11-20 16:41 켜져 있었고 11-19 아침부터 403, 11-20 다시 끔). 이름 「우리의 집」(로고 루비 aulee·zip). 말투는 **합쇼체**(…합니다, 2026-10-29) — `check_analysis.mjs`·`deep.mjs --lint`가 해요체를 잡는다. 제목의 「…일까?」는 그대로.
- 연결: `zip/wp.mjs`(REST + 애플리케이션 비밀번호, https만). 로그인 비밀번호는 입력하지 않는다. 사이트 제목(blogname)은 REST로 안 바뀐다(관리자 화면 설정→일반, Rank Math 로컬 SEO 웹사이트 이름).
- **사이트 CSS 원본은 `zip/site.css`** — 사이트 편집기에서 고치지 않는다. `node zip/site.mjs --go`로 올려야 반영(`--purge` 캐시 비우기).
- **방화벽(NinjaFirewall)이 글 안 `<script>`와 이벤트 속성을 403으로 막는다 → 스크립트 없이 라디오·체크박스 + CSS `:has()`·counter로 만든다. 방화벽 설정은 건드리지 않는다**(2026-10-30). HeadlessChrome UA도 403.
- 글 본문이 122KB쯤 되면 워드프레스가 502(116KB 통과). `publish.mjs`가 첫 화면 크기를 찍는다.
- 플러그인: Rank Math(사이트맵 `sitemap_index.xml`, Instant Indexing), Site Kit, WPCode, NinjaFirewall, Really Simple Security, Two Factor, WP Super Cache. 업데이트는 사용자 승인 뒤 하나씩 점검하며(2026-11-10). 복구 수단은 카페24 일일 백업(05시, 7일치). FTP·SSH는 못 쓴다.
- **WPCode 스니펫 1055 「ads.txt (AdSense)」·1621 「robots.txt Daum 웹마스터도구 인증 줄」은 끄거나 지우지 않는다 — 인증과 ads.txt가 풀린다**(2026-11-13). 게시자 ID를 바꾸면 1055를 고친다. 스니펫 600은 Rank Math 사이트맵 캐시 끄기(2026-11-01 — 캐시가 켜져 있을 때 새 글이 사이트맵에서 빠졌다).
- 화면 점검은 **`zip/shot.mjs`**(또는 `blockAnalytics(page)`)로 — 애널리틱스·광고 요청을 막고 보통 크롬 UA로 연다. 맨 playwright로 열면 방문·광고 노출로 잡힌다(2026-11-01·11-11).
- curl 기본 UA는 방화벽에 막힌다. 확인은 브라우저 UA를 붙인 curl이나 node fetch로.

## 무엇을 올리나
- 노출 유형: 아파트·오피스텔·도시형(빌라)만(2026-11-03). 임대는 수도권 청년안심주택·LH 행복주택만 심층 분석 대상(2026-11-05).
- **심층 분석 글**(`deep-<키>`)이 메인 콘텐츠. 첫 화면 = 고르는 칸(지역·구분·「접수 끝난 공고도 보기」) + 심층 분석 격자만(2026-11-10). 머리 메뉴 「심층 분석」(첫 화면)·「분양 시세」·「비교 기준」.
- **시세 비교 글**(`apt-<번호>`): 새 공고부터 따로 올리지 않는다(`APT_NEW_HOLD`, 2026-11-15). 계산·자료(`deals.mjs`·`post.mjs` → `data/zip_posts`)는 그대로 돌아 심층 분석 가격 절이 쓴다. 이미 공개된 글은 그대로 두되 본문 수정은 멈춤(`APT_EDIT_HOLD`, 2026-11-13).
- 공개된 시세 비교 글은 `zip/noindex.mjs --go`로 검색 제외(Rank Math robots noindex, 글·주소 그대로, 2026-11-16). 되돌리기 `--undo`, 확인 `--verify`.
- SH 임대 글은 2026-11-03에 사이트에서 뺌(2편 비공개 — 삭제 아님). `sh_rent.mjs`·`sh_write.mjs` 설명은 `history.md` 2026-10-28.
- 티스토리 글로 가는 링크는 넣지 않는다(2026-11-10). 계산기 링크는 새로 올리는 글부터만(2026-11-15).
- 「광고나 협찬을 받은 글은 글 첫머리에 따로 밝힌다」(비교 기준·소개, 2026-10-29).

## 공개 시점 (`zip/post.mjs` `planOf`, 2026-10-30)
- 심층 분석 글만 첫 접수일(특별공급·1순위 중 이른 날) 7일 전 06:00 예약. 그 시각이 지났으면 바로. 이미 공개된 글은 고쳐도 공개 그대로. 06:00인 이유는 07:00 매일 실행이 그날 첫 화면에 연결하기 때문.
- 청약홈 일정의 첫 접수가 사전청약 당첨자 몫이면 글 자료 `receipt`에 실제 첫 접수일을 적는다. 임대 글은 `receipt` 필수.
- 예약 글은 `data/zip_deep/<키>.json`에 status future + at. 예약 글을 바로 공개할 땐 `wp.mjs upsert`가 날짜를 지금으로 바꿔 보낸다.

## 매일 실행 (`analysis_auto.bat` 07:00)
`buzz.mjs --max-age 6.5`(관심도, 공고마다 주 1회) → `post.mjs` → `publish.mjs --go`(단계 표시·글·페이지·캐시·청약 결과·`auleezip_links.json`) → `push_links.bat` → `deep.mjs --verify all` → `deep_targets.mjs --make`. 기록 `data/logs/zip_daily.log`. 점검 `node zip/publish.mjs --check`, `node zip/post.mjs --check`.

## 수정 한도와 멈춤 스위치 (`zip/wp.mjs`)
일괄 수정 뒤 글이 색인에서 빠진 일(2026-11-09~11) 때문에 생긴 장치다. **사용자 결정 없이 풀지 않는다.**
- `UPDATE_CAP` = 공개 글 수정 하루 10편(`data/zip_update_budget.json`, 넘치면 다음 날). 제목 단계 표시([종료])와 청약 결과(`deep.mjs --publish --urgent`)는 한도 밖.
- `deep.mjs` `RESULT_REPUBLISH_HOLD = true`(2026-11-17) — 청약 결과로 공개 글을 다시 저장하지 않음(결과는 「청약 결과 모음」 페이지로, `RESULTS_PAGE_LIVE = true` — 2026-11-17 승인·공개, 위·바닥 메뉴 「청약 결과」). 자세히는 `auleezip-deep.md` 「청약 결과 추적」.
- `APT_EDIT_HOLD = true` — 공개된 `apt-` 글 본문 수정 멈춤(`deferred`). 풀면 밀린 글이 하루 10편씩 나간다.
- `APT_NEW_HOLD = true` — 새 `apt-` 글을 만들거나 공개하지 않음(상태 `stopped`). 풀려면 `false`와 `--check` 줄.
- `zip/stage.mjs` `UNSTAMP_FROM = 9999-12-31` — 옛 「[신청마감]」 떼기 미룸(`unstampHeld`). 색인 회복 확인 뒤 사용자가 날짜를 넣는다. 그날 `publish.mjs --check`의 `unstampHeld` 줄도 고친다.
- 색인 감시 `zip/index_watch.mjs` — 「크롤링됨 - 현재 색인이 생성되지 않음」 비율이 오르면 `wp.mjs upsert`가 새 공개 글을 멈춘다(`held`). `--release`는 사용자만.
- 바뀐 게 없는 글·페이지는 다시 보내지 않는다(`data/zip_wp_state.json`, `ZIP_FORCE=1`로 강제). 시세 비교 글 「함께 보면 좋은 글」은 처음 고른 2편으로 고정(`data/zip_more.json`). 청약 결과는 보이는 표가 바뀐 글만 반영 대기에 적는다(`resultsChanged`, 지금은 다시 올리지 않음).

## 제목 단계 표시 (`zip/stage.mjs`, 장부 `data/zip_stage.json`)
- 자료에 있는 일정이 모두 끝나면 제목 앞 「[종료]」(무순위는 당첨자 발표 다음 날). 주소는 그대로. [종료] 글은 매일 다시 올리기·`--verify all`에서 빠지고 되돌리지 않는다. 고쳐야 하면 `node zip/stage.mjs --reopen <slug>`. 틀을 바꿀 때 [종료] 글도 올리려면 `publish.mjs --go --include-ended`.
- 「[신청마감]」은 2026-11-13부터 제목에 붙이지 않는다(closed는 판정·장부에만). 접수 마감·D-day는 목록 상태 줄에(`pages.mjs` `recLabel`: 「접수 중 · 11.11 마감 · D-2」, 「3일 뒤 접수 시작 · D-5」, 「오늘 접수 마감 · D-Day」).

## 새 공고·정정공고 (`zip/new_notices.mjs`)
- 글 없는 열린 공고를 찾아 알림창 + `data/zip_new.json`. 실행기 맨 끝에서 돈다.
- 정정공고는 **검토 후 갱신**(2026-11-09): 글에 쓴 일정(`zip_registry.json`)과 최신 수집본이 다르면 `data/zip_corrections.json`에 적고 처음 보는 변경만 알린다. 글·제목은 자동으로 안 바꾼다. 날짜 변경만 잡는다(분양가만 고친 정정, LH·청년안심 글은 못 잡음). 검토 끝난 것은 `zip_corrections_seen.json`.
- `deals.mjs --only <번호>`를 돌리면 수집본 일정으로 되돌아간다 — 손으로 고친 일정(예: 2026000373)은 그 뒤 다시 확인.

## 시세 비교 계산과 글 틀
- `deals.mjs`: 주력 주택형 분양가 vs 비교 단지 전용 3.3㎡당 실거래 중앙값 → `data/deals.json`. 비교 단지는 반경이 아니라 생활권·급지·브랜드로 직접 고른다(`data/zip_peers.json`, 옆 시군구 `zip_neighbors.json`). 토지임대부는 시세 비교를 참고로만.
- 공고 주소에 동·지번이 없으면 `data/zip_address.json`(approx면 비교 단지 거리 비움). 검단구는 2026 신설 — 「인천광역시 검단구 불로동」으로 적어야 법정동 코드가 잡힌다.
- 문구(2026-10-28): 「약」 금액은 백만원 반올림, 「한 채」 표현 금지, 단지 이름은 `shortName`(토지임대부는 이름에서 뺌). 눈금 구간 ±5·20%(`ui.mjs`).
- 「분양가가 낮은 단지일수록…」 문장은 결론이 시세보다 낮을 때만. 관심도 상자는 기사 중복 제거·1년 지난 기사 뺌(2026-11-12).
- 고친 기록 `revlog.mjs`: 처음 올린 날과 숫자가 바뀐 날만 적는다.

## 조감도 (`zip/views.mjs`)
- 공식 출처만(청약홈 HMPG_ADRES 홈페이지, 시공사 사이트, LH 청약플러스 「단지조감도」 첨부, 공고문에 적힌 사업 홈페이지) — 사칭 분양 사이트 방지. 홍보 일러스트·공고문 PDF 글자 쪽은 쓰지 않는다.
- `node zip/views.mjs --only 번호`로 받고 **그림을 눈으로 확인**. 못 찾으면 `--add 번호 그림 페이지 [초점] --label 투시도 --site '…' --zoom 1.4`(youth-* 키도 됨). 눈높이 투시도는 `--zoom`으로 하늘을 잘라 건물을 위로.
- 새 심층 분석 글을 올릴 때 그 공고가 `zip_views.json`에 `tried`뿐이면 같은 방식으로 채운다. 새 분양 공고는 장부에 없어 `--only`가 못 찾는다 → `--add`로 손 등록(2026-11-15).
- 입지 지도 카드는 2026-11-09 폐기(사용자). 공식 그림 없는 글은 그림 없는 어두운 카드.
- 목록 맨 위 그림 하나만 `loading="eager" fetchpriority="high"`(2026-11-13).

## 외부 API 한도 (`zip/guard.mjs`, 2026-10-28)
- **새 외부 API를 쓰는 코드는 반드시 `useApi(api, 단위)`를 거치고 `DEFAULTS`에 한도를 먼저 등록한다.** 넘으면 `API_BUDGET:` 오류로 멈춘다. 사용량 `data/api_usage.json`, 한도 변경 `data/api_limits.json`, 확인 `node zip/guard.mjs`.
- 등록된 것: naver_trend, naver_search, youtube(하루 3,000단위), vworld(하루 2만), datago(하루 8,000), sh(하루 400), ecos, gsc(하루 100), searchad(하루 50·월 500).
- 위치 결과 `data/geo_cache.json`, 실거래 월 자료 `data/rtms_cache/`. 후보 단지 거리는 구하지 않고 최종 비교 단지에만.

## 세션 분담 (2026-11-10)
티스토리 세션: `posts/`·`tistory/`·`skin/`·`crawler/`·`.bat`. 워드프레스 세션: `zip/`. 서로 남의 범위 파일은 커밋하지 않는다.
