# 검색 등록 (aulee.tistory.com)

계정 작업은 운영자가 직접 한다. 스킨 수정은 필요 없다 — 티스토리 플러그인 두 개로 끝난다(2026-10-22 `관리 → 플러그인`에서 확인).
사이트맵 `https://aulee.tistory.com/sitemap.xml`, RSS `https://aulee.tistory.com/rss` 모두 응답 200, robots.txt는 글 수집을 막지 않는다.

## 1. 구글
1. 티스토리 `관리 → 플러그인 → 구글 서치콘솔` → 구글 계정 연결 → 적용. 소유 확인과 사이트맵 제출을 플러그인이 해 준다.
2. https://search.google.com/search-console 에서 `https://aulee.tistory.com/` 속성이 보이고 `Sitemaps`에 `sitemap.xml`이 "성공"인지 확인.
3. (선택) `URL 검사`에 홈 주소를 넣고 `색인 생성 요청`.

## 2. 네이버
1. https://searchadvisor.naver.com → `웹마스터 도구` → 사이트 등록에 `https://aulee.tistory.com`.
2. 소유 확인 방법 `HTML 태그` → `<meta name="naver-site-verification" content="…">` 한 줄 복사.
3. 티스토리 `관리 → 플러그인 → 메타 태그 등록` → 붙여넣기 → 적용 → 서치어드바이저로 돌아와 `소유확인`.
4. 사이트 선택 → `요청 → 사이트맵 제출`: `https://aulee.tistory.com/sitemap.xml`
5. `요청 → RSS 제출`: `https://aulee.tistory.com/rss`
6. (선택) `요청 → 웹 페이지 수집`: 홈 주소.

## 3. 다음 · 빙
- 다음 웹마스터도구는 robots.txt에 PIN을 넣는 방식이라 티스토리에서는 쓸 수 없다. 2주쯤 뒤 다음에서 블로그 이름으로 검색해 노출을 확인한다.
- 빙(선택): https://www.bing.com/webmasters → `Google Search Console에서 가져오기`.

## 확인
등록 후 Claude에게 "검색 등록 확인해줘" — 홈 HTML의 확인 태그(`naver-site-verification`, `google-site-verification`)를 확인한다.
색인까지는 보통 1~2주.
