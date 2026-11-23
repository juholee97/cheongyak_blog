# cheongyak_blog — 청약달력(티스토리) + 우리의 집(워드프레스)

## 목표
- 청약홈(한국부동산원)·LH·SH·서울시 청년안심주택 공고를 매일 수집해 티스토리 `aulee.tistory.com`(「우리의 청약달력」) 홈·달력에 보여 준다. 티스토리는 홈·달력·계산기·정책·신청 방법 글을 맡는다(해요체).
- 단지 분석은 워드프레스 `auleezip.com`(「우리의 집」) 심층 분석 글이 맡는다(합쇼체).
- 네이버 맛집 블로그 하네스(`D:\dev\blogging_ai`)와는 완전히 분리된 프로젝트다.
- 폴더: `crawler/` 수집, `skin/`·`preview/` 스킨·미리보기, `posts/` 티스토리 글, `tistory/` 저장 자동화, `zip/` 우리의 집, `docs/policy/` 가이드 근거 문서.

## 절대 규칙
1. **사실은 공고 기준.** 일정·세대수·분양가는 API 값만. 없으면 비워 둔다(추정 금지). 글에는 출처와 갱신 시각을 표기한다.
2. **투자 권유 금지.** "사세요/오른다" 류 표현 금지, 면책 문구 유지("정확한 내용은 입주자모집공고 확인").
3. **티스토리 발행은 사람이.** 자동화는 임시저장까지만이고 즉시 발행은 가드(`tistory/common.mjs` GUARD)가 막는다. 예외는 채팅에서 승인받고 검수를 통과한 글의 **미래 시각 예약발행**(`tistory/draft.mjs --approved --schedule`)과, 이미 공개된 글을 **원래 공개 시각 그대로** 고치는 것(`--update-published`)뿐이다. **무인 실행(11:30 `tistory_save_auto.bat`)은 2026-11-23부터 임시저장까지만 한다**(`schedule_guides.mjs --draft`, 발행은 사용자가 티스토리에서 직접, 공개 글 월간 갱신 자동 실행도 없앰) — 두 예외는 사용자가 그 글을 따로 승인했을 때 손으로 돌리는 실행에만 남는다. 세부는 `docs/claude/tistory-automation.md`.
4. **키 비공개.** `DATA_GO_KR_KEY`는 GitHub Secrets·로컬 환경변수에만. 커밋 금지. 공개 저장소다 — `.env`·`data/`·`drafts/`·`refs/`는 커밋하지 않는다.
5. **스킨 수정 후엔 `preview.bat check`와 브라우저 미리보기(PC·휴대폰 폭) 확인.** 티스토리 치환자는 `tistory.github.io/document-tistory-skin` 문서에 있는 것만 쓰고, 새로 쓰면 `preview/serve.mjs`의 KNOWN에도 추가한다.

## 운영 원칙 (우리의 집, 2026-11-10 사용자)
1. **추가 정보 판정.** 「문장이 자연스러운가」뿐 아니라 「원문 공고 대비 이 페이지가 추가한 정보가 무엇인가」를 판정한다. 답이 없으면 발행을 유보한다. 시세 비교 글은 `checkPost`, 심층 분석 글은 `deep.mjs --lint`(새 글은 `added` 필수)가 막는다.
2. **정확성 장치.** 모든 글에 공식 원문 링크와 공고 기준일. 일정이 끝난 글은 `zip/stage.mjs`가 제목에 「[종료]」를 붙이고(접수 마감은 목록 상태 줄에), 일정이 달라지면 `zip/new_notices.mjs`가 알린다. 정정공고는 검토 후 갱신한다.
3. **단계적 발행과 서치 콘솔.** `zip/index_watch.mjs`에 「크롤링됨 - 현재 색인이 생성되지 않음」 글 수를 적는다(피드 제외). 비율이 오르면 `wp.mjs upsert`가 새 공개 글을 멈춘다. 늘리지 말고 품질을 고친 뒤 사용자 판단으로 `--release`.

## 늘 지킬 것
- **사용자 결정이 미뤄진 일은 멈춤이 기본.** 답이 없다고 진행하지 않는다.
- **멈춰 둔 것은 사용자 결정 없이 풀지 않는다**: `zip/wp.mjs`의 `APT_NEW_HOLD`(새 시세 비교 글 안 올림)·`APT_EDIT_HOLD`(공개된 시세 비교 글 본문 수정 멈춤)·`UPDATE_CAP`(공개 글 수정 하루 10편), `zip/stage.mjs`의 `UNSTAMP_FROM`, 티스토리 분양분석 중단(2026-11-10). 목록은 `docs/claude/open-items.md`.
- **티스토리 보안 확인(reCAPTCHA)이 뜨면 멈춘다.** 대신 풀거나 넘기지 않는다. 로그인·비밀번호는 사람이.
- 티스토리 저장은 하루 3번·30분 간격, 무인 실행(11:30 `tistory_save_auto.bat`, 저장 직전 카톡 알림)은 하루 1번이다.
- 실행기(`analysis_auto.bat`·`tistory_save_auto.bat`·`weekly_auto.bat`·`guide_queue.bat`)와 폴더 경로는 윈도우 작업 스케줄러·바로가기가 쓴다. 새 단계에 알림창·입력 대기가 있으면 맨 뒤에 두고, 실행 중인 실행기는 고치지 않는다. 실행기가 이 폴더에서 `git commit`·`git push`를 하고 배포는 `main` 푸시 기준이니, 이 폴더는 `main`으로 둔다.
- 새 외부 API는 `zip/guard.mjs` `useApi`를 거치고 `DEFAULTS`에 한도를 먼저 등록한다(유료 과금 방지).
- 우리의 집: 출처 매체(채널·영상 이름)를 밝히지 않는다. 사이트 CSS 원본은 `zip/site.css`(사이트 편집기에서 고치지 않음). 방화벽 설정은 건드리지 않고 글 안에 스크립트를 넣지 않는다. WPCode 스니펫 1055·1621은 끄거나 지우지 않는다. 화면 점검은 `zip/shot.mjs`로(맨 playwright는 방문·광고 노출로 잡힌다).
- 디자인 변경은 미리보기·영상으로 먼저 승인받고 적용한다.
- 세션 분담: 티스토리 세션 = `posts/`·`tistory/`·`skin/`·`crawler/`·`.bat`, 워드프레스 세션 = `zip/`. 커밋은 자기 범위 파일만 경로를 지정해서 한다.

## 작업별로 먼저 읽을 파일 (`docs/claude/`)
| 할 일 | 읽을 파일 |
|---|---|
| 파일·실행기·예약 작업이 어디 있는지 | `structure.md` |
| 티스토리 저장·예약·대기열·11:30 저장 실행기 | `tistory-automation.md` |
| 주간 일정 글 | `.claude/skills/weekly-post/SKILL.md`, `docs/weekly-post-design.md` |
| 가이드·대출·정책·계산기 글 | `tistory-posts.md`(근거 `docs/policy/*.md`) |
| 스킨·홈·달력 화면·내 청약 할 일 | `skin.md`, `docs/design_handoff/README.md` |
| 공고 수집(청약홈·LH·SH·청년안심주택) | `crawler.md` |
| 우리의 집 발행·수정·설정·조감도·API 한도 | `auleezip.md` |
| 심층 분석 글(예약 작업 `auleezip-deep-report-watch` 포함) | `auleezip-deep.md`, `auleezip.md`, `docs/deep-writing-guide.md` |
| 색인·서치콘솔·애널리틱스·애드센스·검색량 | `seo-analytics.md` |
| 미뤄 둔 결정·날짜가 잡힌 할 일 | `open-items.md` |
| 예전에 왜 그렇게 정했는지 | `history.md`(약 175KB — 통째로 읽지 말고 날짜·파일명으로 검색) |

## 기록하는 법
- 변경 이력은 `docs/claude/history.md` 표 맨 위에 한 줄(날짜 | 변경 | 사유)로 적는다. **이 파일에는 이력을 적지 않는다.** 예약 작업 지침에 「CLAUDE.md 변경 이력」이라고 적혀 있어도 `history.md`에 적고 그 파일을 함께 커밋한다.
- 지금도 지켜야 하는 규칙이 바뀌면 해당 주제 파일을 고친다. 이 파일에는 매 세션 필요한 규칙만 두고 10KB 이하로 유지한다.
