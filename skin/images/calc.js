/* 정책대출 확인기(리모컨) — docs/eligibility-calculator-design.md 15·16절
 * 모든 화면: 오른쪽 아래 「정책대출 확인」 버튼(계산기 페이지로 가는 링크 하나). 분양분석 글이면 주소 뒤에 #n=공고번호, 대출 글이면 #calc=loan&t=유형.
 * 계산기 페이지(CALC_PAGE)에서만: 본문 앞에 계산기를 그리고 rules.json(+ #n=이면 notices.json)을 받는다.
 * 입력값은 이 스크립트 변수에만 둔다. 저장·전송하지 않는다(9-4). 전체를 try로 감싸 오류가 다른 스크립트·페이지를 막지 않게 한다.
 * node 점검: vm으로 읽어 CY만 꺼낸다(document가 없으면 화면 코드는 건너뜀). */
(function (g) {
  'use strict';
  // 계산기 페이지 주소(티스토리 일반 글 /NN). 글을 공개한 뒤 넣는다 — null이면 버튼을 그리지 않는다. 미리보기는 window.CY_CALC_PAGE로 덮는다
  var CALC_PAGE = null;
  // 그 글에서 버튼을 누르면 미리 고를 유형(글은 다시 저장하지 않는다, 6-1). 대표 가이드 글 주소 → 유형
  var PRESETS = { '/5': 'buy', '/11': 'buy', '/12': 'buy', '/15': 'buy', '/21': 'buy', '/36': 'buy', '/22': 'jeonse', '/57': 'jeonse', '/58': 'jeonse', '/47': '' };
  var PRESET_CATEGORY = { '/category/대출·정책': '' };
  var ANALYSIS_CATEGORY = '/category/분양분석';

  var CY = g.CY = g.CY || {};

  // 지금 글이 분양분석 글이면 본문 청약홈 링크의 공고번호(16-1). 아니면 null
  CY.noticeNoOf = function (doc) {
    if (doc.body.id !== 'tt-body-page') return null;
    var cat = doc.querySelector('.post-cat');
    if (!cat || path(cat.href) !== ANALYSIS_CATEGORY) return null;
    var a = doc.querySelector('.post-body a[href*="applyhome.co.kr"][href*="houseManageNo="]');
    var m = a && /houseManageNo=(\d+)/.exec(a.getAttribute('href'));
    return m ? m[1] : null;
  };
  // 버튼 주소 뒤에 붙일 해시
  CY.hashFor = function (doc, here) {
    var no = CY.noticeNoOf(doc);
    if (no) return '#n=' + no;
    var t = PRESETS.hasOwnProperty(here) ? PRESETS[here] : null;
    if (t === null && doc.body.id === 'tt-body-page') {
      var cat = doc.querySelector('.post-cat');
      if (cat && PRESET_CATEGORY.hasOwnProperty(path(cat.href))) t = PRESET_CATEGORY[path(cat.href)];
    }
    return t === null ? '' : '#calc=loan' + (t ? '&t=' + t : '');
  };
  function path(u) {
    try { return decodeURIComponent(new URL(u, location.href).pathname).replace(/\/+$/, '') || '/'; } catch (e) { return ''; }
  }

  if (typeof document === 'undefined') return;

  function remote(page) {
    var here = path(location.href);
    if (here === page || /^\/manage/.test(here)) return;
    var a = document.createElement('a');
    a.className = 'cy-remote';
    a.href = page + CY.hashFor(document, here);
    a.textContent = '정책대출 확인';
    a.addEventListener('click', function () {
      if (g.gtag) g.gtag('event', 'calc_remote_click', { from_path: here });
    });
    document.body.appendChild(a);
  }

  // 계산기 페이지: 제목 아래(.post-body 앞)에 자리를 만들고 규칙을 받는다. 화면은 CY.mount(작업 5)가 그린다
  function calcPage() {
    var body = document.querySelector('.post-body');
    if (!body) return;
    var box = document.createElement('section');
    box.className = 'cy-calc';
    box.setAttribute('aria-label', '정책대출 예비 확인');
    box.innerHTML = '<p class="cy-calc-loading">계산기를 불러오는 중이에요…</p>';
    body.parentNode.insertBefore(box, body);
    var base = String(g.CHEONGYAK_SCHEDULE_URL || '').replace(/[^\/]*$/, '');
    var fail = function () {
      box.innerHTML = '<p class="cy-calc-fail">지금은 계산기를 열 수 없어요. 아래 표에서 상품별 조건을 확인해 주세요.</p>';
    };
    if (!base) return fail();
    fetch(base + 'rules.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rules) {
      if (!rules || rules.schema !== 1 || !rules.loans) return fail();
      if (typeof CY.mount === 'function') CY.mount(box, rules, location.hash);
      else box.innerHTML = '<p class="cy-calc-loading">계산기를 준비하고 있어요. 아래 표에서 상품별 조건을 먼저 확인해 주세요.</p>';
    }).catch(fail);
  }

  try {
    var page = g.CY_CALC_PAGE || CALC_PAGE;
    if (!page) return;
    if (path(location.href) === page) calcPage();
    else remote(page);
  } catch (e) { /* 다른 스크립트와 페이지를 막지 않는다 */ }
})(this);
