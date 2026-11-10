/* 청약달력 v2 — 홈 캘린더 (바닐라 JS, ES2017) */
(function () {
  'use strict';

  // 카테고리 개수 "(12)" → "12" (모든 페이지)
  document.querySelectorAll('.side-category .c_cnt').forEach(function (e) {
    e.textContent = e.textContent.replace(/[()\s]/g, '');
  });

  // 글 목록 다듬기: 티스토리 요약은 문단 사이 띄어쓰기를 지워서("…입니다.전용") 문장 끝 뒤에 한 칸, 오늘 글은 시각만 나와서 "오늘"로
  document.querySelectorAll('.card .summary').forEach(function (e) {
    var t = e.textContent.replace(/([다요죠까])\.(?=[가-힣A-Za-z])/g, '$1. ');
    // 본문 첫 문장들만: 160자 안의 마지막 문장 끝에서 자른다(뒤에 소제목·표 글자가 붙지 않게)
    var cut = -1, re = /[다요죠까]\.(\s|$)/g, m;
    while ((m = re.exec(t)) && m.index < 160) cut = m.index + 2;
    e.textContent = cut > 0 ? t.slice(0, cut) : t;
  });
  document.querySelectorAll('.card .date').forEach(function (e) {
    var t = e.firstChild;
    if (t && t.nodeType === 3 && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(t.nodeValue)) t.nodeValue = '오늘';
  });

  // 현재 페이지에 해당하는 메뉴에 밑줄 (글 화면은 그 글의 카테고리 기준, 가장 길게 맞는 링크 하나)
  (function () {
    var norm = function (u) {
      try { return decodeURIComponent(new URL(u, location.href).pathname).replace(/\/+$/, '') || '/'; } catch (e) { return ''; }
    };
    var cat = document.body.id === 'tt-body-page' && document.querySelector('.post-cat');
    var here = norm(cat ? cat.href : location.href), best = null, bestLen = -1;
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      if (a.host !== location.host) return;
      var p = norm(a.href);
      var hit = p === '/' ? document.body.id === 'tt-body-index' : here === p || here.indexOf(p + '/') === 0;
      if (hit && p.length > bestLen) { best = a; bestLen = p.length; }
    });
    if (best) best.classList.add('is-active');
  })();

  // 전체 달력은 "청약일정" 카테고리 페이지(/category/청약일정)에, 홈은 이번 주 요약(renderHero)과 글 목록만
  var isHome = document.body.id === 'tt-body-index';
  var CAL_PATH = '/category/청약일정';
  var isCal = document.body.id === 'tt-body-category' && (function () {
    try { return decodeURIComponent(location.pathname).replace(/\/+$/, '') === CAL_PATH; } catch (e) { return false; }
  })();
  document.body.classList.toggle('cal-page', isCal);

  // 휴대폰 하단 탭 바(홈 / 달력 / 이번 주): 달력 페이지 안에서는 이동 없이 달력 ↔ 이번 주를 바꾼다(CSS가 700px 이하에서만 적용)
  var tabbar = document.querySelector('.m-tabbar');
  function setTab(t) {
    ['cal', 'week'].forEach(function (x) { document.body.classList.toggle('m-tab-' + x, isCal && x === t); });
    if (tabbar) tabbar.querySelectorAll('a').forEach(function (a) {
      var on = a.dataset.tab === t;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  // 탭 주소 #week는 일부러 요소 id와 겹치지 않게 해서 브라우저가 그 위치로 스크롤하지 않게 한다
  setTab(isCal ? (location.hash === '#week' ? 'week' : 'cal') : isHome ? 'home' : '');
  if (tabbar && isCal) tabbar.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-tab="cal"], a[data-tab="week"]');
    if (!a) return;
    e.preventDefault();
    setTab(a.dataset.tab);
    history.replaceState(null, '', a.dataset.tab === 'week' ? '#week' : location.pathname + location.search);
    window.scrollTo(0, 0);
  });

  var root = document.getElementById('cal');
  if (!isHome && !(root && isCal)) return;
  var mobile = window.matchMedia('(max-width: 700px)');

  var GROUPS = [
    { name: '수도권', items: ['서울', '경기', '인천'] },
    { name: '광역시', items: ['부산', '대구', '광주', '대전', '울산', '세종'] },
    { name: '지방', items: ['강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] },
  ];
  var ALL = GROUPS.reduce(function (a, g) { return a.concat(g.items); }, []);
  var GU = ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구',
    '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'];
  var PH = [
    { k: 'sp', label: '특별공급', full: '특별공급 접수', c: '#0a4ec2', bg: '#eaf0fb' },
    { k: 'p1', label: '1순위', full: '1순위 접수', c: '#00745f', bg: '#e5f3ef' },
    { k: 'p2', label: '2순위', full: '2순위 접수', c: '#9a5a00', bg: '#f8f0e2' },
    { k: 'win', label: '당첨발표', full: '당첨발표', c: '#b3261e', bg: '#fbebea' },
    { k: 'con', label: '계약', full: '계약', c: '#4b4f9c', bg: '#eeeef8' },
  ];
  var PHK = {};
  PH.forEach(function (p, i) { PHK[p.k] = Object.assign({ i: i }, p); });
  var W = '일월화수목금토';
  var STORE = 'cheongyak-regions', STORE_GU = 'cheongyak-seoul-gu', STORE_FOLD = 'cheongyak-filter-folded', STORE_SRCF = 'cheongyak-srclist-filter';
  // 종류 필터 두 줄(2026-10-29 사용자 지시: 「아파트」만 켜면 아파트 무순위·임대가 다 빠짐 → 집 종류와 공고 종류를 나눈다).
  // 두 줄 다 켜진 항목만 보인다. 꺼 둔 값만 저장해서 새 값은 켜진 채로 나온다(2026-10-27 한 줄 필터의 저장값 cheongyak-kinds-off는 쓰지 않는다)
  // 집 종류는 자료에 따로 없어서 공고 종류로 정한다: 청약홈 무순위·임의공급은 APT 공고, LH·SH 건설임대·장기전세는 아파트 단지,
  // 매입임대·사회주택·수요자맞춤형(매입형)은 다세대·다가구가 많고 청년안심주택은 건물마다 달라 「빌라·기타」
  var HOUSE_APT = ['APT', '무순위', '임의공급', '공공지원 민간임대', '행복주택', '국민임대', '영구임대', '통합공공임대', '공공임대', '장기전세', '미리내집'];
  var houseOf = function (it) {
    if (it.kind === '오피스텔' || it.kind === '도시형') return it.kind;
    if (it.kind === '공공지원 민간임대' && /오피스텔/.test(it.name)) return '오피스텔';
    return HOUSE_APT.indexOf(it.kind) >= 0 ? '아파트' : '빌라·기타';
  };
  var noticeOf = function (it) { return it.kind === 'APT' || it.kind === '오피스텔' || it.kind === '도시형' ? '분양' : it.kind; };
  var DIMS = [
    { k: 'house', title: '주택 종류', store: 'cheongyak-house-off', of: houseOf, order: ['아파트', '오피스텔', '도시형', '빌라·기타'] },
    { k: 'notice', title: '공고 종류', store: 'cheongyak-notice-off', of: noticeOf,
      order: ['분양', '무순위', '임의공급', '공공지원 민간임대', '청년안심주택', '행복주택', '국민임대', '영구임대', '통합공공임대', '공공임대', '장기전세', '매입임대', '미리내집', '사회주택', '수요자맞춤형'] },
  ];
  var DIM = {};
  DIMS.forEach(function (dm) { DIM[dm.k] = dm; });
  var KIND_NAME = { '공공지원 민간임대': '민간임대' };
  var kindName = function (k) { return KIND_NAME[k] || k; };
  // 경기 시·군(2026-10-26 사용자 요청: 서울 자치구처럼 경기도도 시별로). 일정 자료의 district(「화성특례시」「용인시」)에서 시·군을 뗀 이름
  var GG = ['가평', '고양', '과천', '광명', '광주', '구리', '군포', '김포', '남양주', '동두천', '부천', '성남', '수원', '시흥', '안산', '안성',
    '안양', '양주', '양평', '여주', '연천', '오산', '용인', '의왕', '의정부', '이천', '파주', '평택', '포천', '하남', '화성'];
  // 시·도 아래로 나눠 고르는 곳: 서울 자치구, 경기 시·군. key = 일정 항목이 속한 칸 이름
  var SUB = {
    '서울': { list: GU, store: STORE_GU, title: '서울 자치구', unit: '개 구', open: '자치구별 ▾', close: '자치구 접기 ▴', key: function (it) { return it.district || ''; } },
    '경기': { list: GG, store: 'cheongyak-gyeonggi-si', title: '경기 시·군', unit: '개 시·군', open: '시·군별 ▾', close: '시·군 접기 ▴',
      key: function (it) { // district가 「풍무역세권」처럼 시·군이 아닐 때는 주소의 「경기도 ○○시」에서
        var k = (it.district || '').split(' ')[0].replace(/(특례시|시|군)$/, '');
        var m = GG.indexOf(k) < 0 && /경기도\s+(\S+?)(특례시|시|군)\s/.exec(it.address || '');
        return m ? m[1] : k;
      } },
  };
  var SUBS = Object.keys(SUB);
  var fullSub = function () { var o = {}; SUBS.forEach(function (r) { o[r] = SUB[r].list.slice(); }); return o; };

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var key = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var a = s.split('-'); return new Date(+a[0], a[1] - 1, +a[2]); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : null; };
  var pvars = function (p) { return '--pc:' + p.c + ';--pbg:' + p.bg; };
  var only = function (list, allowed) { return allowed.filter(function (x) { return list.indexOf(x) >= 0; }); };
  // 체크박스: on + part면 "–", on이면 "✓"
  var box = function (on, part, sm) {
    return '<span class="box' + (sm ? ' sm' : '') + (on ? ' on' : '') + '">' + (on ? (part ? '–' : '✓') : '') + '</span>';
  };
  // APT 말고는 순위가 없으니 p1을 "접수"로. 청년안심주택 발표는 서류심사 대상자·당첨자 발표라 "발표"로
  var phaseOf = function (item, k) {
    var p = PHK[k];
    if (k === 'p1' && item.source === 'lh') return Object.assign({}, p, { label: '마감', full: '접수 마감' }); // LH 임대는 마감일만 안다
    if (k === 'p1' && item.kind !== 'APT') return Object.assign({}, p, { label: '접수', full: '접수' });
    return k === 'win' && (item.kind === '청년안심주택' || item.source === 'sh') ? Object.assign({}, p, { label: '발표', full: '발표' }) : p;
  };
  var load = function (k, allowed) {
    try {
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      if (Array.isArray(v)) return only(v, allowed);
    } catch (e) { /* 저장소 막힘 */ }
    return allowed.slice();
  };

  var today = new Date();
  if (isHome) {
    loadSchedule().then(function (j) { renderHero(j.items, j.updatedAt); }, function (err) { console.warn('청약 일정 불러오기 실패:', err); renderHero([], '', true); });
    return;
  }
  var S = {
    regions: load(STORE, ALL), sub: (function () { var o = {}; SUBS.forEach(function (r) { o[r] = load(SUB[r].store, SUB[r].list); }); return o; })(), subOpen: '', filterOpen: false, // filterOpen은 휴대폰에서만 의미 있음
    off: (function () { var o = {}; DIMS.forEach(function (dm) { try { var v = JSON.parse(localStorage.getItem(dm.store) || '[]'); o[dm.k] = Array.isArray(v) ? v : []; } catch (e) { o[dm.k] = []; } }); return o; })(),
    folded: (function () { try { return localStorage.getItem(STORE_FOLD) === '1'; } catch (e) { return false; } })(),
    srcFilter: (function () { try { return localStorage.getItem(STORE_SRCF) !== '0'; } catch (e) { return true; } })(), // 기관별 목록에 위 필터 적용(기본 켬) // PC: 지역 칸 접기(요약 줄만, 2026-10-27)
    phases: PH.map(function (p) { return p.k; }),
    y: today.getFullYear(), m: today.getMonth(), sel: key(today),
    // 홈 달력의 날짜 칸(#d=YYYY-MM-DD)으로 오면 그 날을 고른 채로 연다
    _d: (function () { var x = /^#d=(\d{4})-(\d{2})-(\d{2})$/.exec(location.hash); return x && x[0].slice(3); })(),
    modal: null, postLinks: {}, saved: false, data: [], status: 'loading', updatedAt: '',
  };

  if (S._d) { S.y = +S._d.slice(0, 4); S.m = +S._d.slice(5, 7) - 1; S.sel = S._d; }
  var refs = {};
  root.querySelectorAll('[data-ref]').forEach(function (el) { refs[el.dataset.ref] = el; });

  function set(patch) { Object.assign(S, patch); render(); }
  function setRegions(list) { set({ regions: only(list, ALL), saved: false }); }
  // 구·시를 하나라도 고르면 그 시·도 선택, 전부 빼면 해제
  function setSub(region, list) {
    var r = S.regions.filter(function (x) { return x !== region; });
    if (list.length) r.push(region);
    S.sub[region] = only(list, SUB[region].list);
    set({ regions: only(r, ALL), saved: false });
  }
  var part = function (r) { return !!SUB[r] && S.sub[r].length < SUB[r].list.length; };

  // 자료에 있는 값: 정한 순서 먼저, 나머지는 가나다
  function allOf(dm) {
    var seen = {};
    S.data.forEach(function (it) { var v = dm.of(it); if (v) seen[v] = 1; });
    return dm.order.filter(function (k) { return seen[k]; }).concat(Object.keys(seen).filter(function (k) { return dm.order.indexOf(k) < 0; }).sort(function (a, b) { return a.localeCompare(b, 'ko'); }));
  }

  function visible(it, rs) {
    if (!rs.has(it.region) || DIMS.some(function (dm) { return S.off[dm.k].indexOf(dm.of(it)) >= 0; })) return false;
    var sb = SUB[it.region];
    if (!sb) return true;
    var k = sb.key(it);
    return sb.list.indexOf(k) >= 0 ? S.sub[it.region].indexOf(k) >= 0 : !part(it.region); // 구·시를 모르는 항목은 전체일 때만
  }

  function eventsByDay() {
    var rs = new Set(S.regions), ps = new Set(S.phases), by = {};
    S.data.forEach(function (it) {
      if (!visible(it, rs)) return;
      it.phases.forEach(function (ph) {
        if (!ps.has(ph.k) || !PHK[ph.k]) return;
        (by[ph.date] = by[ph.date] || []).push({ it: it, p: phaseOf(it, ph.k) });
      });
    });
    Object.keys(by).forEach(function (k) {
      by[k].sort(function (a, b) { return a.p.i - b.p.i || a.it.name.localeCompare(b.it.name, 'ko'); });
    });
    return by;
  }

  function render() {
    var by = eventsByDay();
    var ym = S.y + '-' + pad(S.m + 1);
    var rs = new Set(S.regions), ps = new Set(S.phases);
    var anyPart = SUBS.some(part);

    // 지역·구별 이 달 단지 수 (필터와 무관)
    var counts = {}, subCounts = {}, dimCounts = { house: {}, notice: {} };
    S.data.forEach(function (it) {
      if (!it.phases.some(function (p) { return p.date.slice(0, 7) === ym; })) return;
      counts[it.region] = (counts[it.region] || 0) + 1;
      DIMS.forEach(function (dm) { var c = dimCounts[dm.k], v = dm.of(it); c[v] = (c[v] || 0) + 1; });
      if (SUB[it.region]) { var c = subCounts[it.region] = subCounts[it.region] || {}, k = SUB[it.region].key(it); c[k] = (c[k] || 0) + 1; }
    });
    var monthIds = new Set();
    Object.keys(by).forEach(function (k) { if (k.slice(0, 7) === ym) by[k].forEach(function (x) { monthIds.add(x.it.id); }); });

    var names = ALL.filter(function (r) { return rs.has(r); }).map(function (r) {
      if (!part(r)) return r;
      var l = S.sub[r];
      return l.length <= 3 ? r + '(' + l.join('·') + ')' : r + '(' + l[0] + ' 외 ' + (l.length - 1) + SUB[r].unit + ')';
    });
    var tail = DIMS.map(function (dm) {
      var all = allOf(dm), on = all.filter(function (k) { return S.off[dm.k].indexOf(k) < 0; });
      return on.length < all.length ? ' · ' + dm.title.split(' ')[0] + ' ' + (on.length <= 3 ? on.map(kindName).join('·') || '없음' : on.length + '개') : '';
    }).join('') + ' · ' + (S.m + 1) + '월 ' + monthIds.size + '개 단지';
    refs.summary.textContent = names.length === ALL.length && !anyPart ? '선택 지역: 전국' + tail
      : names.length ? '선택 지역: ' + names.join(', ') + tail : '조회할 지역을 선택해 주세요.';
    refs.save.textContent = S.saved ? '저장되었습니다' : '관심 지역 저장';
    // 휴대폰: 지역 알약 버튼 + 바텀시트
    var picked = ALL.filter(function (r) { return rs.has(r); });
    var first0 = picked.length === 1 && part(picked[0]) ? picked[0] + ' ' + S.sub[picked[0]].length + SUB[picked[0]].unit : picked[0];
    refs.regionPill.textContent = picked.length === ALL.length && !anyPart ? '전국' : !picked.length ? '지역 선택'
      : picked.length === 1 ? first0 : first0 + ' 외 ' + (picked.length - 1);
    refs.fopen.textContent = monthIds.size + '개 단지 보기';
    root.querySelector('.filter').classList.toggle('folded', S.folded);
    refs.fold.textContent = S.folded ? '지역 펼치기 ▾' : '지역 접기 ▴';
    refs.fold.setAttribute('aria-expanded', String(!S.folded));
    root.querySelector('.filter').classList.toggle('open', S.filterOpen);
    root.classList.toggle('sheet-open', S.filterOpen);
    // 아래 기관별 목록도 같은 필터로(지역·구·주택·공고 종류는 visible, 단계 체크는 접수 단계만 남긴다)
    if (S.status === 'ok') {
      var allPh = S.phases.length === PH.length, allDim = DIMS.every(function (dm) { return !S.off[dm.k].length; });
      renderSrcList(!S.srcFilter ? S.data : S.data.filter(function (it) { return visible(it, rs); }).map(function (it) {
        return allPh ? it : Object.assign({}, it, { phases: it.phases.filter(function (p) { return ps.has(p.k); }) });
      }), S.srcFilter, S.srcFilter && !(rs.size === ALL.length && !anyPart && allDim && allPh));
    }

    function subRow(r) {
      var sb = SUB[r], on = rs.has(r) ? S.sub[r].length : 0, gs = new Set(S.sub[r]), cn = subCounts[r] || {};
      return '<div class="f-row sub"><button type="button" class="f-head" data-act="suball" data-r="' + r + '">' + box(on > 0, on < sb.list.length) + '└ ' + sb.title + '</button>' +
        '<div class="f-cells">' + sb.list.map(function (u) {
          var o = rs.has(r) && gs.has(u);
          return '<button type="button" class="f-item' + (o ? ' on' : '') + '" data-act="sub" data-r="' + r + '" data-g="' + u + '">' + box(o, false, true) + u +
            (cn[u] ? '<span class="f-n">(' + cn[u] + ')</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }

    refs.groups.innerHTML = GROUPS.map(function (g, gi) {
      var on = g.items.filter(function (r) { return rs.has(r); }).length;
      var all = on === g.items.length && !g.items.some(part);
      return '<div class="f-row"><button type="button" class="f-head" data-act="group" data-i="' + gi + '">' + box(on > 0, !all) + g.name + '</button>' +
        '<div class="f-cells">' + g.items.map(function (r) {
          var o = rs.has(r), sb = SUB[r];
          var btn = '<button type="button" class="f-item' + (o ? ' on' : '') + '" data-act="region" data-r="' + r + '">' + box(o, part(r)) + r +
            (counts[r] ? '<span class="f-n">(' + counts[r] + ')</span>' : '') + '</button>';
          if (!sb) return btn;
          var open = S.subOpen === r, label = open ? sb.close : o && part(r) ? S.sub[r].length + sb.unit + ' ▾' : sb.open;
          return '<div class="f-item-wrap">' + btn + '<button type="button" class="gu-toggle' + (open ? ' open' : '') + '" data-act="subopen" data-r="' + r + '" aria-expanded="' + open + '">' + label + '</button></div>';
        }).join('') + '</div></div>' + g.items.filter(function (r) { return SUB[r] && S.subOpen === r; }).map(subRow).join('');
    }).join('') + DIMS.map(function (dm) { // 주택 종류 · 공고 종류 줄
      var vals = allOf(dm), off = new Set(S.off[dm.k]), on = vals.filter(function (k) { return !off.has(k); }).length, cn = dimCounts[dm.k];
      return '<div class="f-row kinds"><button type="button" class="f-head" data-act="kindall" data-dim="' + dm.k + '">' + box(on > 0, on < vals.length) + dm.title + '</button>' +
        '<div class="f-cells">' + vals.map(function (k) {
          var o = !off.has(k);
          return '<button type="button" class="f-item' + (o ? ' on' : '') + '" data-act="kind" data-dim="' + dm.k + '" data-k="' + esc(k) + '">' + box(o, false) + esc(kindName(k)) +
            (cn[k] ? '<span class="f-n">(' + cn[k] + ')</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');

    refs.month.textContent = S.y + '. ' + pad(S.m + 1);
    refs.legend.innerHTML = PH.map(function (p) {
      var o = ps.has(p.k);
      return '<button type="button" class="ph-toggle' + (o ? '' : ' off') + '" style="' + pvars(p) + '" data-act="phase" data-k="' + p.k + '" aria-pressed="' + o + '">' +
        '<span class="ph-box">' + (o ? '✓' : '') + '</span>' + p.label + '</button>';
    }).join('');

    // 1일이 속한 주 ~ 말일이 속한 주
    var first = new Date(S.y, S.m, 1), last = new Date(S.y, S.m + 1, 0);
    var cur = new Date(S.y, S.m, 1 - first.getDay()), end = new Date(S.y, S.m + 1, 6 - last.getDay());
    var tkey = key(today), html = '';
    while (cur <= end) {
      html += '<div class="week">';
      for (var i = 0; i < 7; i++) {
        var k = key(cur), dow = cur.getDay(), list = by[k] || [];
        var numCls = 'day-num' + (k === tkey ? ' today' : dow === 0 ? ' sun' : dow === 6 ? ' sat' : '');
        var evs = S.status === 'loading' && cur.getMonth() === S.m ? '<div class="skel"></div><div class="skel"></div>'
          : list.slice(0, 3).map(function (x) {
            return '<div class="ev" style="' + pvars(x.p) + '" title="' + esc(x.p.label + ' · ' + x.it.name) + '" data-act="open" data-id="' + esc(x.it.id) + '">' +
              '<b>' + x.p.label + '</b> ' + esc(x.it.name) + '</div>';
          }).join('') + (list.length > 3 ? '<span class="more">+' + (list.length - 3) + '건 더보기</span>' : '');
        // 휴대폰용: 그날 있는 단계 색 점 + 건수 (CSS가 폭에 따라 칩/점 중 하나만 보여줌)
        var has = {};
        list.forEach(function (x) { has[x.p.k] = true; });
        var dots = list.length ? '<div class="day-dots">' + PH.filter(function (p) { return has[p.k]; }).map(function (p) {
          return '<i style="' + pvars(p) + '"></i>';
        }).join('') + '<span>' + list.length + '건</span></div>' : '';
        html += '<div class="day' + (k === S.sel ? ' sel' : '') + (cur.getMonth() !== S.m ? ' out' : '') + '" data-act="sel" data-d="' + k + '">' +
          '<div class="day-num-row"><span class="' + numCls + '">' + cur.getDate() + '</span></div><div class="day-evs">' + evs + '</div>' + dots + '</div>';
        cur.setDate(cur.getDate() + 1);
      }
      html += '</div>';
    }
    refs.weeks.innerHTML = html;

    var item = function (x) {
      return '<button type="button" class="day-item" data-act="open" data-id="' + esc(x.it.id) + '">' +
        '<span class="day-item-top"><span class="badge" style="' + pvars(x.p) + '">' + x.p.label + '</span>' +
        '<span class="day-item-where">' + esc(x.it.region + ' ' + (x.it.district || '')) + ' · ' + esc(x.it.kind) + '</span></span>' +
        '<span class="day-item-name">' + esc(x.it.name) + '</span></button>';
    };

    // 이번 주 (휴대폰 "이번 주" 탭): 오늘부터 7일
    var wk = '', wEnd = new Date(today); wEnd.setDate(wEnd.getDate() + 6);
    for (var j = 0; j < 7; j++) {
      var wd = new Date(today); wd.setDate(wd.getDate() + j);
      var wl = by[key(wd)] || [];
      wk += '<section class="wk-day"><div class="wk-head"><span class="wk-title">' + (wd.getMonth() + 1) + '월 ' + wd.getDate() + '일 (' + W[wd.getDay()] + ')</span>' +
        (j === 0 ? '<span class="wk-today">오늘</span>' : '') + '<span class="wk-count">' + (wl.length ? wl.length + '건' : '') + '</span></div>' +
        (S.status === 'loading' ? '<div class="skel"></div>' : wl.length ? wl.map(item).join('') : '<p class="wk-empty">일정 없음</p>') + '</section>';
    }
    refs.week.innerHTML = '<div class="wk-top"><b>이번 주</b> ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일 ~ ' + (wEnd.getMonth() + 1) + '월 ' + wEnd.getDate() + '일</div>' + wk;

    var sd = parse(S.sel), sl = by[S.sel] || [];
    refs.dayTitle.textContent = (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일(' + W[sd.getDay()] + ') 일정';
    refs.dayCount.innerHTML = S.status === 'ok' ? '총 <b>' + sl.length + '</b>건' : '';
    refs.dayList.innerHTML = S.status === 'error' ? '<p class="day-empty">일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>'
      : S.status === 'loading' ? '<div class="skel"></div><div class="skel"></div>'
      : sl.length ? sl.map(item).join('') : '<p class="day-empty">선택한 지역의 일정이 없습니다.</p>';

    var u = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(S.updatedAt);
    refs.updated.textContent = u ? u[1] + '.' + u[2] + '.' + u[3] + ' ' + u[4] + ':' + u[5] : '-';

    renderModal();
  }

  // 내 청약 할 일(todo.js): 상세 창 안 접힘 칸. 유형을 바꿔도 창을 다시 그리지 않고(접힘·스크롤 유지) 목록만 바꾼다
  var TODO = window.CY_TODO;
  var todoItem = function () { return S.data.filter(function (x) { return x.id === S.modal; })[0]; };
  var todoHm = function () { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var todoTasks = function (it) { return TODO.build(it, S.todoPicks, key(new Date()), todoHm()); };
  // 우리의 집 글 주소 찾기. 열쇠는 zip/deep_targets.mjs noOf와 같다: 청약홈은 앞 공고번호, lh-·youth- 등은 id 전체
  var postLink = function (it) {
    var id = String(it.id), k = /^\d+-\d+$/.test(id) ? id.split('-')[0] : id;
    return Object.prototype.hasOwnProperty.call(S.postLinks, k) ? S.postLinks[k] : null;
  };
  var todoGroups = function (it) { // 끝난 접수 유형은 글 고르는 데 쓰지 않는다(S.todoPicks 자체는 링크용으로 둔다)
    var live = TODO.options(it, key(new Date()), todoHm()).map(function (o) { return o.k; }).filter(function (k) { return S.todoPicks.indexOf(k) >= 0; });
    return TODO.links(it, live, postLink(it));
  };
  // 달력 → 우리의 집 전환 버튼(아래 버튼 줄 셋째 칸, 2026-11-10 사용자). 글이 없는 공고엔 아무것도 그리지 않는다
  var wpButton = function (it) {
    var w = TODO && TODO.wpLink(postLink(it));
    return w ? '<a class="wp" href="' + esc(w.url) + '?utm_source=calendar&amp;utm_medium=modal" target="_blank" rel="noopener">' + esc(w.label) + '</a>' : '';
  };
  // 상세 창 옆 「자격 확인」 리모콘: 계산기 글을 새 탭으로. 청약홈 공고는 번호(#n=)로 그 단지 값을 미리 채운다(계산기가 notices.json에서 찾고, 없으면 빈 계산기)
  var calcLink = function (it) {
    var id = String(it.id), no = /^\d+-\d+$/.test(id) && !it.source ? id.split('-')[0] : '';
    return (window.CY_CALC_PAGE || '/75') + (no ? '#n=' + no : '');
  };
  function todoList(it) {
    var tasks = todoTasks(it);
    if (!tasks.length) return '<p class="todo-empty">신청할 유형을 하나 이상 골라 주세요.</p>';
    return '<ol class="todo-list">' + tasks.map(function (t) {
      return '<li><div class="todo-when">' + esc(TODO.whenText(t)) + '</div><div class="todo-what">' + esc(t.title) + (t.tip ? ' <span class="todo-tip">권장 시점</span>' : '') + '</div><div class="todo-note">' + esc(t.note) + '</div></li>';
    }).join('') + '</ol>' + (tasks.some(function (t) { return t.tip; }) ? '<p class="todo-foot todo-tipnote">권장 시점은 공고 일정이 아니라 준비를 권하는 날짜예요.</p>' : '') + '<div class="todo-links"><div class="todo-links-head">이 공고와 함께 볼 글</div>' + todoGroups(it).map(function (g) {
      return '<div class="todo-group"><b>' + esc(g.name) + '</b>' + g.items.map(function (x) { return '<a href="' + esc(TODO.linkUrl(x.path)) + '" target="_blank" rel="noopener">' + esc(x.label) + '</a>'; }).join('') + '</div>';
    }).join('') + '<p class="todo-foot">조건에 맞는지는 글에서 확인해 주세요.</p></div>';
  }
  function todoPanel(it) {
    if (!TODO) return '';
    var opts = TODO.options(it, key(new Date()), todoHm());
    if (!S.todoPicks) S.todoPicks = TODO.defaultPicks(opts);
    if (!todoTasks(it).length && !opts.length) return ''; // 남은 일정이 없는 공고
    var after = TODO.build(it, [], key(new Date()), todoHm()).length; // 유형을 모두 꺼도 남는 일정
    var picks = opts.length ? '<fieldset class="todo-picks"><legend>어디로 신청하세요?' + (after ? ' <span>이미 신청했으면 꺼 두세요. 발표·계약 일정은 남아요.</span>' : '') + '</legend>' + opts.map(function (o) {
      return '<label><input type="checkbox" data-act="todopick" data-k="' + esc(o.k) + '"' + (S.todoPicks.indexOf(o.k) >= 0 ? ' checked' : '') + '>' + esc(o.label) + '</label>';
    }).join('') + '</fieldset>' : '';
    return '<details class="todo"' + (S.todoOpen ? ' open' : '') + '><summary data-act="todotoggle">내 청약 할 일 만들기</summary><div class="todo-in">' + picks +
      (opts.length && TODO.spMissing(it) ? '<p class="todo-foot">특별공급 일정은 자료에 없어요. 특별공급이면 공고문에서 접수일을 확인해 주세요.</p>' : '') +
      '<div class="todo-btns"><button type="button" class="go" data-act="todoshare">카톡으로 나에게 보내기</button><button type="button" data-act="todoics">달력 파일 받기</button><button type="button" data-act="todocopy">목록 복사</button></div>' +
      '<div class="todo-status" data-todo="status" role="status"></div>' +
      '<div data-todo="list">' + todoList(it) + '</div>' +
      '<p class="todo-foot">일정이 정정돼도 받은 파일은 바뀌지 않아요. 보낸 링크는 열 때 최신 자료를 보여 주지만, 공고가 새 번호로 다시 올라오면 열리지 않을 수 있어요. 링크에는 공고와 고른 유형이 담겨요. ' + esc(TODO.FOOT) + '</p>' +
      '</div></details>';
  }
  function todoSay(msg) { var el = refs.modal.querySelector('[data-todo=status]'); if (el) el.textContent = msg; }
  // 고른 공고·유형을 주소에도 담아, 앱 안 브라우저에서 Chrome·Safari로 옮겨 열어도 이어지게 한다
  function todoHash() { var it = todoItem(); if (it) history.replaceState(null, '', location.pathname + location.search + TODO.linkHash(it, S.todoPicks)); }
  function focusDialog() { var b = refs.modal.querySelector('.modal-close'); if (b) b.focus({ preventScroll: true }); }
  function todoDone(method) { if (window.gtag) window.gtag('event', 'todo_download', { method: method }); } // 내려받은 횟수만. 공고·입력값은 보내지 않는다
  function todoIcs() {
    var it = todoItem(), tasks = it && todoTasks(it);
    if (!tasks || !tasks.length) return todoSay('신청할 유형을 하나 이상 골라 주세요.');
    var url = URL.createObjectURL(new Blob([TODO.ics(it, tasks, new Date(), todoGroups(it))], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = TODO.fileName(it);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    todoDone('ics');
    todoSay('달력 파일 받기를 시작했어요. 받은 파일을 열어 달력에 넣어 주세요. 받아지지 않으면 앱 안 브라우저일 수 있어요. 카톡으로 나에게 보내기나 목록 복사를 쓰거나 Chrome·Safari로 이 주소를 열어 주세요.');
  }
  function todoCopy() {
    var it = todoItem(), tasks = it && todoTasks(it);
    if (!tasks || !tasks.length) return todoSay('신청할 유형을 하나 이상 골라 주세요.');
    copyText(TODO.text(it, tasks, S.updatedAt, todoGroups(it)), 'copy', '목록을 복사했어요. 메모 앱에 붙여 넣어 주세요.');
  }
  // 휴대폰 공유창 → 사용자가 카카오톡 「나와의 채팅」을 고른다. 공유창이 없거나 막히면 복사로
  function todoShare() {
    var it = todoItem(), tasks = it && todoTasks(it);
    if (!tasks || !tasks.length) return todoSay('신청할 유형을 하나 이상 골라 주세요.');
    var body = TODO.shareText(it, tasks, location.origin + location.pathname + location.search + TODO.linkHash(it, S.todoPicks), todoGroups(it));
    var paste = function () { copyText(body, 'share-copy', '내용과 링크를 복사했어요. 카카오톡 나와의 채팅에 붙여 넣어 주세요.'); };
    if (!navigator.share || !mobile.matches) return paste(); // PC 공유창에는 보통 카카오톡이 없다
    if (S.todoSharing) return; // 공유창이 뜨는 사이 두 번 누름
    S.todoSharing = true;
    todoSay('공유창에서 카카오톡을 누른 뒤 나와의 채팅을 골라 주세요.');
    navigator.share({ title: it.name + ' 청약 할 일', text: body }).then(function () { S.todoSharing = false; todoDone('share'); todoSay(''); }, function (err) {
      S.todoSharing = false;
      if (err && err.name === 'AbortError') return todoSay(''); // 사용자가 닫음
      paste();
    });
  }
  function copyText(body, method, doneMsg) {
    var done = function () { todoDone(method); todoSay(doneMsg); };
    var old = function () { // 앱 안 브라우저 등 clipboard API가 막힌 곳
      var ta = document.createElement('textarea'), was = document.activeElement;
      ta.value = body; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      refs.modal.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* 아래 안내 */ }
      ta.remove();
      if (was && was.focus) was.focus({ preventScroll: true });
      if (ok) return done();
      todoSay('복사하지 못했어요. 아래 칸을 길게 눌러 복사해 주세요.');
      var show = document.createElement('textarea');
      show.className = 'todo-manual'; show.value = body; show.readOnly = true; show.setAttribute('aria-label', '복사할 내용');
      refs.modal.querySelector('[data-todo=status]').appendChild(show);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(done, old);
    else old();
  }

  // 개인 링크(#todo=공고&p=유형)로 열기. 공고가 자료에서 빠졌으면 안내
  function openFromHash() {
    var link = TODO && TODO.parseHash(location.hash);
    if (!link) return;
    var it = S.data.filter(function (x) { return x.id === link.id; })[0];
    S.todoFromLink = true;
    if (!it) { set({ modal: null, todoMissing: true }); return focusDialog(); }
    // 링크에 유형이 있으면 그 선택을 지킨다. 끝난 접수만 남았으면 빈 선택 → 발표·계약만(고른 적 없는 유형을 켜지 않는다)
    set({ modal: it.id, todoMissing: false, todoOpen: true, todoPicks: link.picks });
    focusDialog();
  }
  function onHashChange() {
    if (TODO && TODO.parseHash(location.hash)) return openFromHash();
    if (S.todoFromLink) { S.todoFromLink = false; set({ modal: null, todoMissing: false }); } // 뒤로 가기
  }
  function closeModal() {
    if (/^#todo=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + (document.body.classList.contains('m-tab-week') ? '#week' : ''));
    S.todoFromLink = false;
    set({ modal: null, todoMissing: false });
  }

  function renderModal() {
    var it = S.modal && S.data.filter(function (x) { return x.id === S.modal; })[0];
    document.body.style.overflow = it || S.todoMissing || (S.filterOpen && mobile.matches) ? 'hidden' : '';
    if (!it && S.todoMissing) {
      refs.modal.innerHTML = '<div class="overlay" data-act="close"><div class="modal" role="dialog" aria-modal="true" aria-label="공고를 찾을 수 없어요" data-act="noop">' +
        '<div class="modal-head"><div class="modal-name">공고를 찾을 수 없어요</div><button type="button" class="modal-close" data-act="close" aria-label="닫기">✕</button></div>' +
        '<div class="modal-body"><p class="todo-empty">이 링크의 공고가 일정 자료에서 빠졌어요. 접수가 끝난 지 오래됐거나 공고가 바뀌었을 수 있어요. 달력에서 다시 찾아 주세요.</p></div></div></div>';
      return;
    }
    if (!it) { refs.modal.innerHTML = ''; return; }
    var fmt = function (s) { var d = parse(s); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' (' + W[d.getDay()] + ')'; };
    var rows = '<div class="th">공급 세대</div><div>' + (it.units ? it.units.toLocaleString() + '세대' : '-') + '</div>' +
      '<div class="th">분양가(3.3㎡)</div><div>' + (it.pricePerPyeong ? it.pricePerPyeong.toLocaleString() + '만원' : '-') + '</div>' +
      it.phases.filter(function (p) { return PHK[p.k]; })
        .sort(function (a, b) { return PHK[a.k].i - PHK[b.k].i; })
        .map(function (ph) {
          var p = phaseOf(it, ph.k);
          return '<div class="th"><span class="tl-dot" style="' + pvars(p) + '"></span>' + p.full + '</div><div>' + fmt(ph.date) + '</div>';
        }).join('');
    var go = safeUrl(it.applyhomeUrl), home = safeUrl(it.homepageUrl), youth = it.kind === '청년안심주택';
    refs.modal.innerHTML = '<div class="overlay" data-act="close"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(it.name) + '" data-act="noop">' +
      '<div class="modal-head"><div><div class="modal-where">' + esc(it.region + ' ' + (it.district || '')) + ' · ' + esc(it.kind) + '</div>' +
      '<div class="modal-name">' + esc(it.name) + '</div></div>' +
      '<button type="button" class="modal-close" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="modal-body"><div class="mtable">' + rows + '</div>' + todoPanel(it) +
      '<a class="modal-calc" href="' + esc(calcLink(it)) + '" target="_blank" rel="noopener">이 단지로 대출·특공 자격 확인 →</a>' +
      '<div class="modal-btns">' + (go ? '<a class="go" href="' + esc(go) + '" target="_blank" rel="noopener">' + (youth ? '청년안심주택 공고' : it.source === 'lh' ? 'LH청약플러스 공고' : it.source === 'sh' ? 'SH 공고 원문' : '청약홈 바로가기') + '</a>' : '') +
      (home ? '<a href="' + esc(home) + '" target="_blank" rel="noopener">' + (youth ? '청약신청 페이지' : it.source === 'sh' ? 'SH 홈페이지' : '분양 홈페이지') + '</a>' : '') + '<span data-ref="wpslot">' + wpButton(it) + '</span></div></div></div>' +
      '<a class="modal-remote" href="' + esc(calcLink(it)) + '" target="_blank" rel="noopener" data-act="noop">자격 확인<small>이 단지<br>대출·특공</small></a></div>';
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    var d = t.dataset;
    switch (d.act) {
      case 'all': return set({ regions: ALL.slice(), sub: fullSub(), off: { house: [], notice: [] }, saved: false });
      case 'kindall': S.off[d.dim] = S.off[d.dim].length ? [] : allOf(DIM[d.dim]); return set({ saved: false });
      case 'kind': {
        var cur0 = S.off[d.dim], ko = cur0.filter(function (x) { return x !== d.k; });
        if (ko.length === cur0.length) ko.push(d.k);
        S.off[d.dim] = ko;
        return set({ saved: false });
      }
      case 'srcfilter':
        try { localStorage.setItem(STORE_SRCF, S.srcFilter ? '0' : '1'); } catch (err) { /* 저장 불가 */ }
        return set({ srcFilter: !S.srcFilter });
      case 'none': return setRegions([]); // 구 선택은 그대로 둔다
      case 'save':
        try {
          localStorage.setItem(STORE, JSON.stringify(S.regions));
          SUBS.forEach(function (r) { localStorage.setItem(SUB[r].store, JSON.stringify(S.sub[r])); });
          DIMS.forEach(function (dm) { localStorage.setItem(dm.store, JSON.stringify(S.off[dm.k])); });
        } catch (err) { /* 저장 불가 */ }
        return set({ saved: true });
      case 'group': {
        var g = GROUPS[+d.i], s = new Set(S.regions);
        var all = g.items.every(function (r) { return s.has(r); }) && !g.items.some(part);
        g.items.forEach(function (r) { if (all) s.delete(r); else s.add(r); });
        if (!all) g.items.forEach(function (r) { if (SUB[r]) S.sub[r] = SUB[r].list.slice(); });
        return setRegions(ALL.filter(function (r) { return s.has(r); }));
      }
      case 'region': {
        var s2 = new Set(S.regions);
        if (s2.has(d.r)) s2.delete(d.r);
        else { s2.add(d.r); if (SUB[d.r] && !S.sub[d.r].length) S.sub[d.r] = SUB[d.r].list.slice(); }
        return setRegions(ALL.filter(function (r) { return s2.has(r); }));
      }
      case 'subopen': return set({ subOpen: S.subOpen === d.r ? '' : d.r });
      case 'suball': return setSub(d.r, S.regions.indexOf(d.r) >= 0 && !part(d.r) ? [] : SUB[d.r].list.slice());
      case 'sub': {
        var gs = new Set(S.regions.indexOf(d.r) >= 0 ? S.sub[d.r] : []);
        if (gs.has(d.g)) gs.delete(d.g); else gs.add(d.g);
        return setSub(d.r, SUB[d.r].list.filter(function (x) { return gs.has(x); }));
      }
      case 'phase': {
        var p = new Set(S.phases);
        if (p.has(d.k)) p.delete(d.k); else p.add(d.k);
        return set({ phases: PH.map(function (x) { return x.k; }).filter(function (k) { return p.has(k); }) });
      }
      case 'prev': return set(S.m === 0 ? { y: S.y - 1, m: 11 } : { m: S.m - 1 });
      case 'next': return set(S.m === 11 ? { y: S.y + 1, m: 0 } : { m: S.m + 1 });
      case 'today': return set({ y: today.getFullYear(), m: today.getMonth(), sel: key(today) });
      case 'fopen': return set({ filterOpen: true });
      case 'fclose': return set({ filterOpen: false });
      case 'fold':
        try { localStorage.setItem(STORE_FOLD, S.folded ? '0' : '1'); } catch (err) { /* 저장 불가 */ }
        return set({ folded: !S.folded });
      case 'tocal': return root.querySelector('.cal-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      case 'sel': {
        set({ sel: d.d });
        // 휴대폰: 목록이 화면 아래에 있으면 목록으로 내려 준다
        var card = root.querySelector('.day-card');
        if (mobile.matches && card.getBoundingClientRect().top > window.innerHeight - 140) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      case 'open':
        S.todoFromLink = false;
        set({ modal: d.id, todoPicks: null, todoOpen: false });
        return focusDialog();
      case 'todotoggle': return todoHash();
      case 'todoshare': return todoShare();
      case 'todopick': {
        var tk = S.todoPicks.filter(function (x) { return x !== d.k; });
        if (t.checked) tk.push(d.k);
        S.todoPicks = tk;
        refs.modal.querySelector('[data-todo=list]').innerHTML = todoList(todoItem());
        todoHash();
        return todoSay('');
      }
      case 'todoics': return todoIcs();
      case 'todocopy': return todoCopy();
      case 'close': return closeModal();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (S.modal || S.todoMissing) closeModal();
    else if (S.filterOpen) set({ filterOpen: false });
  });

  // 홈 첫 화면 "이번 주 청약 일정"(디자인 A): 월~일 기준 접수·발표·계약 수와 시·도 타일 지도. 주간 글(posts/weekly.mjs build)과 같은 규칙.
  // 이번 주(월~일) 접수가 있는 공고와, 그중 아직 끝나지 않은 접수(left). 홈 블록과 달력 페이지 기관별 목록이 같이 쓴다
  // 공고 출처별로 나눠 보여 준다(2026-10-28): 청약홈 분양을 맨 위에 두고 LH·SH·서울시 순
  // 함수 선언으로 둔다: 홈은 아래 달력 코드 앞에서 return하므로 var 대입은 실행되지 않는다
  function srcList() { return [
    { k: 'applyhome', name: '청약홈', full: '청약홈(한국부동산원)', note: '분양·무순위·임의공급' },
    { k: 'lh', name: 'LH 청약플러스', full: 'LH 청약플러스', note: '공공임대·행복주택' },
    { k: 'sh', name: 'SH 서울주택도시공사', full: 'SH 서울주택도시공사', note: '장기전세·사회주택' },
    { k: 'youth', name: '서울시 청년안심주택', full: '서울시 청년안심주택', note: '청년·신혼 임대' }
  ]; }
  function srcOf(it) { return /^lh-/.test(it.id) ? 'lh' : /^sh-/.test(it.id) ? 'sh' : /^youth-/.test(it.id) ? 'youth' : 'applyhome'; }
  function thisWeek(items) {
    var mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var a = key(mon), b = key(sun), t = key(today);
    var inWeek = function (s) { return s >= a && s <= b; };
    var hit = function (p) { return p.date <= b && (p.end || p.date) >= a; };
    var w = { mon: mon, sun: sun, t: t, rec: [], left: [], win: 0, con: 0, reg: {} };
    items.forEach(function (it) {
      var ph = it.phases.filter(hit);
      var r = ph.filter(function (p) { return p.k === 'sp' || p.k === 'p1' || p.k === 'p2'; });
      if (r.length) { w.rec.push({ it: it, p: r[0] }); w.reg[it.region] = (w.reg[it.region] || 0) + 1; }
      // 목록은 아직 끝나지 않은 접수만(오늘 이후로 남은 첫 접수 단계). 숫자·지도는 이번 주 전체
      var up = r.filter(function (p) { return (p.end || p.date) >= t; });
      if (up.length) w.left.push({ it: it, p: up[0] });
      w.win += ph.filter(function (p) { return p.k === 'win'; }).length;
      w.con += ph.filter(function (p) { return p.k === 'con' && (inWeek(p.date) || (p.end && inWeek(p.end))); }).length;
    });
    w.left.sort(function (x, y) { return x.p.date.localeCompare(y.p.date) || x.it.name.localeCompare(y.it.name, 'ko'); });
    return w;
  }
  function md(s) { var d = parse(s); return (d.getMonth() + 1) + '.' + pad(d.getDate()) + '(' + W[d.getDay()] + ')'; }
  function heroRow(x, t) {
    var u = safeUrl(x.it.applyhomeUrl), tag = u ? 'a' : 'div';
    return '<' + tag + ' class="hero-row"' + (u ? ' href="' + esc(u) + '" target="_blank" rel="noopener"' : '') + '>' +
      '<span class="when">' + (x.p.date < t ? '~' + md(x.p.end || x.p.date) + '까지' : md(x.p.date)) + ' ' + phaseOf(x.it, x.p.k).label + '</span>' +
      '<span class="name">' + esc(x.it.name) + '</span>' +
      '<span class="where">' + esc(x.it.region + ' ' + (x.it.district || '')) + '</span>' +
      '<span class="kind">' + esc(x.it.kind) + '</span>' +
      '<span class="units">' + (x.it.units ? x.it.units.toLocaleString() + '세대' : '') + '</span></' + tag + '>';
  }
  // 달력 페이지: 기관별 이번 주 남은 접수 전체 목록(홈 블록의 「자세히 보기」가 #src-기관으로 온다)
  // on: 제목 옆 토글(달력 필터 적용 켜기·끄기, 2026-11-10 사용자). filtered: 켜져 있고 위 필터가 전체가 아닐 때 — 빈 칸 문구를 바꾼다
  function renderSrcList(items, on, filtered) {
    var box = document.querySelector('[data-srclist]');
    if (!box) return;
    var w = thisWeek(items);
    var sig = (on ? 'o' : '') + (filtered ? 'f' : '') + w.left.map(function (x) { return x.it.id + x.p.k; }).join();
    if (box.dataset.sig === sig) return; // 목록이 그대로면 다시 그리지 않는다(칸 안 스크롤 위치 유지)
    var first = !box.dataset.sig;
    box.dataset.sig = sig;
    box.innerHTML = '<div class="hero-list-head"><h2>이번 주 남은 접수</h2><button type="button" class="src-toggle" data-act="srcfilter" role="switch" aria-checked="' + !!on + '"><span class="sw" aria-hidden="true"></span>달력 필터 적용</button></div><div class="hero-list">' + srcList().map(function (g) {
      var xs = w.left.filter(function (x) { return srcOf(x.it) === g.k; });
      return '<div class="hero-group" id="src-' + g.k + '"><div class="hero-group-head"><i class="src-logo src-' + g.k + '" aria-hidden="true"></i><b>' + esc(g.full) + '</b>' + (g.note ? '<span>' + esc(g.note) + '</span>' : '') + '<em>' + xs.length + '곳</em></div>' +
        (xs.length ? '<div class="src-rows' + (xs.length > 3 ? ' is-long' : '') + '">' + xs.map(function (x) { return heroRow(x, w.t); }).join('') + '</div>' : '<p class="hero-empty">' + (filtered ? '선택한 조건에 맞는 ' : '') + '이번 주 남은 접수가 없습니다.</p>') + '</div>';
    }).join('') + '</div>';
    if (!first) return;
    var m = /^#src-(\w+)$/.exec(location.hash), el = m && document.getElementById('src-' + m[1]);
    if (el) { el.classList.add('is-target'); el.scrollIntoView({ block: 'start' }); }
  }

  // 홈 「전체 청약 달력 보기」에 마우스를 올리면 지역 지도 칸이 차례로 뒤집히며 이번 달 달력으로 바뀐다(2026-11-10 사용자).
  // 날짜마다 그날 시작하는 접수·당첨자 발표·계약 수를 단계 색 칸으로. 마우스가 있는 화면에서만(휴대폰은 그대로 이동)
  function monthFace(items) {
    var y = today.getFullYear(), m = today.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    var pre = key(first).slice(0, 8), by = {}, cal = (document.querySelector('.hero-cta') || { getAttribute: function () { return CAL_PATH; } }).getAttribute('href');
    items.forEach(function (it) {
      it.phases.forEach(function (p) {
        var g = p.k === 'sp' || p.k === 'p1' || p.k === 'p2' ? 'r' : p.k === 'win' ? 'w' : p.k === 'con' ? 'c' : '';
        if (!g || p.date.slice(0, 8) !== pre) return;
        var d = +p.date.slice(8), o = by[d] = by[d] || { r: {}, w: {}, c: {} };
        o[g][it.id] = 1; // 같은 공고의 특공·1순위·2순위는 한 곳으로 센다
      });
    });
    var cnt = function (o) { return Object.keys(o).length; };
    var cells = W.split('').map(function (c, i) { return '<span class="mc-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '" style="--i:' + i + '">' + c + '</span>'; });
    for (var b = 0; b < first.getDay(); b++) cells.push('<span class="mc-day is-pad" style="--i:' + cells.length + '"></span>');
    for (var d = 1; d <= days; d++) {
      var o = by[d], tags = o ? ['r', 'w', 'c'].map(function (g) { var n = cnt(o[g]); return '<i class="mc-' + g + (n ? '' : ' is-empty') + '">' + (n || '') + '</i>'; }).join('') : ''; // 접수·발표·계약 자리 고정
      var dow = (first.getDay() + d - 1) % 7;
      cells.push('<a class="mc-day' + (d === today.getDate() ? ' is-today' : '') + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') + '" style="--i:' + cells.length + '" href="' + esc(cal) + '#d=' + pre + (d < 10 ? '0' : '') + d + '" tabindex="-1"><b>' + d + '</b><span class="mc-tags">' + tags + '</span></a>');
    }
    return '<div class="map-cal" aria-hidden="true"><div class="mc-head">' + (m + 1) + '월 청약달력 <span><i class="mc-r"></i>접수 <i class="mc-w"></i>발표 <i class="mc-c"></i>계약</span></div><div class="mc-grid" style="grid-template-rows: 20px repeat(' + Math.ceil((first.getDay() + days) / 7) + ', 60px)">' + cells.join('') + '</div><div class="mc-foot">날짜를 누르면 그날 일정을 크게 볼 수 있어요 →</div></div>';
  }
  function flipOnHover() {
    var cta = document.querySelector('.hero-cta'), box = document.querySelector('.hero-map');
    if (!cta || !box || cta.dataset.flip || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    cta.dataset.flip = '1';
    // 버튼에서 달력으로 마우스를 옮기는 동안은 달력을 유지한다(달력 날짜 칸을 누를 수 있게)
    var label = cta.textContent, timer = 0;
    var on = function () { clearTimeout(timer); box.classList.add('is-cal'); cta.classList.add('is-go'); cta.textContent = '달력 페이지로 이동'; };
    var off = function () { box.classList.remove('is-cal'); cta.classList.remove('is-go'); cta.textContent = label; };
    var later = function () { clearTimeout(timer); timer = setTimeout(off, 700); };
    cta.addEventListener('mouseenter', on); cta.addEventListener('mouseleave', later);
    box.addEventListener('mouseenter', function () { if (box.classList.contains('is-cal')) on(); });
    box.addEventListener('mouseleave', later);
    cta.addEventListener('focus', on); cta.addEventListener('blur', off);
  }

  function renderHero(items, updatedAt, failed) {
    var MAP = ['인천', '서울', '경기', '강원', '충남', '세종', '충북', '경북', '전북', '대전', '대구', '울산', '광주', '전남', '경남', '부산', '제주'];
    var h = {};
    document.querySelectorAll('[data-hero]').forEach(function (el) { h[el.dataset.hero] = el; });
    if (!h.map) return;
    var w = thisWeek(items), mon = w.mon, sun = w.sun;
    h.date.textContent = (mon.getMonth() + 1) + '월 ' + mon.getDate() + '일 ~ ' + (sun.getMonth() + 1) + '월 ' + sun.getDate() + '일';
    if (failed) { h.list.innerHTML = '<p class="hero-empty">일정을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>'; return; }
    var rec = w.rec, left = w.left, win = w.win, con = w.con, reg = w.reg;
    var n = function (v) { return v + '<small>곳</small>'; };
    h.receipt.innerHTML = n(rec.length); h.win.innerHTML = n(win); h.con.innerHTML = n(con);
    h.updated.textContent = (updatedAt || '').replace('T', ' ').slice(0, 16).replace(/-/g, '.');
    var lv = function (v) { return v >= 5 ? 4 : v >= 3 ? 3 : v; };
    h.map.innerHTML = MAP.map(function (r, i) {
      var v = reg[r] || 0;
      return '<div class="tile l' + lv(v) + '" style="--i:' + i + '"><span>' + r + '</span><b>' + (v || '') + '</b></div>';
    }).join('') + monthFace(items);
    flipOnHover();
    // 기관별 블록 4개(2026-11-10 사용자): 목록은 달력 페이지에서. 남은 접수가 없는 기관도 0곳으로 보여 준다
    var CAL = (document.querySelector('[data-hero=more]') || {}).getAttribute ? document.querySelector('[data-hero=more]').getAttribute('href') : '/category/청약일정';
    h.list.innerHTML = srcList().map(function (g) {
      var n = left.filter(function (x) { return srcOf(x.it) === g.k; }).length;
      return '<a class="src-block' + (n ? '' : ' is-zero') + '" href="' + esc(CAL) + '#src-' + g.k + '">' +
        '<span class="src-top"><i class="src-logo src-' + g.k + '" aria-hidden="true"></i><b>' + esc(g.name) + '</b></span>' +
        '<span class="src-note">' + esc(g.note) + '</span>' +
        '<span class="src-bottom"><span class="src-more">자세히 보기 →</span><strong>' + n + '<small>곳</small></strong></span></a>';
    }).join('');
    h.more.textContent = '달력에서 전체 보기';
    if (!left.length) h.list.insertAdjacentHTML('beforeend', '<p class="hero-empty src-empty">' + (rec.length ? '이번 주 접수는 모두 끝났습니다. 다음 주 일정은 달력에서 볼 수 있어요.' : '이번 주에는 접수가 있는 단지가 없습니다.') + '</p>');
  }

  render();
  loadSchedule().then(function (j) {
    set({ data: j.items, updatedAt: j.updatedAt, status: 'ok' }); // render()가 기관별 목록도 그린다
    openFromHash();
    window.addEventListener('hashchange', onHashChange);
    // 공고번호 → 우리의 집 글 주소(zip/publish.mjs가 만드는 crawler/auleezip_links.json). 못 받아도 달력·할 일은 그대로
    if (TODO) fetch(SCHEDULE_URL().replace(/[^\/]*$/, '') + 'auleezip_links.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      S.postLinks = d;
      var it = todoItem(), box = it && refs.modal.querySelector('[data-todo=list]'), slot = it && refs.modal.querySelector('[data-ref=wpslot]');
      if (box) box.innerHTML = todoList(it);
      if (slot) slot.innerHTML = wpButton(it);
    }).catch(function () { /* 우리의 집 링크만 빠진다 */ });
  }, function (err) {
    console.warn('청약 일정 불러오기 실패:', err);
    set({ status: 'error' });
  });

  // 스킨을 다시 올리면 스킨 옵션이 비워질 수 있어서, 비어 있으면 이 프로젝트의 배포 주소를 쓴다
  function SCHEDULE_URL() { return window.CHEONGYAK_SCHEDULE_URL || 'https://juholee97.github.io/cheongyak_blog/schedule.json'; }
  function loadSchedule() {
    return fetch(SCHEDULE_URL(), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (j) {
      var items = (j.items || []).filter(function (it) { return it && it.id && it.name && Array.isArray(it.phases); });
      return { items: items, updatedAt: j.updatedAt || '' };
    });
  }
})();
