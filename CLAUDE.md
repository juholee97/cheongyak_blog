# cheongyak_blog — 청약달력 티스토리 블로그

## 목표
청약홈(한국부동산원) 분양정보를 매일 수집해 티스토리 블로그 홈에 청약 일정 캘린더로 보여준다. 이후 단계에서 정부 지원 대출·부동산 개정사항 정리 글을 더한다. 네이버 맛집 블로그 하네스(`D:\dev\blogging_ai`)와는 완전히 분리된 프로젝트다.

## 구조
- `crawler/fetch.mjs` — 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」 → `site/schedule.json`. `crawler/check.mjs`가 필드 매핑 자체 점검.
- `.github/workflows/daily.yml` — 매일 06:00 KST 수집 → GitHub Pages 배포. 키는 Secrets `DATA_GO_KR_KEY`.
- `skin/` — 티스토리 스킨(스킨 편집기에 그대로 업로드). `images/calendar.js`가 스킨 옵션 `schedule-url`에서 JSON을 읽는다.
- `preview/serve.mjs` — 티스토리 치환자를 흉내 내는 로컬 미리보기(`/` 홈, `/post` 글, `/category` 목록). `--check`는 자동 점검.
- `posts/weekly.mjs` — schedule.json → 주간 글 초안(`drafts/{월요일}_weekly.json` + 수집본 사본 `.data.json`). `--render`로 summary 고친 뒤 본문 다시 그림. `posts/check.mjs` — 본문 재현·요약 숫자·금지 표현·필수 문구 검수. 미리보기 `/draft/{이름}`. 설계: `docs/weekly-post-design.md`.
- `tistory/` — 임시저장 자동화(Playwright 1.63.0, `npm install`). `common.mjs` 전용 프로필 `data/tistory-session/`(커밋 금지), `login.mjs`(+`tistory_login.bat`, 로그인은 사람이), `ensureLogin` 자동 재로그인(티스토리 세션 쿠키가 몇 시간이면 끊김 → 카카오 간편로그인의 저장된 계정 1개만 누름, 아무것도 입력하지 않음, 비밀번호·동의 화면이면 멈춤; 시험 `relogin.check.mjs`), `probe.mjs` 글쓰기 화면 읽기 전용 실측 → `tistory/probe-out/`. 셀렉터는 실측 근거로만(`tistory/selectors.json`). `draft.mjs --approved` 임시저장 + 저장본 재대조, `--verify-only` 대조만. 절차: `.claude/skills/weekly-post/SKILL.md`, 실행기 `weekly_post.bat`(초안·미리보기만).
- `preview.bat` — 미리보기 실행기(`preview.bat check` = 자동 점검). 바로가기는 `D:\AI_산출물`.
- 디자인 원본: `docs/design_handoff/README.md` (v2, 레퍼런스 `design-reference-v2.dc.html`). 이 문서와 다르게 정한 점은 `README.md` 데이터 메모.

## 절대 규칙
1. **사실은 공고 기준.** 일정·세대수·분양가는 API 값만. 없으면 비워 둔다(추정 금지). 글에는 출처와 갱신 시각을 표기한다.
2. **투자 권유 금지.** "사세요/오른다" 류 표현 금지, 면책 문구 유지("정확한 내용은 입주자모집공고 확인").
3. **발행은 사람이.** 자동화는 임시저장까지만.
4. **키 비공개.** `DATA_GO_KR_KEY`는 GitHub Secrets·로컬 환경변수에만. 커밋 금지.
5. **스킨 수정 후엔 `preview.bat check`와 브라우저 미리보기(PC·휴대폰 폭) 확인.** 티스토리 치환자는 `tistory.github.io/document-tistory-skin` 문서에 있는 것만 쓰고, 새로 쓰면 `preview/serve.mjs`의 KNOWN에도 추가한다.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-10-22 | 주간 글 그림(썸네일·단지 카드·브이월드 위치 지도 반경 1km) + 티스토리 업로드, 계약 기간 표기 수정, 자동 재로그인 | 사용자 요청. 해링턴 스퀘어 과천 계약 2026~2029가 매주 끼던 문제 |
| 2026-10-22 | 3단계 3·4: 로그인 실행기(쿠키 따로 저장), 글쓰기 화면 실측, draft.mjs, 첫 임시저장(10월 26일 주 — 편집기 자동 임시저장으로 저장됨, 재대조 통과), weekly_post.bat, 초안 덮어쓰기 방지 | 티스토리 편집기 자동 임시저장 → 저장 확인은 저장본 재대조로 |
| 2026-10-22 | 3단계 1·2: 수집기 단계 종료일(end)·모집공고일(noticeDate), 주간 초안 생성·검수·미리보기 | 주간 청약 일정 글 자동 초안 |
| 2026-10-22 | 블로그 aulee.tistory.com 개설·스킨 적용(로고 "우"), 메뉴 밑줄을 현재 페이지 기준으로, 방명록 제목 중복 제거, 메뉴 "당첨후기" → "대출·정책" | 운영자가 당첨 당사자가 아니라 후기를 쓸 근거가 없음(사실 규칙) · 처음 범위(정부 지원 대출·개정사항)와 맞춤 |
| 2026-10-21 | 1단계: 폴더·수집기·Actions·스킨·미리보기 | 플랫폼 검토 후 티스토리 본진 결정 |
| 2026-10-22 | 디자인 v2(남색 공공포털 톤·표형 지역 필터·서울 자치구 25개 필터·2열 표 모달) 적용, 서울 district는 25개 구 중 하나 아니면 null | 사용자 v2 핸드오프 |
| 2026-10-22 | 저장소 공개 전환·Pages(Actions) 설정, 첫 수집 APT 79건. 분양전환 임대 분양가 비움, 0건 진단 로그, 임의공급·공공지원 민간임대 추가(공고일 YYYYMMDD 조건) | 무순위·오피스텔 API가 전체 0건(포털에서 직접 호출로 확인) |
