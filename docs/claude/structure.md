# 폴더·실행기·예약 작업 지도

어떤 파일이 무슨 일을 하는지 찾을 때 읽는다. 세부 경위는 `history.md`에서 파일명으로 검색.

## 달력 (티스토리 홈·달력 데이터)
- `crawler/fetch.mjs` — 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」 → `site/schedule.json`. `crawler/check.mjs`가 필드 매핑 자체 점검.
- `crawler/lh.mjs`(LH 임대), `sh.mjs`·`sh_attach.mjs`(SH 게시판·첨부 OCR), `youth.mjs`·`youth_house.mjs`(서울 청년안심주택), `merge.mjs`(LH·SH 중복 정리). 자세히는 `crawler.md`.
- `crawler/auleezip_links.json` — {공고번호: 우리의 집 글 주소}. `zip/push_links.bat`이 바뀌었을 때만 커밋·푸시, 이 파일 푸시면 daily.yml이 API 없이 재배포.
- `.github/workflows/daily.yml` — 매일 06:00 KST 수집 → GitHub Pages 배포. 키는 Secrets `DATA_GO_KR_KEY`. `main`에 푸시된 `rules/**`·`crawler/auleezip_links.json`도 재배포.
- `skin/` — 티스토리 스킨(스킨 편집기에 그대로 올림). 홈은 이번 주 요약(`renderHero`), 전체 달력은 `/category/청약일정`. `images/calendar.js`가 스킨 옵션 `schedule-url`에서 JSON을 읽는다. `images/todo.js`(내 청약 할 일), `calc.js`·`calc2.js`(계산기), `rules/*.json`(계산기 값).
- `preview/serve.mjs` — 티스토리 치환자를 흉내 내는 로컬 미리보기(`/` 홈, `/post` 글, `/category` 목록, `/draft/{이름}`). `--check`는 자동 점검. 실행기 `preview.bat`(`preview.bat check`). `preview/unslop/` — 화면 다듬기 미리보기·점검 스크립트(결과물 `out/`은 커밋 안 함).
- 디자인 원본: `docs/design_handoff/README.md`(v2, 레퍼런스 `design-reference-v2.dc.html`). 이 문서와 다르게 정한 점은 `README.md` 데이터 메모.

## 티스토리 글 (`posts/`, `tistory/`)
- `posts/weekly.mjs` — schedule.json → 주간 글 초안(`drafts/{월요일}_weekly.json` + 수집본 사본 `.data.json`). `--render`로 summary 고친 뒤 본문 다시 그림. `posts/check.mjs` — 본문 재현·요약 숫자·금지 표현·필수 문구 검수. 설계 `docs/weekly-post-design.md`, 절차 `.claude/skills/weekly-post/SKILL.md`, 실행기 `weekly_post.bat`(초안·미리보기만).
- `posts/auto.mjs` + `weekly_auto.bat` — 주간 글 매주 자동(초안 → 그림 → 검수 → 임시저장 → 대조 → 알림 창). `weekly_auto.bat check` = 저장 없는 시험. 실제 저장 직전 카톡 알림(2026-11-19). 기록 `data/logs/weekly_auto.log`.
- `posts/guide.mjs` — 청약가이드·대출·정책 글(`drafts/guide_*.json`, 근거 `docs/policy/*.md`). `related.json`(관련 글), `published.json`·`scheduled.json`(발행·예약 장부), `refresh_guides.mjs`·`refresh_run.mjs`(월간 갱신), `policy_watch.mjs`(정책 소식 후보), `about.mjs`(소개 페이지), `card.mjs`(썸네일), `images.mjs`·`map.mjs`(그림·지도), `seo_near.mjs`(11~20위 글 찾기).
- 분양분석(2026-11-10 중단, 코드는 남음): `analysis_post.mjs`, `analysis_auto.mjs`, `notice_post.mjs`, `notice_terms.mjs`, `money.mjs`, `kapt_fee.mjs`, `trades.mjs`, `nearby.mjs`, `schools.mjs`, `bus.mjs`, `routes.mjs`, `floorplan.mjs`, `retrofit_analysis.mjs`.
- `tistory/` — 저장 자동화(Playwright 1.63.0, `npm install`). `common.mjs`(전용 프로필 `data/tistory-session/` — 커밋 금지, 발행 가드 GUARD, 통계·광고 차단 TRACKERS, 자동 재로그인 `ensureLogin`), `login.mjs`(+`tistory_login.bat`, 로그인은 사람이), `draft.mjs`(저장·예약·대조), `notify.mjs`(저장 직전 카톡 알림), `schedule_guides.mjs`(대기열 예약, `--draft`는 임시저장만 — 11:30 무인 실행), `record_published.mjs`(+`tistory_pending.bat`, 임시저장한 글의 발행 확인·장부 기록), `guide_week.bat`(화·금 가이드), `page.mjs`(페이지), `apply_skin.mjs`·`apply_blog_images.mjs`·`set_rss.mjs`(스킨·블로그 설정), `probe*.mjs`(화면 읽기 전용 실측 → `tistory/probe-out/`), `selectors.json`(실측 근거 셀렉터), `*.check.mjs`(자체 점검). 자세히는 `tistory-automation.md`.

## 우리의 집 auleezip.com (`zip/`)
- `wp.mjs`(워드프레스 REST·수정 한도·멈춤 스위치), `publish.mjs`(매일 발행·페이지·캐시, `--check`), `post.mjs`(시세 비교 글 틀·공개 시점 `planOf`), `deals.mjs`(분양가 vs 실거래), `pages.mjs`(첫 화면·목록·비교 기준·개인정보), `site.mjs`+`site.css`(사이트 모양 — 원본은 이 저장소), `ui.mjs`(화면 조각), `stage.mjs`(제목 [종료] 표시), `new_notices.mjs`(새 공고·정정공고 알림), `index_watch.mjs`(색인 감시 장부), `revlog.mjs`(고친 기록), `views.mjs`(조감도), `thumb.mjs`(대표 이미지), `buzz.mjs`(관심도), `official.mjs`·`check_analysis.mjs`·`history.mjs`(시세 비교 분석 점검), `guard.mjs`(외부 API 한도), `shot.mjs`(화면 점검 브라우저).
- 심층 분석: `deep.mjs`(읽기·점검·미리보기·발행·검수·청약 결과), `deep_targets.mjs`(대상 고르기·분석기 폴더 만들기), `market.mjs`(시군구 시장 계산), `timeline.mjs`(일정·자금 그림).
- SH 임대 비교(2026-11-03 사이트에서 뺌, 코드는 남음): `sh_rent.mjs`, `sh_write.mjs`.
- 자세히는 `auleezip.md`, `auleezip-deep.md`.

## 도구
- `tools/keyword_volume.mjs`(+`.bat`) — 네이버 검색광고 API 월간 검색량. `tools/ocr_ko.py` + `tools/ocr_venv`(한국어 OCR, PyMuPDF도 여기 설치).
- `brand/make.mjs` — 로고에서 블로그 이미지·아이콘·파비콘.

## 자료 파일 (`data/` — 커밋하지 않음)
- 티스토리: `tistory_usage.json`(하루 저장 횟수), `guide_queue.txt`·`priority_queue.txt`·`guide_refresh.txt`·`analysis_retrofit.txt`(대기열), `drafted_fallback.txt`, `drafted_pending.json`(발행 기다리는 임시저장, 2026-11-23), `policy_candidates.md`, `seo_near.json`, `logs/`.
- 우리의 집: `deals.json`, `zip_registry.json`(공개 공고 장부), `zip_posts/`, `zip_deep/<키>.json`(심층 글 자료, `_v1/` 백업), `deep_folders.json`(분석기 폴더 → 공고번호), `notice_text/<번호>.json`(공고문 글자), `zip_views.json`+`zip_views/`(조감도), `zip_stage.json`, `zip_update_budget.json`, `zip_more.json`, `zip_results.json`, `zip_corrections.json`·`_seen.json`, `zip_new.json`, `zip_index_watch.json`, `zip_revlog.json`, `zip_wp_state.json`, `zip_address.json`(주소 덮어쓰기), `zip_peers.json`·`zip_neighbors.json`(비교 단지), `zip_analysis.json`·`zip_claims.json`, `market/<코드>.json`, `rates.json`, `api_limits.json`·`api_usage.json`, `geo_cache.json`, `rtms_cache/`, `kapt/`, `title_fix_20261113.json`.
- `drafts/`(글 초안), `refs/`, `site/`, `.env`도 커밋하지 않는다.

## 윈도우 작업 스케줄러
| 작업 | 시각 | 실행기 | 상태 |
|---|---|---|---|
| `cheongyak_analysis_auto` | 매일 07:00 | `analysis_auto.bat` | 켜짐 |
| `cheongyak_tistory_save` | 매일 11:30 | `tistory_save_auto.bat` | 켜짐(2026-11-19) |
| `cheongyak_weekly_auto` | 일요일 18:00(놓치면 켜질 때) | `weekly_auto.bat` | 켜짐(2026-11-13 다시 켬) |
| `cheongyak_guide_queue` | 00:30 | `guide_queue.bat` | 사용 안 함(2026-10-27) |

`analysis_auto.bat`가 하는 일(순서대로): 정책 소식 후보 → 우리의 집 일일 갱신(`buzz.mjs --max-age 6.5` → `post.mjs` → `publish.mjs --go` → `push_links.bat` → `deep.mjs --verify all` → `deep_targets.mjs --make`) → SH 첨부 OCR·`push_attach.bat` → `push_house.bat` → 맨 끝에 새 공고 알림창(`new_notices.mjs`). 티스토리 저장은 2026-11-19부터 `tistory_save_auto.bat`(11:30, 하루 1번: 월요일 주간 글 재시도 → 급한 글 → 화·금 가이드, 저장 직전 카톡 알림 `tistory/notify.mjs`). 2026-11-23부터 임시저장까지만(발행은 사람이), 월간 갱신은 자동 실행 안 함. 발행 뒤 기록은 `tistory_pending.bat`. 실행기는 실행 중일 때 고치면 오동작한다.

## Claude 예약 작업 (`C:\Users\leejuho\.claude\scheduled-tasks\`)
- `auleezip-deep-report-watch` — 13:00·19:00. 새 분석기 리포트 → 심층 분석 글, 청약 결과 갱신(`--results`), 발행 보류 확인, 최근 2일 공개 글 구글 색인 요청.
- `cheongyak-weekly-seo-check` — 월요일 10시. 서치콘솔·서치어드바이저 점검, 색인 감시 장부 기록, `seo_near.mjs` 목록 보고(글은 고치지 않음, `--release`는 사용자만).
- `cheongyak-monthly-guide-refresh` — 매달 2일 09:00. 가이드 근거 문서 출처 재확인·보고.
- `auleezip-rebuild-refresh` — 2026-10-29 한 번 쓰인 복구 작업.
- 그 밖(`auleezip-title-test-compare`, `auleezip-republished-index-recheck`, `auleezip-index-request-3danji`, `bing-ai-performance-check`)은 각 폴더 `SKILL.md` 참고.

## 바로가기
실행기 바로가기는 `D:\AI_산출물\`(전역 지침의 분류 폴더). `.bat`·폴더 경로를 바꾸면 바로가기와 작업 스케줄러가 깨진다.
