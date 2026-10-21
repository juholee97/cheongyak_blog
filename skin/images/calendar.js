/* 청약달력 v2 — 홈 캘린더 (바닐라 JS, ES2017) */
(function () {
  'use strict';

  // 카테고리 개수 "(12)" → "12" (모든 페이지)
  document.querySelectorAll('.side-category .c_cnt').forEach(function (e) {
    e.textContent = e.textContent.replace(/[()\s]/g, '');
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

  var root = document.getElementById('cal');
  if (!root || document.body.id !== 'tt-body-index') return;

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
  var STORE = 'cheongyak-regions', STORE_GU = 'cheongyak-seoul-gu';

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
  // APT 말고는 순위가 없으니 p1을 "접수"로
  var phaseOf = function (item, k) {
    var p = PHK[k];
    return k === 'p1' && item.kind !== 'APT' ? Object.assign({}, p, { label: '접수', full: '접수' }) : p;
  };
  var load = function (k, allowed) {
    try {
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      if (Array.isArray(v)) return only(v, allowed);
    } catch (e) { /* 저장소 막힘 */ }
    return allowed.slice();
  };

  var today = new Date();
  var S = {
    regions: load(STORE, ALL), gu: load(STORE_GU, GU), guOpen: false,
    phases: PH.map(function (p) { return p.k; }),
    y: today.getFullYear(), m: today.getMonth(), sel: key(today),
    modal: null, saved: false, data: [], status: 'loading', updatedAt: '',
  };

  var refs = {};
  root.querySelectorAll('[data-ref]').forEach(function (el) { refs[el.dataset.ref] = el; });

  function set(patch) { Object.assign(S, patch); render(); }
  function setRegions(list) { set({ regions: only(list, ALL), saved: false }); }
  // 구를 하나라도 고르면 서울 선택, 전부 빼면 서울 해제
  function setGu(list) {
    var r = S.regions.filter(function (x) { return x !== '서울'; });
    if (list.length) r.push('서울');
    set({ gu: only(list, GU), regions: only(r, ALL), saved: false });
  }

  function visible(it, rs, gs) {
    if (!rs.has(it.region)) return false;
    if (it.region !== '서울') return true;
    return it.district ? gs.has(it.district) : S.gu.length === GU.length; // 구를 모르는 서울 항목은 25개 구 전체일 때만
  }

  function eventsByDay() {
    var rs = new Set(S.regions), gs = new Set(S.gu), ps = new Set(S.phases), by = {};
    S.data.forEach(function (it) {
      if (!visible(it, rs, gs)) return;
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
    var rs = new Set(S.regions), gs = new Set(S.gu), ps = new Set(S.phases);
    var guPart = S.gu.length < GU.length;

    // 지역·구별 이 달 단지 수 (필터와 무관)
    var counts = {}, guCounts = {};
    S.data.forEach(function (it) {
      if (!it.phases.some(function (p) { return p.date.slice(0, 7) === ym; })) return;
      counts[it.region] = (counts[it.region] || 0) + 1;
      if (it.region === '서울' && it.district) guCounts[it.district] = (guCounts[it.district] || 0) + 1;
    });
    var monthIds = new Set();
    Object.keys(by).forEach(function (k) { if (k.slice(0, 7) === ym) by[k].forEach(function (x) { monthIds.add(x.it.id); }); });

    var names = ALL.filter(function (r) { return rs.has(r); }).map(function (r) {
      if (r !== '서울' || !guPart) return r;
      return S.gu.length <= 3 ? '서울(' + S.gu.join('·') + ')' : '서울(' + S.gu[0] + ' 외 ' + (S.gu.length - 1) + '개 구)';
    });
    var tail = ' · ' + (S.m + 1) + '월 ' + monthIds.size + '개 단지';
    refs.summary.textContent = names.length === ALL.length && !guPart ? '선택 지역: 전국' + tail
      : names.length ? '선택 지역: ' + names.join(', ') + tail : '조회할 지역을 선택해 주세요.';
    refs.save.textContent = S.saved ? '저장되었습니다' : '관심 지역 저장';

    var guOn = rs.has('서울') ? S.gu.length : 0;
    var subRow = '<div class="f-row sub"><button type="button" class="f-head" data-act="guall">' + box(guOn > 0, guOn < GU.length) + '└ 서울 자치구</button>' +
      '<div class="f-cells">' + GU.map(function (u) {
        var o = rs.has('서울') && gs.has(u);
        return '<button type="button" class="f-item' + (o ? ' on' : '') + '" data-act="gu" data-g="' + u + '">' + box(o, false, true) + u +
          (guCounts[u] ? '<span class="f-n">(' + guCounts[u] + ')</span>' : '') + '</button>';
      }).join('') + '</div></div>';

    refs.groups.innerHTML = GROUPS.map(function (g, gi) {
      var hasSeoul = g.items.indexOf('서울') >= 0;
      var on = g.items.filter(function (r) { return rs.has(r); }).length;
      var all = on === g.items.length && !(hasSeoul && guPart);
      return '<div class="f-row"><button type="button" class="f-head" data-act="group" data-i="' + gi + '">' + box(on > 0, !all) + g.name + '</button>' +
        '<div class="f-cells">' + g.items.map(function (r) {
          var o = rs.has(r), seoul = r === '서울';
          var btn = '<button type="button" class="f-item' + (o ? ' on' : '') + '" data-act="region" data-r="' + r + '">' + box(o, seoul && guPart) + r +
            (counts[r] ? '<span class="f-n">(' + counts[r] + ')</span>' : '') + '</button>';
          if (!seoul) return btn;
          var label = S.guOpen ? '자치구 접기 ▴' : o && guPart ? S.gu.length + '개 구 ▾' : '자치구별 ▾';
          return '<div class="f-item-wrap">' + btn + '<button type="button" class="gu-toggle' + (S.guOpen ? ' open' : '') + '" data-act="guopen" aria-expanded="' + S.guOpen + '">' + label + '</button></div>';
        }).join('') + '</div></div>' + (hasSeoul && S.guOpen ? subRow : '');
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
        html += '<div class="day' + (k === S.sel ? ' sel' : '') + (cur.getMonth() !== S.m ? ' out' : '') + '" data-act="sel" data-d="' + k + '">' +
          '<div class="day-num-row"><span class="' + numCls + '">' + cur.getDate() + '</span></div><div class="day-evs">' + evs + '</div></div>';
        cur.setDate(cur.getDate() + 1);
      }
      html += '</div>';
    }
    refs.weeks.innerHTML = html;

    var sd = parse(S.sel), sl = by[S.sel] || [];
    refs.dayTitle.textContent = (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일(' + W[sd.getDay()] + ') 일정';
    refs.dayCount.innerHTML = S.status === 'ok' ? '총 <b>' + sl.length + '</b>건' : '';
    refs.dayList.innerHTML = S.status === 'error' ? '<p class="day-empty">일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>'
      : S.status === 'loading' ? '<div class="skel"></div><div class="skel"></div>'
      : sl.length ? sl.map(function (x) {
        return '<button type="button" class="day-item" data-act="open" data-id="' + esc(x.it.id) + '">' +
          '<span class="day-item-top"><span class="badge" style="' + pvars(x.p) + '">' + x.p.label + '</span>' +
          '<span class="day-item-where">' + esc(x.it.region + ' ' + (x.it.district || '')) + ' · ' + esc(x.it.kind) + '</span></span>' +
          '<span class="day-item-name">' + esc(x.it.name) + '</span></button>';
      }).join('') : '<p class="day-empty">선택한 지역의 일정이 없습니다.</p>';

    var u = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(S.updatedAt);
    refs.updated.textContent = u ? u[1] + '.' + u[2] + '.' + u[3] + ' ' + u[4] + ':' + u[5] : '-';

    renderModal();
  }

  function renderModal() {
    var it = S.modal && S.data.filter(function (x) { return x.id === S.modal; })[0];
    document.body.style.overflow = it ? 'hidden' : '';
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
    var go = safeUrl(it.applyhomeUrl), home = safeUrl(it.homepageUrl);
    refs.modal.innerHTML = '<div class="overlay" data-act="close"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(it.name) + '" data-act="noop">' +
      '<div class="modal-head"><div><div class="modal-where">' + esc(it.region + ' ' + (it.district || '')) + ' · ' + esc(it.kind) + '</div>' +
      '<div class="modal-name">' + esc(it.name) + '</div></div>' +
      '<button type="button" class="modal-close" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="modal-body"><div class="mtable">' + rows + '</div>' +
      '<div class="modal-btns">' + (go ? '<a class="go" href="' + esc(go) + '" target="_blank" rel="noopener">청약홈 바로가기</a>' : '') +
      (home ? '<a href="' + esc(home) + '" target="_blank" rel="noopener">분양 홈페이지</a>' : '') + '</div></div></div></div>';
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    var d = t.dataset;
    switch (d.act) {
      case 'all': return set({ regions: ALL.slice(), gu: GU.slice(), saved: false });
      case 'none': return setRegions([]); // 구 선택은 그대로 둔다
      case 'save':
        try {
          localStorage.setItem(STORE, JSON.stringify(S.regions));
          localStorage.setItem(STORE_GU, JSON.stringify(S.gu));
        } catch (err) { /* 저장 불가 */ }
        return set({ saved: true });
      case 'group': {
        var g = GROUPS[+d.i], s = new Set(S.regions), seoulIn = g.items.indexOf('서울') >= 0;
        var all = g.items.every(function (r) { return s.has(r); }) && !(seoulIn && S.gu.length < GU.length);
        g.items.forEach(function (r) { if (all) s.delete(r); else s.add(r); });
        if (!all && seoulIn) S.gu = GU.slice();
        return setRegions(ALL.filter(function (r) { return s.has(r); }));
      }
      case 'region': {
        var s2 = new Set(S.regions);
        if (s2.has(d.r)) s2.delete(d.r);
        else { s2.add(d.r); if (d.r === '서울' && !S.gu.length) S.gu = GU.slice(); }
        return setRegions(ALL.filter(function (r) { return s2.has(r); }));
      }
      case 'guopen': return set({ guOpen: !S.guOpen });
      case 'guall': return setGu(S.regions.indexOf('서울') >= 0 && S.gu.length === GU.length ? [] : GU.slice());
      case 'gu': {
        var gs = new Set(S.regions.indexOf('서울') >= 0 ? S.gu : []);
        if (gs.has(d.g)) gs.delete(d.g); else gs.add(d.g);
        return setGu(GU.filter(function (x) { return gs.has(x); }));
      }
      case 'phase': {
        var p = new Set(S.phases);
        if (p.has(d.k)) p.delete(d.k); else p.add(d.k);
        return set({ phases: PH.map(function (x) { return x.k; }).filter(function (k) { return p.has(k); }) });
      }
      case 'prev': return set(S.m === 0 ? { y: S.y - 1, m: 11 } : { m: S.m - 1 });
      case 'next': return set(S.m === 11 ? { y: S.y + 1, m: 0 } : { m: S.m + 1 });
      case 'today': return set({ y: today.getFullYear(), m: today.getMonth(), sel: key(today) });
      case 'sel': return set({ sel: d.d });
      case 'open': return set({ modal: d.id });
      case 'close': return set({ modal: null });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.modal) set({ modal: null });
  });

  render();
  var url = window.CHEONGYAK_SCHEDULE_URL;
  (url ? fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }) : Promise.reject(new Error('schedule-url 스킨 옵션이 비어 있음')))
    .then(function (j) {
      var items = (j.items || []).filter(function (it) { return it && it.id && it.name && Array.isArray(it.phases); });
      set({ data: items, updatedAt: j.updatedAt || '', status: 'ok' });
    })
    .catch(function (err) {
      console.warn('청약 일정 불러오기 실패:', err);
      set({ status: 'error' });
    });
})();
