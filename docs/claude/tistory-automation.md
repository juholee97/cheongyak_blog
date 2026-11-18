# 티스토리 저장·예약 자동화 (`tistory/`)

티스토리에 글을 저장·예약·고치거나, 11:30 저장 실행기·대기열을 손볼 때 읽는다. 괄호 안 날짜로 `history.md`를 검색하면 경위가 나온다.

## 발행 규칙 (CLAUDE.md 절대 규칙 3의 세부)
- 자동화는 임시저장까지. 가드(`tistory/common.mjs` GUARD)가 즉시 발행 버튼을 막는다. 자체 점검 `node tistory/guard.check.mjs`(`analysis_auto.bat check`).
- 예외 1 — 예약발행(2026-10-23): 채팅 승인 + 검수 통과한 글을 `tistory/draft.mjs --approved --schedule "YYYY-MM-DD HH:MM"`. 가드는 발행일이 「예약」이고 10분 넘게 뒤일 때만 마지막 버튼을 통과시킨다.
- 예외 2 — 공개 글 고치기(2026-10-23, 「이런 케이스는 항상 예외 허용」): 썸네일·대표이미지처럼 고쳐야 할 때 `draft.mjs --approved --update-published --schedule "원래 공개 시각"`. 가드는 발행일이 원래의 지난 시각 그대로일 때만 통과(공개 시각·상태는 안 바뀜). 예약 글은 `--update-scheduled`.
- 예외 3 — 페이지 비공개 저장(`page.mjs`, privateSave, 2026-10-25): 소개 페이지 등은 비공개 저장만, 공개는 사람이.
- 예외 4 — 사용자가 공개로 바꾼 페이지 고치기 `page.mjs --update <번호>`(pageUpdate, 그 페이지 편집 주소에서만).
- 주간 글은 검수 통과 시 채팅 승인 없이 임시저장(2026-10-22), 발행은 사람이.
- 가이드·대출·정책 글은 채팅 승인 뒤 대기열에 넣어 `tistory/schedule_guides.mjs`가 예약한다.
- 티스토리 분양분석 자동 예약(`posts/analysis_auto.mjs`, 접수 7일 전 10:00)은 **2026-11-10 중단** — `--force` 없이는 바로 끝난다.

## 저장 한도와 쉬는 장치 (`tistory/draft.mjs`)
- 하루 저장 3번(`DAY_MAX`, 모든 스크립트 합쳐 — 예약·임시저장·고치기). 넘으면 브라우저를 띄우기 전에 코드 5(2026-10-30). 기록 `data/tistory_usage.json`.
- 무인 실행은 하루 1번(`tistory_save_auto.bat`의 `TISTORY_DAY_MAX=1`, 2026-11-13 — 11-19까지는 07:00 `analysis_auto.bat`). 올리지는 못하고 낮추기만. 그날 사람이 먼저 저장했으면 11:30 실행은 모두 코드 5로 끝난다. 사람이 직접 돌리는 실행과 일요일 `weekly_auto.bat`은 3번. 저장 단추 직전에 세므로 실패한 시도도 1번을 쓴다.
- 저장 사이 30분(`GAP_MIN`). 기다리는 사이 예약 시각이 15분 안으로 들어오면 코드 4.
- `REST_UNTIL`(지금은 지난 날짜)에 날짜를 넣으면 그 전까지 모든 저장이 코드 5(2026-10-31 「5일 정지」에 씀).
- 티스토리 자체 한도: 하루 새 글 5개(2026-10-27 확인창). 임시저장은 이 한도에 안 걸린다.
- 종료 코드: 3 로그인에 사람이 필요, 4 검수 실패·예약 시각 임박, 5 저장 한도·쉬는 기간, 6 보안 확인.

## 보안 확인·로그인
- **보안 확인(reCAPTCHA, `/manage/dkaptcha`)이 뜨면 멈춘다. 대신 풀거나 넘기지 않는다**(2026-10-24). 대기열·자동 실행은 알림 창.
- 티스토리는 화면 없는 브라우저에 보안 확인을 띄운다 → 실행기마다 `TISTORY_HEADED=1`. 스킨 적용도 헤드리스는 로그인 확인 실패. 다른 프로필이 필요하면 `TISTORY_PROFILE=data\tistory-profile-2`.
- 화면에 띄운 창은 다른 창 뒤에 열린다 → 보안 확인이 뜬 것 같으면 `raiseWindow()`(`common.mjs` → `tistory/raise_window.ps1`)가 그 창을 맨 위로 올리고 알림음을 한 번 낸다(2026-11-15, 점검 `node tistory/raise.check.mjs`). 사람이 5분 안에 못 풀면 그날 저장 1번을 쓰고, 이어지는 임시저장이 1번을 더 쓰려 한다.
- PowerShell은 읽히는 `.ps1` 파일을 `-File`로만 실행한다. 인코딩한 명령(`-EncodedCommand`)·숨긴 창은 Defender가 트로이목마로 잡는다(2026-11-15).
- 세션 쿠키는 몇 시간이면 끊긴다 → `ensureLogin`이 카카오 간편로그인의 저장된 계정 1개만 누른다(아무것도 입력하지 않음, 비밀번호·동의 화면이면 멈춤, 시험 `relogin.check.mjs`). 그 밖엔 사용자에게 `tistory_login.bat`.
- 자동화 브라우저는 방문 통계·광고 요청을 막는다(`TRACKERS`: tiara·wcslog·gtag·애드센스) — 점검 방문이 조회수·무효 트래픽에 섞이지 않게(2026-11-01).

## 11:30 저장 실행기 (`tistory_save_auto.bat`, 하루 1번을 누가 쓰나)
- 작업 스케줄러 `cheongyak_tistory_save` 매일 11:30(2026-11-19 사용자 결정). 07:00 `analysis_auto.bat`에 있던 저장 단계를 옮겼다 — 11-10부터 07:00 저장이 6번 연속 보안 확인에 막혔다(PC 앞에 사람이 없음). `tistory_save_auto.bat check` = 발행 가드 점검 + 알림 점검(저장·전송 없음).
- 카톡 알림(`tistory/notify.mjs`, `TISTORY_NOTIFY=kakao`): `draft.mjs`가 한도·간격·검수·승인을 다 지나 실제 저장하러 브라우저를 띄우기 직전에 `claude -p --model haiku --allowedTools mcp__claude_ai_PlayMCP`(프롬프트는 stdin, 작업 폴더는 임시 폴더)로 카카오톡 「나와의 채팅방」에 한 통. 시험·대조 전용·코드 5 실행에선 안 보낸다. 도구 없음·실패·90초 초과·호출 한도(`zip/guard.mjs` `kakao_notify` 하루 5·달 100)는 기록 한 줄(「카톡 알림: …」, 각 단계 기록 파일과 `.save.json` `kakao`)만 남기고 저장을 계속한다. 점검 `node tistory/notify.check.mjs`(가짜 실행기), `node tistory/notify.mjs --check`(보내지 않음), `--test`(시험 한 통 — PlayMCP 도구함에 「카카오톡 나와의 채팅방」을 담은 뒤).

1. 월요일만: 주간 글 재시도 `posts/auto.mjs --catch-up`(일요일 저장이 실패했을 때). 실행기는 이 단계의 오류 출력을 `data\logs\weekly_auto_err.log`로 넘긴다 — `weekly_auto.log`로 넘기면 파일이 잠겨 `auto.mjs`가 기록을 못 쓴다(2026-11-19 고침)
2. 급한 글 `data/priority_queue.txt` — `schedule_guides.mjs --soon --times 09:30,15:30 --max 1`(1시간 뒤부터 빈 자리 — 11:30 실행이면 그날 15:30 자리, 차 있으면 다음 날 09:30)
3. 화·금요일만: 가이드 1편 `tistory/guide_week.bat` — `data/guide_queue.txt`에서 다음 빈 12:00(대기열은 내일부터라 11:30 실행도 그날 12:00은 안 고름, 2026-11-10 주 2편, 대기열이 비면 안 올림. `guide_week.bat check`는 오늘 판정만)
4. 공개 글 월간 갱신 `posts/refresh_run.mjs`(`data/guide_refresh.txt`, 원래 공개 시각 그대로)

- 대기열 항목 `slug@YYYY-MM-DD`는 그날(한국 시각) 전엔 건너뛰고 남긴다. 점검 `tistory/queue.check.mjs`.
- 코드 5면 `--soon` 글도 임시저장하지 않고 남긴다. 그 밖의 예약 실패는 임시저장해 두고 `data/drafted_fallback.txt`에 적는다(예약되면 임시저장본은 사람이 지움, 2026-10-27).
- **실행기에 새 단계를 넣을 때 알림창·입력 대기가 있으면 맨 뒤에 둔다**(2026-11-14 — 07:00 `analysis_auto.bat`에 뜬 알림창이 뒤 단계를 전부 막았다). 알림은 기다리지 않는 방식으로.
- `analysis_auto.bat`·`tistory_save_auto.bat`은 실행 중인 창이 있을 때 고치면 오동작한다. 그때는 창을 끝내고 고치거나, 앞부분 바이트 길이를 바꾸지 않는다(2026-11-10).
- 작업 창 제목(`title cheongyak`·`process.title`)을 지우지 않는다 — 없으면 `Assertion failed: process_title`로 꺼진다(2026-10-24).

## 예약 시각
- 기준 시각: 급한 글 09:30·15:30, 화·금 가이드 12:00, 기본 08:00·12:00·19:00.
- 실제 예약은 기준 시각에서 3~17분 뒤, 분이 5의 배수가 아닌 시각(`common.mjs` `nudged`, 날짜·기준 시각으로 정해져 다시 돌려도 같음, 2026-11-13). `slotTaken`은 기준 시각~17분 뒤 사이 예약이 있으면 찬 자리.
- 공개 글 고치기(원래 시각)·주간 글(임시저장)·`.bat`의 `--times`·작업 스케줄러 시각(07:00·11:30)은 정각 그대로.
- 관련 글 링크는 예약 시각이 더 이른 글만 걸린다. 서로 걸려면 먼저 나갈 글을 먼저 예약하고, 반대 방향은 나중 글 공개 뒤 다시 저장한다.

## 편집기에서 실측한 것
- 편집기는 입력 도중 자동 임시저장을 한다 → 저장 확인은 개수가 아니라 저장본 재대조(`--verify-only`, 예약 글 `--verify-scheduled`).
- `<b>`의 style은 지워진다 → 꾸밀 글자는 `<span style>`. div·h3·td·span 인라인 style, `details`·`summary`, h2 id·#링크는 남는다.
- `setContent`만으로는 변경을 모른다 → 변경 이벤트·편집기 입력 뒤 본문 길이 확인(2026-10-25).
- 대표이미지는 처음 정한 것이 남는다 → 고칠 때 발행 레이어에서 대표이미지를 먼저 지우고 본문 그림을 올린 뒤 8초 기다리고, 카테고리 목록 썸네일을 확인한다(2026-10-23). 빈 썸네일은 한 번 더 저장하면 채워진다.
- 이미 공개된 글의 대조는 편집 화면 대신 공개 페이지(`.tt_article_useless_p_margin`에서 광고·공유·같은 카테고리 칸 제외)로 한다. 예약 글은 공개 전 403.
- 새 글 화면을 떠날 때 확인창은 스크립트가 직접 옮길 때만 수락, 「저장중」은 최대 90초.
- 글 16편 일괄 비공개 = 관리 화면 `PUT /manage/posts/visibility.json ids=…&visibility=PRIVATE`(저장 1회로 셈). 메뉴는 `/manage/design/menu.json`.
- 셀렉터는 실측 근거로만 `tistory/selectors.json`에. 바뀌면 `node tistory/probe.mjs --menus`. 처음이거나 바꾼 뒤엔 `draft.mjs --dry-run`(편집기 HTML은 `TISTORY_DUMP=파일`).

## 스킨 적용
- `tistory/apply_skin.mjs`(Monaco html 편집, 적용 전 `data/skin-backup/` 백업, 적용 후 저장본 대조). 파일만 올리면 `_version_`이 안 바뀌어 캐시가 남으니 `skin.html` 주석 줄도 고쳐 함께 적용(`--apply --file images/calendar.js`).
- 스킨 규칙·화면 구성은 `skin.md`.
