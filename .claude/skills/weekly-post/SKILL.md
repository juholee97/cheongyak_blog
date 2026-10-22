---
name: weekly-post
description: "이번 주 청약 일정" 주간 글을 schedule.json으로 만들어 검수·승인 후 티스토리에 임시저장. '주간 글', '이번 주 청약 글', '주간 일정 글 써줘', '임시저장해줘' 요청 시 사용.
---

# 주간 청약 일정 글

설계: `docs/weekly-post-design.md`. 규칙: CLAUDE.md 절대 규칙(사실은 공고 기준·투자 권유 금지·발행은 사람이).

## 절차
1. **생성** `node posts/weekly.mjs [--week YYYY-MM-DD(월요일)]` — 기본은 다음 주 월~일. Pages의 schedule.json을 받아 `drafts/{월요일}_weekly.json`과 수집본 사본 `.data.json`을 만든다.
2. **요약 2~3줄** — `drafts/…json`의 `facts`와 단지 목록만 보고 쓴다. 숫자는 집계값(접수·발표·계약 수, 종류별·지역별 수)과 데이터 값만. 평가·전망·권유 금지. `summary` 배열에 넣고 `node posts/weekly.mjs --render drafts/…json`.
3. **검수** `node posts/check.mjs drafts/…json` — 실패하면 고친다(본문은 직접 고치지 않는다: summary만 고치고 --render).
4. **승인** — 미리보기 `node preview/serve.mjs` → `http://localhost:5178/draft/{이름}`(PC·휴대폰 폭). 제목·요약·접수/발표/계약 수를 채팅에 보이고 **사용자 승인을 받는다. 승인 없이는 저장하지 않는다.**
5. **임시저장** `node tistory/draft.mjs drafts/…json --approved` — 발행 가드(완료·"발행" 버튼 차단) → 제목·카테고리·본문(TinyMCE)·태그 → 임시저장 → 저장본을 다시 불러와 전문 대조. 종료 코드 3이면 `tistory_login.bat`(로그인은 사람이).
6. **보고** — `drafts/…save.json`과 `…loaded.png`로 결과를 확인해 알리고, 같은 제목 저장본이 여러 건이면 오래된 것은 사람이 지우도록 안내한다(자동 삭제 금지). 발행은 사람이 한다.

## 알아 둘 것
- 티스토리 편집기는 입력 도중 **자동 임시저장**을 한다. 저장 확인은 개수가 아니라 저장본 재대조로 한다. 저장이 의심되면 `--verify-only`로 대조만.
- 셀렉터는 `tistory/selectors.json`(실측 근거 포함). 바뀌면 `node tistory/probe.mjs --menus`로 다시 실측한다.
