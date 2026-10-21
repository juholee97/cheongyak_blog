# Handoff: 청약달력 — 티스토리 스킨 (청약 일정 캘린더 + 블로그 홈)

## Overview
티스토리 블로그 홈 화면.
- 상단: 지역 멀티 체크 필터 + 월간 달력. 매일 수집한 전국 청약 일정을 표시함.
- 아래로 스크롤: 일반 블로그 메인. 대표 글, 최신 글 그리드, 페이지네이션, 사이드바(카테고리/인기 글/태그).

## About the Design Files
`design-reference.dc.html`은 **HTML로 만든 디자인 레퍼런스**다. 생김새와 동작을 보여주는 프로토타입이지 그대로 붙여넣을 프로덕션 코드가 아니다. 브라우저에서 열면 동작한다(같은 폴더의 `support.js` 필요). 내부는 커스텀 템플릿 런타임(`{{ }}` 바인딩, `<sc-for>`, `<sc-if>`)과 JS 클래스로 작성되어 있다.
**과제:** 이 디자인을 **티스토리 스킨**(`skin.html` + `style.css` + `index.xml` + `images/`)으로 재구현한다. 캘린더는 바닐라 JS로 작성하고, 블로그 영역은 티스토리 치환자로 작성한다. 빌드 도구나 프레임워크는 쓰지 않는다(티스토리 스킨 편집기에 그대로 업로드할 수 있어야 함).

## Fidelity
**High-fidelity.** 색상, 타이포, 간격, 인터랙션이 확정 상태다. 픽셀 단위로 재현한다.

## 결과물 (Claude Code가 만들어야 할 것)
```
skin/
  index.xml        # 스킨 메타 (이름: 청약달력, 버전, 기본 설정)
  skin.html        # 전체 레이아웃 + 티스토리 치환자 + 캘린더 마크업
  style.css        # 아래 토큰 기반 스타일 (인라인 스타일 → 클래스로 옮김)
  images/
    calendar.js    # 캘린더/필터 로직 (바닐라 JS, ES2017)
crawler/
  fetch.mjs        # 청약 일정 수집 → schedule.json 생성
  .github/workflows/daily.yml   # 매일 06:00 KST 실행 후 GitHub Pages로 배포
```
※ 티스토리 스킨은 `images/` 폴더의 파일을 `./images/calendar.js`로 참조한다.

## 데이터 파이프라인 ("크롤링")
티스토리 자체에서는 서버 코드를 돌릴 수 없다. 그래서 외부에서 매일 JSON을 만들어 정적 호스팅에 올린다.
1. **소스:** 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」(APT 분양정보 상세 / 오피스텔·도시형 / APT 무순위·잔여세대). API 키는 GitHub Secrets의 `DATA_GO_KR_KEY`에 넣는다.
   - HTML 스크래핑보다 API를 우선한다. 응답 필드명(예: 공급지역명, 특별공급 접수 시작일, 1·2순위 접수일, 당첨자 발표일, 계약 시작일 등)은 API 문서를 보고 매핑한다.
2. **GitHub Actions** 크론 `0 21 * * *`(UTC, KST 06:00)으로 `fetch.mjs`를 실행한다. 이번 달 기준 −1개월부터 +2개월까지 수집해 `schedule.json`을 만든다.
3. 결과를 **GitHub Pages**에 배포한다. CORS는 Pages가 기본으로 허용한다.
4. `calendar.js`가 `SCHEDULE_URL`(index.xml의 스킨 변수로 노출)에서 fetch한다.

### schedule.json 스키마
```json
{
  "updatedAt": "2026-10-21T06:02:00+09:00",
  "items": [
    {
      "id": "2026000123",
      "name": "래미안 원펜타스 2차",
      "region": "서울",          // 17개 시·도 축약명 중 하나 (아래 목록)
      "district": "서초구",
      "kind": "APT",            // "APT" | "오피스텔" | "무순위"
      "units": 641,
      "pricePerPyeong": 7200,   // 만원/3.3㎡, 없으면 null
      "noticeUrl": "https://...",
      "applyhomeUrl": "https://www.applyhome.co.kr/...",
      "phases": [               // 날짜는 YYYY-MM-DD
        { "k": "sp",  "date": "2026-10-05" },
        { "k": "p1",  "date": "2026-10-06" },
        { "k": "p2",  "date": "2026-10-07" },
        { "k": "win", "date": "2026-10-13" },
        { "k": "con", "date": "2026-10-25" }
      ]
    }
  ]
}
```
- 접수 기간이 여러 날이면 날짜별로 이벤트를 펼치거나 시작일만 쓴다. 기본은 시작일만 쓴다.
- 무순위는 `p1`(라벨 "접수")과 `win`만 가진다. 오피스텔은 `p1`, `win`, `con`만 가진다.

## Screens / Views

전체 페이지는 다음 순서로 쌓인다. 배경 `#f6f5f1`. 콘텐츠는 `max-width:1200px; margin:0 auto; padding:0 24px`.

**캘린더 영역은 홈에서만 노출한다:** `<s_index_article_rep>`가 아닌 홈 판별 조건을 쓴다. `[##_body_id_##]`가 `tt-body-index`일 때만 보이게 하거나, JS로 `location.pathname === '/'`를 체크한다. 글 상세나 카테고리 페이지에서는 숨긴다.

### 1. Header
- 흰 배경, 하단 `1px solid #e6e4dd`, 안쪽 padding `18px 24px`.
- 좌측: 블로그명 `[##_title_##]`(22px/800, letter-spacing −0.03em). 옆에 설명 `[##_desc_##]`(13px, `#6f716f`), gap 10px, baseline 정렬.
- 우측 nav: `[##_blog_menu_##]` 또는 직접 링크. 메뉴는 청약일정 · 분양분석 · 청약가이드 · 당첨후기 · 방명록. 14px/500, gap 22px. 현재 항목은 `#0b7a55`, 700.
- 좁으면 flex-wrap으로 줄바꿈한다.

### 2. 지역 필터 (sticky)
- `position:sticky; top:0; z-index:5`. 흰 배경, border `1px #e6e4dd`, radius 14px, padding `16px 18px`. shadow `0 6px 20px -14px rgba(0,0,0,.25)`. 내부는 세로 flex, gap 12px. 섹션 상단 padding은 `28px 24px 8px`.
- 첫 줄: 좌측에 "지역 필터"(15px/700)와 요약 텍스트(13px `#6f716f`)를 둔다.
  - 요약 문구는 세 가지 중 하나: `전국 · 이번 달 N개 단지` / `K개 지역 선택 · 이번 달 N개 단지` / `지역을 선택하세요`.
- 첫 줄 우측 버튼 3개:
  - "전체 선택", "전체 해제": 흰 배경, border `#d9d7cf`, radius 8px, padding `6px 12px`, 13px.
  - "내 지역 저장": 배경 `#0b7a55`, 흰 글자, 600. 저장 후에는 라벨이 "저장됨 ✓"로 바뀐다. 필터를 다시 바꾸면 원래 라벨로 돌아온다.
- 그룹 3줄(그룹 라벨 + 칩):
  - 수도권: 서울, 경기, 인천
  - 광역시: 부산, 대구, 광주, 대전, 울산, 세종
  - 지방: 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주
- **그룹 라벨**(width 72px, 12px/700 `#6f716f`): 클릭하면 그룹 전체를 토글한다.
  - 앞의 14×14 체크박스(radius 4px, border 1.5px) 상태는 세 가지다. 전체 선택은 `✓`, 일부 선택은 `–`, 해제는 빈칸.
  - 선택이 하나라도 있으면 배경과 테두리가 `#0b7a55`, 없으면 흰 배경에 테두리 `#c9c7bf`.
  - 동작: 그룹이 전부 선택된 상태면 그룹 전체를 해제하고, 아니면 전체를 선택한다.
- **지역 칩**: pill(radius 999px), padding `6px 11px`, 13px/500, gap 6px.
  - 칩 안의 표시: `✓`/`+`, 지역명, 이번 달 단지 수(11px, opacity .7, 0이면 생략).
  - ON 상태: bg `#e3f3ec`, 글자 `#0b5c41`, border `#9fd3bd`.
  - OFF 상태: bg `#fff`, 글자 `#6f716f`, border `#e0ded6`.
- 모든 버튼과 칩에 `white-space:nowrap; flex:none`을 준다. 한글이 글자 단위로 줄바꿈되는 것을 막기 위함이다.

### 3. 캘린더 + 날짜 패널
- 래퍼는 `display:flex; flex-wrap:wrap; gap:20px; margin-top:20px`.
  - 캘린더 카드: `flex:999 1 660px`.
  - 우측 aside: `flex:1 1 280px`.
  - 좁아지면 aside가 아래로 내려간다.
- **캘린더 카드:** 흰 배경, border `#e6e4dd`, radius 14px, overflow hidden.
- **툴바**(padding `16px 18px`, 하단 border `#eeece6`):
  - 좌측: ‹ 버튼(32×32, radius 8px), 월 제목 "2026년 10월"(20px/800, min-width 132px, 가운데 정렬), › 버튼, "오늘" 버튼(height 32px).
  - 우측: 단계 범례 칩 5개. 클릭하면 단계 표시를 ON/OFF 한다.
    - 칩 스타일: 12px/600, padding `4px 9px`, radius 6px. 앞에 7×7 색 점(radius 2px).
    - ON이면 단계 bg/색을 쓴다. OFF면 bg `#f1efea`, 글자 `#8a8c88`, opacity .7.
- **요일 헤더:** 7열 grid, 12px/600 `#6f716f`, padding `8px 10px`. 일요일은 `#d1443b`, 토요일은 `#2f62d6`.
- **그리드:** 래퍼 `overflow-x:auto`, 내부 `min-width:640px`. 주마다 7열 grid, 하단 border `#eeece6`.
- **날짜 셀:**
  - 크기와 배경: min-height 112px, padding 6px, 우측 border `#f1efea`. 세로 flex, gap 3px. 배경 `#fff`, 선택된 날은 `#f2faf6`.
  - 이번 달이 아닌 날은 opacity .45.
  - 날짜 숫자: 13px/600, 22px 원형. 일요일 `#d1443b`, 토요일 `#2f62d6`. 오늘은 bg `#0b7a55`, 흰 글자, 800.
  - 일정 칩은 최대 3개까지 보인다. 11.5px, line-height 1.35, padding `2px 5px`, radius 4px, 단계 bg/색. 한 줄 말줄임으로 처리한다.
  - 칩 내용은 `<b>단계라벨</b> 단지명`, title 속성은 `"단계 · 단지명"`.
  - 칩이 4개 이상이면 `+N개 더`(11px `#6f716f`)를 표시한다.
  - 셀을 클릭하면 그 날짜를 선택해 우측 패널에 반영한다. 칩을 클릭하면 상세 모달을 연다(이벤트 전파 중단).
- **우측 aside 카드**(흰 배경, radius 14px, padding 16px):
  - 제목: "10월 21일 (수) · 오늘"(오늘일 때만 " · 오늘"), 15px/700. 우측에 "N건"(12px).
  - 일정 리스트: 세로 gap 8px. 각 항목은 버튼이다.
    - 항목 스타일: bg `#faf9f6`, border `#eeece6`, radius 10px, padding `10px 12px`.
    - 윗줄: 단계 배지(11px/700) + "서울 서초구 · APT"(11px/500 `#6f716f`).
    - 아랫줄: 단지명(14px/600).
    - 클릭하면 상세 모달을 연다.
  - 일정이 없으면 "선택한 지역에 이 날 일정이 없어요."를 표시한다.
  - 카드 아래 출처 표기(12px `#8a8c88`, line-height 1.6): "출처: 청약홈(한국부동산원) 공고 · 매일 06:00 자동 수집 / 마지막 갱신 {updatedAt}".
- 섹션 하단에 "최신 글 보기 ↓" 링크(가운데, 13px `#6f716f`, margin-top 28px)를 두고 `#blog`로 앵커 이동한다.

### 4. 상세 모달
- 오버레이: fixed, `rgba(20,21,22,.45)`, z-index 50, 가운데 정렬, padding 20px. 오버레이 클릭이나 ✕, Esc로 닫는다.
- 패널: max-width 440px, 흰 배경, radius 16px, padding 22px, gap 16px. shadow `0 30px 60px -20px rgba(0,0,0,.4)`.
- 상단: "서울 서초구 · APT"(12px/600 `#6f716f`), 단지명(20px/800), ✕ 버튼(32×32).
- 2열 정보 박스(bg `#faf9f6`, radius 10px, padding `10px 12px`):
  - "공급 세대 / 641세대"
  - "분양가(3.3㎡) / 7,200만원"
  - 라벨은 11px, 값은 16px/700.
- 타임라인 행: 단계 색 점 8×8, 라벨, 우측 날짜 "10.05 (일)"(600). 행 padding `9px 0`, 하단 border `#f1efea`, 14px.
  - 라벨은 "특공 접수", "1순위 접수", "2순위 접수", "당첨자 발표", "계약". 무순위는 "접수"를 쓴다.
- 버튼 2개(flex 1, padding 11px, radius 10px, 14px/600):
  - "청약홈에서 보기": `#0b7a55` 배경, 흰 글자, `applyhomeUrl`로 새 탭.
  - "모집공고문": 테두리 `#d9d7cf`, `noticeUrl`로 연결.

### 5. 블로그 메인 (`id="blog"`)
- 래퍼: `display:flex; flex-wrap:wrap; gap:40px; padding:40px 24px 64px`. 메인 영역 `flex:999 1 600px`, 사이드바 `flex:1 1 260px`.
- **대표 글**: 공지 글이나 최신 1개를 쓴다. `<s_notice_rep>` 또는 첫 번째 `<s_index_article_rep>`.
  - 카드: 흰 배경, border, radius 14px, padding 16px. grid `1.2fr 1fr`, gap 24px.
  - 썸네일: 4:3, radius 10px.
  - 텍스트: 카테고리(12px/700 `#0b7a55`), 제목(24px/800, line-height 1.3, letter-spacing −0.03em), 요약(14px `#55575a`, line-height 1.65), "날짜 · 댓글 N"(12px `#8a8c88`).
- **"최신 글" 헤더:** 하단 `2px solid #1c1d1f`, padding-bottom 10px. "최신 글"은 18px/800, 우측 "전체 N"은 13px.
- **글 그리드:** `repeat(auto-fill,minmax(240px,1fr))`, gap `24px 20px`. `<s_list><s_list_rep>` 또는 `<s_index_article_rep>`로 만든다.
  - 썸네일: 16:10, radius 10px.
  - 카테고리: 12px/700 `#0b7a55`.
  - 제목: 16px/700, line-height 1.4, letter-spacing −0.02em.
  - 날짜: 12px `#8a8c88`.
  - 썸네일이 없으면 줄무늬 플레이스홀더 `repeating-linear-gradient(135deg,#eceae3 0 10px,#e4e2da 10px 20px)`를 쓴다.
- **페이지네이션** `<s_paging>`: 34×34, radius 8px, 14px. 현재 페이지는 `#1c1d1f` 배경에 흰 글자. 마지막에 "다음 ›".
- **사이드바**(세로 gap 28px). 각 블록 제목은 14px/800, 하단 `2px solid #1c1d1f`, padding-bottom 8px.
  - 카테고리: `[##_category_list_##]`. 이름과 개수를 양끝 정렬한다. 14px, 개수는 `#8a8c88`.
  - 인기 글: `<s_rctps_popular_rep>`. 순위 숫자(800 `#0b7a55`, width 14px)와 제목(14px, line-height 1.45).
  - 태그: `<s_random_tags>`. pill, 12px, padding `4px 9px`, 흰 배경, border `#e6e4dd`, 앞에 "#".
- 티스토리 치환자 구조가 디자인과 다르면 CSS로 맞춘다.
  - 예: `.tt_category .link_tit`, `.c_cnt`를 오버라이드한다.

### 6. Footer
- 흰 배경, 상단 border `#e6e4dd`, padding `20px 24px`, 12px `#8a8c88`, 양끝 정렬, 줄바꿈 허용.
- 좌측 "© 2026 [##_title_##] · Powered by Tistory".
- 우측 "청약 일정은 참고용이며 정확한 내용은 입주자모집공고를 확인하세요."

## Interactions & Behavior (calendar.js)
- 초기 표시: 오늘이 속한 달을 보여주고 오늘 날짜를 선택해 둔다.
- 지역 필터:
  - 기본값은 전체 17개 지역이다. `localStorage['cheongyak-regions']`에 배열이 있으면 그 값으로 복원한다.
  - 저장은 "내 지역 저장" 버튼을 누를 때만 한다(필터 토글만으로는 저장하지 않음).
- 단계 필터: 세션 동안만 유지한다(저장 안 함).
- 월 이동: ‹ / ›로 이동하고 연도 경계를 처리한다. "오늘"을 누르면 이번 달로 돌아가 오늘을 선택한다.
- 주 수: 그 달 1일이 속한 주부터 말일이 속한 주까지 렌더한다(4~6주).
- 이벤트 정렬: 같은 날짜 안에서는 단계 순서(sp→p1→p2→win→con), 그다음 단지명 순으로 정렬한다.
- 로딩: fetch 중에는 셀 안에 칩 자리 회색 스켈레톤(`#f1efea`)을 보여준다.
- 오류: 실패하면 aside에 "일정을 불러오지 못했어요. 잠시 후 새로고침해 주세요."를 표시한다.
- 모달: Esc로 닫고, 모달이 열려 있는 동안 body 스크롤을 잠근다.
- 반응형:
  - < 960px: aside가 캘린더 아래로 내려간다(flex-wrap).
  - < 700px: 달력은 가로 스크롤(min-width 640px)을 유지한다.
  - 선택: < 560px에서 날짜 셀 칩을 단계 색 점으로 축약하고, 일정 목록은 aside에서 보게 한다.

## State
`regions: string[]`, `phases: string[]`, `year`, `month(0-11)`, `selectedDate: 'YYYY-MM-DD'`, `modalId|null`, `saved: boolean`, `data: items[]`, `status: 'loading'|'ok'|'error'`.

## Design Tokens
- **텍스트:**
  - ink `#1c1d1f`
  - sub `#6f716f`
  - muted `#8a8c88`
  - body `#55575a`
- **배경과 선:**
  - 페이지 배경 `#f6f5f1`, 카드 `#fff`
  - 연한 면 `#faf9f6` / `#f1efea`
  - 선 `#e6e4dd` / `#eeece6` / `#f1efea`, 버튼 테두리 `#d9d7cf`
- **브랜드:**
  - primary `#0b7a55`
  - primary-tint `#e3f3ec`
  - primary-ink `#0b5c41`
  - primary-border `#9fd3bd`
  - 선택된 날짜 배경 `#f2faf6`
- **요일:** 일 `#d1443b`, 토 `#2f62d6`.
- **단계**(색 / 배경):
  - 특공 `sp`: `#2f62d6` / `#e8eefc`
  - 1순위 `p1`: `#0b7a55` / `#e3f3ec`
  - 2순위 `p2`: `#b86a00` / `#fcf0dc`
  - 발표 `win`: `#c42f62` / `#fbe7ee`
  - 계약 `con`: `#6a4fc4` / `#efeafb`
- **Radius:**
  - 4px: 일정 칩
  - 6px: 범례
  - 8px: 버튼
  - 10px: 썸네일, 리스트
  - 14px: 카드
  - 16px: 모달
  - 999px: 칩
- **Shadow:**
  - 필터 `0 6px 20px -14px rgba(0,0,0,.25)`
  - 모달 `0 30px 60px -20px rgba(0,0,0,.4)`
- **타이포:** Pretendard(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`). fallback은 `-apple-system, sans-serif`. 숫자는 `font-feature-settings:'tnum'`, 본문은 `-webkit-font-smoothing:antialiased`.
  - 크기: 11 / 11.5 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 22 / 24.
  - 굵기: 500 / 600 / 700 / 800.
- **간격:** 3, 6, 8, 10, 12, 16, 20, 24, 28, 40, 64.
- **링크:** 기본 `#1c1d1f`, 밑줄 없음. hover `#0b7a55`.

## Assets
- 이미지 에셋은 없다. 썸네일은 글 대표 이미지를 쓰고(`[##_article_rep_thumbnail_url_##]`), 없으면 줄무늬 플레이스홀더를 쓴다.
- 아이콘은 텍스트 글리프만 쓴다(‹ › ✓ + – ✕ ↓).

## Files
- `design-reference.dc.html`: 전체 디자인 + 샘플 데이터 + 동작 로직.
  - 하단 `<script data-dc-script>` 안 `RAW` 배열이 샘플 데이터다. `schedule.json` 생성 전 목업 데이터로 재사용할 수 있다.
  - 지역, 단계 정의와 캘린더 계산 로직(`renderVals`)을 `calendar.js`로 옮긴다.
- `support.js`: 레퍼런스 파일을 브라우저에서 열기 위한 런타임. 스킨에는 포함하지 않는다.

## 구현 순서 제안 (Claude Code용)
1. `skin.html`과 `style.css`로 정적 레이아웃과 치환자를 만든다. 캘린더는 샘플 JSON으로 렌더한다.
2. `calendar.js`에 필터, 달력, 모달, localStorage를 구현한다.
3. `crawler/fetch.mjs`와 GitHub Actions, Pages 배포를 만든다. 그다음 `index.xml` 스킨 변수 `SCHEDULE_URL`에 연결한다.
4. 티스토리 스킨 편집기에 업로드해 홈, 글 상세, 카테고리 페이지에서 캘린더 노출 조건을 확인한다.
