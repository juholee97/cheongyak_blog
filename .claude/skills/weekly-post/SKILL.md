---
name: weekly-post
description: "이번 주 청약 일정" 주간 글을 schedule.json으로 만들어 검수·승인 후 티스토리에 임시저장. '주간 글', '이번 주 청약 글', '주간 일정 글 써줘', '임시저장해줘' 요청 시 사용.
---

# 주간 청약 일정 글

설계: `docs/weekly-post-design.md`. 규칙: CLAUDE.md 절대 규칙(사실은 공고 기준·투자 권유 금지·발행은 사람이).

## 절차
1. **생성** `node posts/weekly.mjs [--week YYYY-MM-DD(월요일)]` — 기본은 다음 주 월~일. Pages의 schedule.json을 받아 `drafts/{월요일}_weekly.json`과 수집본 사본 `.data.json`을 만든다.
1-1. **그림** `node posts/images.mjs drafts/…json` — 맨 앞 주간 썸네일(대표 이미지), 단지마다 단지 카드 → 위치 지도(브이월드, 반경 1km). 위치를 확실히 못 찾는 단지는 지도 없이. 본문에는 `<p>[[IMG:키]]</p>` 자리표시로 들어간다.
2. **요약 2~3줄** — `drafts/…json`의 `facts`와 단지 목록만 보고 쓴다. 숫자는 집계값(접수·발표·계약 수, 종류별·지역별 수)과 데이터 값만. 평가·전망·권유 금지. `summary` 배열에 넣고 `node posts/weekly.mjs --render drafts/…json`.
3. **검수** `node posts/check.mjs drafts/…json` — 실패하면 고친다(본문은 직접 고치지 않는다: summary만 고치고 --render).
4. **승인** — 미리보기 `node preview/serve.mjs` → `http://localhost:5178/draft/{이름}`(PC·휴대폰 폭). 제목·요약·접수/발표/계약 수를 채팅에 보이고 **사용자 승인을 받는다. 승인 없이는 저장하지 않는다.**
5. **임시저장** `node tistory/draft.mjs drafts/…json --approved` — 발행 가드(완료·"발행" 버튼 차단) → 제목·카테고리 → 그림 한 장씩 첨부(첨부→사진, 치환자 `[##_Image|…_##]`를 파일명으로 짝지음) → 자리표시를 치환자로 바꿔 본문 조립 → 태그 → 임시저장 → 저장본을 다시 불러와 글자·그림 파일명까지 대조. 처음이거나 바꾼 뒤엔 `--dry-run`(업로드 외 저장 요청 차단, 저장 없음)으로 먼저 시험. 세션이 끊겼으면 카카오 간편로그인(저장된 계정 1개일 때만)으로 자동 재로그인한다. 종료 코드 3 = 비밀번호·추가 인증·동의가 필요해 멈춘 것 → 사용자에게 `tistory_login.bat`(로그인은 사람이).
6. **보고** — `drafts/…save.json`과 `…loaded.png`로 결과를 확인해 알리고, 같은 제목 저장본이 여러 건이면 오래된 것은 사람이 지우도록 안내한다(자동 삭제 금지). 발행은 사람이 한다.

## 매주 자동 실행 (2026-10-22 사용자 결정)
- 작업 스케줄러 `cheongyak_weekly_auto`가 일요일 18:00에 `weekly_auto.bat` → `posts/auto.mjs`를 돌린다: 초안(`--force --auto`, 요약은 집계 문장) → 그림 → 검수 → `draft.mjs --approved` → 끝나면 알림 창. 이 경로만 채팅 승인 없이 임시저장한다(검수 실패 시 저장 안 함). 발행은 사람이.
- 이미 저장이 확인된 주(`.save.json` ok, 시험 제외)는 건너뛴다. 기록은 `data/logs/weekly_auto.log`. 시험은 `weekly_auto.bat check [--week 월요일] [--quiet]`.
- 사람이 요약을 다시 쓰고 싶으면 위 절차(2~5단계)로 — 그때는 승인을 받는다.

## 알아 둘 것
- 티스토리 편집기는 입력 도중 **자동 임시저장**을 한다. 저장 확인은 개수가 아니라 저장본 재대조로 한다. 저장이 의심되면 `--verify-only`로 대조만.
- 셀렉터는 `tistory/selectors.json`(실측 근거 포함). 바뀌면 `node tistory/probe.mjs --menus`로 다시 실측한다.
