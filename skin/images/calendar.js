/* 청약달력 — 홈 캘린더 (바닐라 JS, ES2017) */
(function () {
  'use strict';

  // 카테고리 개수 "(12)" → "12" (모든 페이지)
  document.querySelectorAll('.side-category .c_cnt').forEach(function (e) {
    e.textContent = e.textContent.replace(/[()\s]/g, '');
  });

  var root = document.getElementById('cal');
  if (!root || document.body.id !== 'tt-body-index') return;

  var GROUPS = [
    { name: '수도권', items: ['서울', '경기', '인천'] },
    { name: '광역시', items: ['부산', '대구', '광주', '대전', '울산', '세종'] },
    { name: '지방', items: ['강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] },
  ];
  var ALL = GROUPS.reduce(function (a, g) { return a.concat(g.items); }, []);
  var PH = [
    { k: 'sp', label: '특공', full: '특공 접수', c: '#2f62d6', bg: '#e8eefc' },
    { k: 'p1', label: '1순위', full: '1순위 접수', c: '#0b7a55', bg: '#e3f3ec' },
    { k: 'p2', label: '2순위', full: '2순위 접수', c: '#b86a00', bg: '#fcf0dc' },
    { k: 'win', label: '발표', full: '당첨자 발표', c: '#c42f62', bg: '#fbe7ee' },
    { k: 'con', label: '계약', full: '계약', c: '#6a4fc4', bg: '#efeafb' },
  ];
  var PHK = {};
  PH.forEach(function (p, i) { PHK[p.k] = Object.assign({ i: i }, p); });
  var W = '일월화수목금토';
  var STORE = 'cheongyak-regions';

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
  // 오피스텔·도시형·무순위는 순위가 없으니 p1을 "접수"로
  var phaseOf = function (item, k) {
    var p = PHK[k];
    return k === 'p1' && item.kind !== 'APT' ? Object.assign({}, p, { label: '접수', full: '접수' }) : p;
  };

  var today = new Date();
  var regions = ALL.slice();
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (Array.isArray(saved)) regions = saved.filter(function (r) { return ALL.indexOf(r) >= 0; });
  } catch (e) { /* 저장소 막힘: 기본값 사용 */ }

  var S = {
    regions: regions, phases: PH.map(function (p) { return p.k; }),
    y: today.getFullYear(), m: today.getMonth(), sel: key(today),
    modal: null, saved: false, data: [], status: 'loading', updatedAt: '',
  };

  var refs = {};
  root.querySelectorAll('[data-ref]').forEach(function (el) { refs[el.dataset.ref] = el; });

  function set(patch) { Object.assign(S, patch); render(); }
  function setRegions(list) { set({ regions: list, saved: false }); }

  function eventsByDay() {
    var rs = new Set(S.regions), ps = new Set(S.phases), by = {};
    S.data.forEach(function (it) {
      if (!rs.has(it.region)) return;
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

    // 지역별 이번 달 단지 수 (필터와 무관)
    var counts = {};
    S.data.forEach(function (it) {
      if (it.phases.some(function (p) { return p.date.slice(0, 7) === ym; })) counts[it.region] = (counts[it.region] || 0) + 1;
    });
    var monthIds = new Set();
    Object.keys(by).forEach(function (k) { if (k.slice(0, 7) === ym) by[k].forEach(function (x) { monthIds.add(x.it.id); }); });

    refs.summary.textContent = S.regions.length === ALL.length ? '전국 · 이번 달 ' + monthIds.size + '개 단지'
      : S.regions.length ? S.regions.length + '개 지역 선택 · 이번 달 ' + monthIds.size + '개 단지' : '지역을 선택하세요';
    refs.save.textContent = S.saved ? '저장됨 ✓' : '내 지역 저장';

    refs.groups.innerHTML = GROUPS.map(function (g, gi) {
      var on = g.items.filter(function (r) { return rs.has(r); }).length;
      var mark = on === g.items.length ? '✓' : on ? '–' : '';
      return '<div class="group"><button type="button" class="group-toggle" data-act="group" data-i="' + gi + '">' +
        '<span class="box' + (on ? ' on' : '') + '">' + mark + '</span>' + g.name + '</button><div class="chips">' +
        g.items.map(function (r) {
          var o = rs.has(r);
          return '<button type="button" class="chip' + (o ? ' on' : '') + '" data-act="region" data-r="' + r + '"><span>' + (o ? '✓' : '+') + '</span>' + r +
            (counts[r] ? '<span class="chip-n">' + counts[r] + '</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');

    refs.month.textContent = S.y + '년 ' + (S.m + 1) + '월';
    refs.legend.innerHTML = PH.map(function (p) {
      return '<button type="button" class="legend-chip' + (ps.has(p.k) ? '' : ' off') + '" style="' + pvars(p) + '" data-act="phase" data-k="' + p.k + '">' +
        '<span class="legend-dot"></span>' + p.label + '</button>';
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
          }).join('') + (list.length > 3 ? '<span class="more">+' + (list.length - 3) + '개 더</span>' : '');
        html += '<div class="day' + (k === S.sel ? ' sel' : '') + (cur.getMonth() !== S.m ? ' out' : '') + '" data-act="sel" data-d="' + k + '">' +
          '<div class="day-num-row"><span class="' + numCls + '">' + cur.getDate() + '</span></div><div class="day-evs">' + evs + '</div></div>';
        cur.setDate(cur.getDate() + 1);
      }
      html += '</div>';
    }
    refs.weeks.innerHTML = html;

    var sd = parse(S.sel), sl = by[S.sel] || [];
    refs.dayTitle.textContent = (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일 (' + W[sd.getDay()] + ')' + (S.sel === tkey ? ' · 오늘' : '');
    refs.dayCount.textContent = S.status === 'ok' ? sl.length + '건' : '';
    refs.dayList.innerHTML = S.status === 'error' ? '<p class="day-empty">일정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>'
      : S.status === 'loading' ? '<div class="skel"></div><div class="skel"></div>'
      : sl.length ? sl.map(function (x) {
        return '<button type="button" class="day-item" data-act="open" data-id="' + esc(x.it.id) + '">' +
          '<span class="day-item-top"><span class="badge" style="' + pvars(x.p) + '">' + x.p.label + '</span>' +
          '<span class="day-item-where">' + esc(x.it.region + ' ' + x.it.district) + ' · ' + esc(x.it.kind) + '</span></span>' +
          '<span class="day-item-name">' + esc(x.it.name) + '</span></button>';
      }).join('') : '<p class="day-empty">선택한 지역에 이 날 일정이 없어요.</p>';

    var u = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(S.updatedAt);
    refs.updated.textContent = u ? '마지막 갱신 ' + u[1] + '.' + u[2] + '.' + u[3] + ' ' + u[4] + ':' + u[5] : '';

    renderModal();
  }

  function renderModal() {
    var it = S.modal && S.data.filter(function (x) { return x.id === S.modal; })[0];
    document.body.style.overflow = it ? 'hidden' : '';
    if (!it) { refs.modal.innerHTML = ''; return; }
    var fmt = function (s) { var d = parse(s); return (d.getMonth() + 1) + '.' + pad(d.getDate()) + ' (' + W[d.getDay()] + ')'; };
    var tl = it.phases.filter(function (p) { return PHK[p.k]; })
      .sort(function (a, b) { return PHK[a.k].i - PHK[b.k].i; })
      .map(function (ph) {
        var p = phaseOf(it, ph.k);
        return '<div class="tl-row"><span class="tl-label"><span class="tl-dot" style="' + pvars(p) + '"></span>' + p.full + '</span><span class="tl-date">' + fmt(ph.date) + '</span></div>';
      }).join('');
    var go = safeUrl(it.applyhomeUrl), home = safeUrl(it.homepageUrl);
    refs.modal.innerHTML = '<div class="overlay" data-act="close"><div class="modal" role="dialog" aria-modal="true" data-act="noop">' +
      '<div class="modal-head"><div><div class="modal-where">' + esc(it.region + ' ' + it.district) + ' · ' + esc(it.kind) + '</div>' +
      '<div class="modal-name">' + esc(it.name) + '</div></div>' +
      '<button type="button" class="modal-close" data-act="close" aria-label="닫기">✕</button></div>' +
      '<div class="facts"><div class="fact"><div class="fact-label">공급 세대</div><div class="fact-value">' + (it.units ? it.units.toLocaleString() + '세대' : '-') + '</div></div>' +
      '<div class="fact"><div class="fact-label">분양가(3.3㎡)</div><div class="fact-value">' + (it.pricePerPyeong ? it.pricePerPyeong.toLocaleString() + '만원' : '-') + '</div></div></div>' +
      '<div>' + tl + '</div>' +
      '<div class="modal-btns">' + (go ? '<a class="go" href="' + esc(go) + '" target="_blank" rel="noopener">청약홈에서 보기</a>' : '') +
      (home ? '<a href="' + esc(home) + '" target="_blank" rel="noopener">분양 홈페이지</a>' : '') + '</div></div></div>';
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    var d = t.dataset;
    switch (d.act) {
      case 'all': return setRegions(ALL.slice());
      case 'none': return setRegions([]);
      case 'save':
        try { localStorage.setItem(STORE, JSON.stringify(S.regions)); } catch (err) { /* 저장 불가 */ }
        return set({ saved: true });
      case 'group': {
        var g = GROUPS[+d.i], s = new Set(S.regions);
        var all = g.items.every(function (r) { return s.has(r); });
        g.items.forEach(function (r) { if (all) s.delete(r); else s.add(r); });
        return setRegions(ALL.filter(function (r) { return s.has(r); }));
      }
      case 'region': {
        var s2 = new Set(S.regions);
        if (s2.has(d.r)) s2.delete(d.r); else s2.add(d.r);
        return setRegions(ALL.filter(function (r) { return s2.has(r); }));
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
