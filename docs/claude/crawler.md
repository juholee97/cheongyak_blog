# 공고 수집기 (`crawler/`)

달력에 싣는 공고 수집을 고치거나, 달력에 공고가 빠졌을 때 읽는다. 괄호 안 날짜로 `history.md` 검색.

## 공통
- 결과는 `site/schedule.json`(GitHub Pages). 매일 06:00 KST `daily.yml`이 수집·배포. CI에는 npm 설치가 없다 — 수집기와 `zip/guard.mjs`는 playwright 없이 돌아야 한다.
- **안전장치(2026-10-27)**: 출처가 0건·실패면 지난 배포본(+ `crawler/fallback-schedule.json`)에서 그 출처 항목을 이어 쓴다. 청약홈 API가 전 출처 0건을 돌려준 날 달력에서 공고가 빠졌던 일 때문.
- 로컬에서만 만들 수 있는 자료(키가 `.env`에만 있거나 OCR이 필요한 것)는 json 파일로 커밋해 CI가 읽는다: `sh_attach.json`, `youth_house.json`, `auleezip_links.json`. 실행기(`push_attach.bat`·`push_house.bat`·`zip/push_links.bat`)가 그 파일이 바뀐 때만 그 파일만 커밋·푸시한다.
- 점검 `node crawler/check.mjs`(필드 매핑, 병합 시험, 단계 체크).

## 출처별
- **청약홈** `fetch.mjs` — 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」. APT·무순위·임의공급·공공지원 민간임대·오피스텔. 단계 종료일(end)·모집공고일(noticeDate). 분양전환 임대 분양가는 비운다. 서울 district는 25개 구 중 하나가 아니면 null. 일정의 1·2순위 날짜는 해당지역 칸뿐(기타지역 날짜는 아직 수집 안 함).
- **LH** `lh.mjs`(2026-10-27, 11-11) — 15058530 `lhLeaseNoticeInfo1` 목록(행복·국민·영구·통합공공·공공임대. 집 아닌 임대·「전국」 공고 제외) + 상세정보 15057999 `lhLeaseNoticeDtlInfo1`로 접수 시작일 → p1을 시작~마감으로 싣고 `startKnown` 표시. 못 받은 공고는 마감일만.
- **SH** `sh.mjs`(2026-10-28) — 공식 API가 없어 i-sh.co.kr 「주택임대 공고 및 공지」 게시판(robots.txt 허용 경로)을 읽는다. 모집공고 글만, 접수일을 못 읽으면 달력에서 뺀다. 사람 모집 공고(돌보미·사무지원·채용·직원·기간제·인턴)는 `isRecruit`가 뺀다(2026-11-11). 호출 한도 guard `sh` 하루 400쪽.
- **SH 첨부 일정** `sh_attach.mjs` — 본문에 일정이 없는 글의 첨부를 SH 문서 뷰어 쪽 이미지로 받아 한국어 OCR(`tools/ocr_ko.py`, venv `tools/ocr_venv`) → `crawler/sh_attach.json`. 읽은 글자는 `data/sh_attach_text/`.
- **서울시 청년안심주택** `youth.mjs`(2026-10-26) — 공식 API가 없어 soco.seoul.go.kr 모집공고 목록 JSON에서 「■청약신청·■서류심사 대상자 발표·■계약체결」 줄을 읽는다. kind `청년안심주택`, 추가모집·예비자 포함. 실패해도 청약홈 수집은 그대로 배포. 주택 종류는 `youth_house.mjs`(건축물대장 15134735 + 브이월드, 로컬 실행) → `youth_house.json` → `it.house`. 세부 없음·미등재는 달력 기본값 아파트.
- **병합** `merge.mjs`(2026-10-28) — LH·SH 공고에서 정정 표시·날짜 괄호를 뺀 이름이 같으면 같은 공고. 정정공고가 있으면 먼저 올라온 같은 이름 글을 빼고, 같은 첫 접수일끼리는 최신 하나만. 접수일이 다른 회차·청약홈·청년안심주택은 그대로.
- `post_links.mjs`는 2026-11-10 삭제(티스토리 분석 글 링크용이었음).
