/* 정책대출 확인기(리모컨) — docs/eligibility-calculator-design.md 15·16절
 * 모든 화면: 오른쪽 아래 「정책대출 확인」 버튼(계산기 페이지로 가는 링크 하나). 분양분석 글이면 주소 뒤에 #n=공고번호, 대출 글이면 #calc=loan&t=유형.
 * 계산기 페이지(CALC_PAGE)에서만: 본문 앞에 계산기를 그리고 rules.json(+ #n=이면 notices.json)을 받는다.
 * 입력값은 이 스크립트 변수에만 둔다. 저장·전송하지 않는다(9-4). 전체를 try로 감싸 오류가 다른 스크립트·페이지를 막지 않게 한다.
 * node 점검: vm으로 읽어 CY만 꺼낸다(document가 없으면 화면 코드는 건너뜀). */
(function (g) {
  'use strict';
  // 계산기 페이지 주소(티스토리 일반 글 /75, 2026-11-09 공개). null이면 버튼을 그리지 않는다. 미리보기는 window.CY_CALC_PAGE로 덮는다
  var CALC_PAGE = '/75';
  // 그 글에서 버튼을 누르면 미리 고를 유형(글은 다시 저장하지 않는다, 6-1). 대표 가이드 글 주소 → 유형
  var PRESETS = { '/5': 'buy', '/11': 'buy', '/12': 'buy', '/15': 'buy', '/21': 'buy', '/36': 'buy', '/22': 'jeonse', '/57': 'jeonse', '/58': 'jeonse', '/47': '', '/26': 'special', '/27': 'special', '/39': 'special', '/42': 'special', '/45': 'special' };
  var PRESET_CATEGORY = { '/category/대출·정책': '', '/category/청약가이드': 'special' };
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
    return t === null ? '' : t === 'special' ? '#calc=special' : '#calc=loan' + (t ? '&t=' + t : '');
  };
  function path(u) {
    try { return decodeURIComponent(new URL(u, location.href).pathname).replace(/\/+$/, '') || '/'; } catch (e) { return ''; }
  }

  /* ---------- 판정 엔진(5-2·5-3, 14절 Q9: 금리는 정책 금리 범위만, 금액은 계산) ----------
   * 순수 함수. CY.match(rules, 답, 오늘, 묶음) → 그 묶음 상품 결과(order 순서).
   * 3값: true(충족) · false(해당 안 됨) · null(모름 → 확인 필요). 모르는 칸·모르는 연산은 null이지 true가 되지 않는다. */
  var INC = { incCouple: 1, incSelf: 1, incSpouse: 1, incOne: 1, incMonth: 1, incSelfMonth: 1, incSpouseMonth: 1 };
  var SRC = { incCouple: 'incSelf', incOne: 'incSelf', dual: 'incSpouse', incDti: 'incSelf', soloHead: 'household', capital: 'region', area60: 'area', area85: 'area', area100: 'area', kidsLoan: 'kidsMinor', landLease: 'saleWin', kidsSpecial: 'kidsMinor', incMonth: 'incSelf', incSelfMonth: 'incSelf', incSpouseMonth: 'incSpouse' };
  // 답하지 않아도 쓰는 기본값(2-3 굵은 글씨). 기본값으로 걸린 잎에 ask가 있으면 「해당 안 됨」이 아니라 「확인 필요」로 둔다
  var DEFAULTS = { term: 30, otherInterest: 0, landLease: 'none', contract: 'new', fetus: 0 };

  CY.man = function (n) {
    n = Math.floor(n);
    var e = Math.floor(n / 10000), r = n % 10000, c = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return e ? e + '억' + (r ? ' ' + c + '만원' : '원') : c + '만원';
  };
  var man = CY.man;
  CY.pmt1 = function (ratePct, years) { var r = ratePct / 100 / 12, n = years * 12; return r ? (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 1 / n; };

  function T(notes) { return { v: true, why: null, asks: [], notes: notes || [] }; }
  function U(asks, why) { return { v: null, why: why || null, asks: asks || [], notes: [] }; }
  function F(why, kind) { return { v: false, why: why, kind: kind, asks: [], notes: [] }; }
  function uniq(a) { var o = []; for (var i = 0; i < a.length; i++) if (o.indexOf(a[i]) < 0) o.push(a[i]); return o; }
  function all(rs) {
    var notes = [], unk = null, asks = [];
    for (var i = 0; i < rs.length; i++) notes = notes.concat(rs[i].notes);
    for (i = 0; i < rs.length; i++) if (rs[i].v === false) return { v: false, why: rs[i].why, kind: rs[i].kind, asks: [], notes: notes };
    for (i = 0; i < rs.length; i++) if (rs[i].v === null) { unk = unk || rs[i]; asks = asks.concat(rs[i].asks); }
    return unk ? { v: null, why: unk.why, asks: uniq(asks), notes: notes } : T(notes);
  }
  function any(rs) {
    var unk = null, asks = [];
    for (var i = 0; i < rs.length; i++) if (rs[i].v === true) return rs[i];
    for (i = 0; i < rs.length; i++) if (rs[i].v === null) { unk = unk || rs[i]; asks = asks.concat(rs[i].asks); }
    if (unk) return { v: null, why: unk.why, asks: uniq(asks), notes: [] };
    return { v: false, why: rs.length ? rs[0].why : null, kind: rs.length ? rs[0].kind : null, asks: [], notes: [] };
  }

  // 답 → 칸 값(파생 칸 포함, tables.json derived). 모르면 undefined
  function reader(rules, ans, prod) {
    var unk = rules.unknownValues || ['unknown'];
    function raw(f) { var v = ans[f]; return v === undefined || v === null || v === '' || unk.indexOf(v) >= 0 ? undefined : v; }
    function val(f) {
      var s, p, m;
      switch (f) {
        case 'incSpouse':
          // 미혼이면 0. 신생아 특례(parentsIncome)만 혼인신고 없이 아이 부모 두 사람 소득을 합한다(loans.md 2절 대상)
          m = raw('marriage');
          if (m === 'single' && !(prod && prod.parentsIncome && (raw('newborn') === 'yes' || raw('newbornSpecialWin') === true))) return 0;
          if (m === 'soon' && prod && prod.special) return 0; // 특공은 공고일 현재 세대 기준
          return raw('incSpouse');
        case 'incCouple': s = val('incSelf'); p = val('incSpouse'); return s === undefined || p === undefined ? undefined : s + p;
        case 'dual':
          s = val('incSelf'); p = val('incSpouse');
          if (s === 0 || p === 0) return false;
          return s === undefined || p === undefined ? undefined : true;
        case 'incOne': return val('dual') === true ? Math.min(val('incSelf'), val('incSpouse')) : undefined;
        case 'soloHead':
          m = raw('marriage'); s = raw('head'); p = raw('household');
          if ((m !== undefined && m !== 'single') || s === 'member' || (p !== undefined && p > 1)) return false;
          return m === undefined || s === undefined || p === undefined ? undefined : true;
        case 'capital': s = raw('region'); return s === undefined ? undefined : s !== 'other';
        case 'area60': s = raw('area'); return s === undefined ? undefined : s === 'le60';
        case 'area85': s = raw('area'); return s === undefined ? undefined : s === 'le60' || s === '60to85';
        case 'area100': s = raw('area'); return s === undefined ? undefined : s !== 'over100';
        case 'kidsLoan': return raw('kidsMinor');
        case 'reWinExempt': return !!(prod && prod.kind === 'private') && raw('regulated') === false;
        // 특공 전용: 태아 포함 자녀, 세대 월평균소득(원)
        case 'kidsSpecial':
          s = raw('kidsMinor'); m = raw('newborn'); p = Math.max(raw('fetus') || 0, m === 'pregnant' ? 1 : 0);
          if (s === undefined) return undefined;
          return s + p < 2 && m === undefined && raw('fetus') === undefined ? undefined : s + p;
        // 3년 부양 부모가 같은 등본이면 「성인 가족 없음」은 답이 모순: 부모 소득을 다시 묻는다
        case 'incOthers': s = raw('otherAdults'); return s === true ? raw('incOthers') : s === false && raw('parent65_3y') !== true ? 0 : undefined;
        case 'incMonth':
          s = val('incSelf'); p = val('incSpouse'); m = val('incOthers');
          return s === undefined || p === undefined || m === undefined ? undefined : ((s + p + m) * 10000) / 12;
        case 'incSelfMonth': s = val('incSelf'); return s === undefined ? undefined : (s * 10000) / 12;
        case 'incSpouseMonth': s = val('incSpouse'); return s === undefined ? undefined : (s * 10000) / 12;
      }
      s = raw(f);
      return s === undefined && DEFAULTS.hasOwnProperty(f) ? DEFAULTS[f] : s;
    }
    return { raw: raw, val: val, isDefault: function (f) { return raw(f) === undefined && DEFAULTS.hasOwnProperty(f); } };
  }

  // 사실 값: 변형 키 → 지역(capital/other) 순서로 고른다. 모르면 [작은 값, 큰 값]
  function valOf(v, key, x) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (key in v) v = v[key];
      if (v && typeof v === 'object' && !Array.isArray(v) && 'capital' in v) {
        var c = x.val('capital');
        v = c === undefined ? [v.other, v.capital] : c ? v.capital : v.other;
      }
    }
    return v;
  }
  function span(c) {
    var f = [];
    for (var i = 0; i < c.length; i++) f = f.concat(c[i]);
    f = f.filter(function (n) { return typeof n === 'number'; });
    return f.length ? [Math.min.apply(null, f), Math.max.apply(null, f)] : null;
  }
  // pick(조건이 처음 참인 값) → 없으면 v. 모르는 조건의 값은 범위에 넣고 계속 본다
  function factRange(fact, key, x) {
    if (!fact) return null;
    var c = [], picks = fact.pick || [];
    for (var i = 0; i < picks.length; i++) {
      var e = picks[i].when ? ev(picks[i].when, x) : T(), r = e.v;
      if (r === true) { c.push(picks[i].v); return span(c); }
      if (r === null) { c.push(picks[i].v); if (x.asks) x.asks = x.asks.concat(e.asks); } // 답하면 범위가 줄어드는 칸
    }
    if ('v' in fact) c.push(valOf(fact.v, key, x));
    return span(c);
  }
  function factAt(path, x) {
    var parts = path.split('.'), f = x.p.facts && x.p.facts[parts[0]];
    if (!f) return undefined;
    var v = parts[1] ? f.v && f.v[parts[1]] : valOf(f.v, x.key, x);
    return typeof v === 'number' ? v : undefined;
  }
  function near(v, t, x) { return Math.abs(v - t) <= (t * (x.rules.boundaryPct || 0)) / 100; }
  function askOf(n) { var a = n.ask || SRC[n.f] || n.f; return [SRC[a] || a]; }
  function incAsk(x) {
    var a = [];
    if (x.val('incSelf') === undefined) a.push('incSelf');
    if (x.val('incSpouse') === undefined) a.push('incSpouse');
    if (x.isSpecial && x.val('incOthers') === undefined) a.push(x.raw('otherAdults') === true ? 'incOthers' : 'otherAdults');
    return a.length ? a : ['incSelf'];
  }

  function leaf(n, x) {
    var v = x.val(n.f), ok;
    if (v === undefined) return U(n.f === 'kidsSpecial' && x.raw('kidsMinor') === undefined ? ['kidsMinor'] : !n.ask && /^inc|^dual$/.test(n.f) ? incAsk(x) : askOf(n));
    if ('is' in n) ok = [].concat(n.is).indexOf(v) >= 0;
    else {
      var t = n.fact ? factAt(n.fact, x) : n.v;
      if (n.pct) {
        // 월평균소득 산식은 작년 총급여 ÷ 근무 개월 수: 1년 내내 일하지 않은 사람이 있으면 구간을 정하지 않는다
        var fy = [['incSelf', 'fullYearSelf'], ['incSpouse', 'fullYearSpouse'], ['incOthers', 'fullYearOthers']].filter(function (e) { return x.val(e[0]) > 0; });
        if (fy.some(function (e) { return x.raw(e[1]) === false; })) return U([], '1년 내내 일하지 않았으면 월평균소득은 작년 총급여 ÷ 근무 개월 수로 계산해요 — 공고문 기준으로 다시 보세요');
        var fyAsk = fy.filter(function (e) { return x.raw(e[1]) === undefined; }).map(function (e) { return e[1]; });
        if (fyAsk.length) return U(fyAsk);
        var h = x.val('household'), row = x.rules.incomeTable.byPct[n.pct];
        if (h === undefined) return U(['household']);
        if (h > 5) return U([], '6인 이상 소득 금액은 공고문에서 확인해야 해요');
        t = row && row[h <= 3 ? '3' : String(h)];
      }
      if (typeof t !== 'number' || typeof v !== 'number') return U(askOf(n));
      if (n.op === 'le') ok = v <= t; else if (n.op === 'lt') ok = v < t; else if (n.op === 'ge') ok = v >= t; else if (n.op === 'gt') ok = v > t;
      else return U([]);
      if (INC[n.f] && near(v, t, x)) return U([], '소득이 기준 ' + man(t) + ' 근처라 서류상 소득에 따라 달라질 수 있어요');
    }
    if (!ok && n.ask && x.isDefault(n.f)) return U(askOf(n));
    return ok ? T() : F(null, 'when');
  }

  function ev(n, x) {
    if (!n || typeof n !== 'object') return U([]);
    if (n.skipIf && ev(n.skipIf, x).v === true) return T();
    if (n.unknownIf) { var ui = ev(n.unknownIf.when, x); if (ui.v === true || (ui.v === null && ui.why)) return U([], n.unknownIf.why); } // 기준값 근처로 모르면 그 경로로 본다
    var r, i, rs = [];
    if (n.all || n.any) { var list = n.all || n.any; for (i = 0; i < list.length; i++) rs.push(ev(list[i], x)); r = n.all ? all(rs) : any(rs); }
    else if (n.not) { var k = ev(n.not, x); r = k.v === null ? U(k.asks, k.why) : k.v ? F(null, 'when') : T(); }
    else if (n.use) r = ev(x.rules.defs[n.use], x);
    else if (n.f) r = leaf(n, x);
    else r = T();
    // 예외 조건에 쓰는 칸이 비어 있으면 그 답을 받기 전에는 정하지 않는다(규제 여부는 공고에서만 와서 뺀다)
    if (n.unknownIf && r.v !== null) { var ug = ev(n.unknownIf.when, x); if (ug.v === null && ug.asks.length && ug.asks.indexOf('regulated') < 0) r = U(ug.asks); }
    r = { v: r.v, why: r.why, kind: r.kind, asks: r.asks, notes: r.notes };
    if (n.why && (r.v === false || (r.v === null && !r.why))) r.why = n.why;
    if (n.notice && r.v !== false) {
      var t = typeof n.notice === 'string' ? n.notice : ev(n.notice.when, x).v === true ? n.notice.text : null;
      if (t) r.notes = r.notes.concat(t);
    }
    if (n.softFail && r.v === false) r.v = null;
    return r;
  }
  CY.ev = ev;

  // 변형 하나: 변형 조건 + 집값 + 보증금 상한 + 소득(신혼 1인 경로). 집값을 소득보다 먼저 봐서 걸린 이유를 상품 사이에 맞춘다
  // keyIf(예: 생애최초면 solo30First)를 모르면 두 키로 다 보고, 결과가 다르면 「확인 필요」 + 그 질문
  function variantOf(p, vt, x) {
    x.key = vt.key;
    var ki = vt.keyIf ? ev(vt.keyIf.when, x) : null;
    if (!ki || ki.v === false) return variantAt(p, vt, x, vt.key);
    if (ki.v === true) return variantAt(p, vt, x, vt.keyIf.then);
    var a = variantAt(p, vt, x, vt.key), b = variantAt(p, vt, x, vt.keyIf.then);
    var keys = [a, b].filter(function (r) { return r.v !== false; }).map(function (r) { return r.key; });
    var out = a.v === b.v ? a : { vt: vt, key: a.key, v: null, why: '처음 사는 집(생애최초)인지에 따라 기준이 달라져요', asks: ki.asks, notes: a.notes.concat(b.notes), one: a.one || b.one };
    out.keys = keys.length ? keys : [a.key];
    out.more = ki.asks;
    return out;
  }
  function variantAt(p, vt, x, key) {
    x.key = key;
    var f = p.facts || {}, parts = [vt.when ? ev(vt.when, x) : T()], one = false, r, lim, v;
    if (f.price && !(f.price.skipIf && ev(f.price.skipIf, x).v === true)) {
      lim = valOf(f.price.v, key, x); v = x.val('price');
      parts.push(v === undefined ? U(['price']) : v <= lim ? T() : F('집값 ' + man(v) + '이 기준 ' + man(lim) + '을 넘어요', 'price'));
    }
    var g = p.limit && p.limit.gate;
    if (g) {
      lim = factAt(g.fact, x); v = x.val(g.f);
      parts.push(v === undefined ? U([g.f]) : lim === undefined ? U(['region']) : v <= lim ? T() : F('보증금 ' + man(v) + '이 상한 ' + man(lim) + '을 넘어요', 'gate'));
    }
    if (f.inc && !(f.inc.skipIf && ev(f.inc.skipIf, x).v === true)) {
      lim = valOf(f.inc.v, key, x); v = x.val('incCouple');
      if (v === undefined) r = U(incAsk(x));
      else if (near(v, lim, x)) r = U([], '부부합산 소득이 기준 ' + man(lim) + ' 근처라 서류상 소득에 따라 달라질 수 있어요');
      else r = v <= lim ? T() : F('부부합산 소득 ' + man(v) + '이 기준 ' + man(lim) + '을 넘어요', 'inc');
      // 신혼 부부 중 1인 경로(공지 1316): 합산이 넘으면 소득이 적은 사람(incOne)이 1인 기준 이하인지 본다
      var ol = vt.onePerson && f.inc.onePerson && f.inc.onePerson[key];
      if (v !== undefined && v > lim && ol && x.val('dual') === true) {
        var o = x.val('incOne');
        if (near(o, ol, x)) { if (r.v === false) r = U([], '부부 중 1인 소득이 1인 기준 ' + man(ol) + ' 근처예요'); }
        else if (o <= ol) { r = T(['부부 중 1인 소득 기준(' + man(ol) + ' 이하)으로 봤어요. 그 1인(대출신청인)이 매수인·임차인이어야 하고 금리가 0.3%p 더해져요']); one = true; }
      }
      parts.push(r);
    }
    r = all(parts);
    if (vt.notice && r.v !== false) r.notes = r.notes.concat(vt.notice);
    if (one && vt.onePersonNote) r.notes = r.notes.concat(vt.onePersonNote);
    return { vt: vt, key: key, keys: [key], v: r.v, why: r.why, kind: r.kind, asks: r.asks, more: [], notes: r.notes, one: one, limit: null };
  }

  // 여러 변형이 같은 이유(집값·소득)로 걸리면 「집값 7억원이 기준(일반·생애최초 5억원, 신혼·2자녀 6억원)을 넘어요」
  function failWhy(p, vs, x) {
    var real = vs.filter(function (v) { return v.v === false && v.kind !== 'when'; });
    if (!real.length) return (vs.filter(function (v) { return v.v === false; })[0] || {}).why || '입력하신 조건과 맞는 유형이 없어요';
    var kind = real[0].kind;
    if (vs.length < 2 || real.some(function (v) { return v.kind !== kind; }) || (kind !== 'price' && kind !== 'inc')) return real[0].why;
    var by = [], fact = kind === 'price' ? p.facts.price : p.facts.inc;
    real.forEach(function (v) {
      var lim = valOf(fact.v, v.key, x), hit = by.filter(function (b) { return b.lim === lim; })[0];
      if (hit) hit.labels.push(v.vt.label); else by.push({ lim: lim, labels: [v.vt.label] });
    });
    var list = by.length === 1 ? ' ' + man(by[0].lim) : '(' + by.map(function (b) { return b.labels.join('·') + ' ' + man(b.lim); }).join(', ') + ')';
    return (kind === 'price' ? '집값 ' + man(x.val('price')) : '부부합산 소득 ' + man(x.val('incCouple'))) + '이 기준' + list + '을 넘어요';
  }

  // DTI 계산 금리: dtiRates[소득 구간][만기]. 1인 경로·토지임대부 본청약은 그 만기의 최고 줄(가산 전), 표가 없으면 범위 위쪽 끝
  function dtiRate(p, x, inc, one, today) {
    var t = p.rate.dtiRates, term = x.val('term');
    if (t) {
      var col = t.cols.indexOf(term), rows = t.rows, row = rows[rows.length - 1];
      if (col < 0) col = t.cols.length - 1;
      if (!one && x.val('landLease') !== 'main') for (var i = 0; i < rows.length; i++) if (inc <= rows[i][0]) { row = rows[i]; break; }
      return { rate: row[1][col], top: row === rows[rows.length - 1] && (one || x.val('landLease') === 'main') };
    }
    return { rate: rateNow(p, today).range[1], top: true };
  }
  function rateNow(p, today) {
    var b = p.rate.byDate;
    if (!b) return p.rate;
    var cur = b[0];
    for (var i = 0; i < b.length; i++) if (b[i].from <= today) cur = b[i];
    return cur;
  }
  CY.rateText = function (p, today) { var r = rateNow(p, today); return p.rate.byDate ? r.text + ' — ' + r.from + ' 공시' : r.text; };

  // 최대 예상 금액(만원): 항마다 [작은, 큰] 값을 내고 가장 작은 항으로 정한다(5-3 4·5). 입력이 없는 항은 빼고 skipped에 적는다
  // 키를 모르면(keyIf 모름) 키마다 계산해 항별로 [가장 작은, 가장 큰] 값으로 합친다
  function limitOf(p, vl, x, today) {
    var ls = vl.keys.map(function (k) { return limitAt(p, vl, x, today, k); }).filter(Boolean);
    if (ls.length < 2) return ls[0] || null;
    var a = ls[0], b = ls[1];
    a.terms.forEach(function (t, i) { var u = b.terms[i]; if (u && u.k === t.k) { t.lo = Math.min(t.lo, u.lo); t.hi = Math.max(t.hi, u.hi); } });
    if (b.hi > a.hi) { a.by = b.by; a.approx = b.approx; }
    a.lo = Math.min(a.lo, b.lo); a.hi = Math.max(a.hi, b.hi);
    return a;
  }
  function limitAt(p, vl, x, today, key) {
    var f = p.facts, terms = [], skipped = [];
    x.key = key; vl = { key: key, one: vl.one };
    (p.limit.terms || []).forEach(function (t) {
      if (t.when && ev(t.when, x).v !== true) return;
      var lo, hi, d = {}, r, base;
      if (t.k === 'cap') { r = factRange(f.cap, vl.key, x); if (!r) return; lo = r[0]; hi = r[1]; }
      else if (t.k === 'pct') {
        base = x.val(t.of); r = factRange(f[t.fact], vl.key, x);
        if (base === undefined || !r) { skipped.push(t.label); return; }
        lo = Math.floor((base * r[0]) / 100); hi = Math.floor((base * r[1]) / 100); d = { base: base, pct: r };
        if (t.minus) {
          var m = ev(t.minus.when, x).v, sd = x.rules[t.minus.tbl], rv = x.val('region'), reg = sd && sd.byRegion[rv];
          // 지역을 모르면 공제가 있을 수도 없을 수도 있다: 가장 큰 공제(서울)까지 범위로 두고 지역을 묻는다
          if (sd && rv === undefined && m !== false) {
            m = null;
            reg = [0, Math.max.apply(null, Object.keys(sd.byRegion).map(function (k) { return sd.byRegion[k][1]; }))];
            if (x.asks) x.asks.push('region');
          }
          if (m !== false && reg) {
            var cap = (base * (sd.capPctOfPrice || 100)) / 100, dl = Math.min(reg[0], cap), dh = Math.min(reg[1], cap);
            lo -= dh; if (m === true) hi -= dl;
            d.minus = { lo: m === true ? dl : 0, hi: dh, label: t.minus.label };
          }
        }
      } else if (t.k === 'dti') {
        var inc = vl.one ? x.val('incOne') : x.val('incCouple'); r = factRange(f[t.fact], vl.key, x);
        if (inc === undefined || !r) { skipped.push(t.label); return; }
        var dr = dtiRate(p, x, inc, vl.one, today), oi = x.val('otherInterest') || 0, k = 12 * CY.pmt1(dr.rate, x.val('term'));
        lo = Math.floor(((r[0] / 100) * inc - oi) / k); hi = Math.floor(((r[1] / 100) * inc - oi) / k);
        d = { inc: inc, pct: r, rate: dr.rate, top: dr.top, term: x.val('term'), oi: oi, approx: true };
      } else if (t.k === 'renewal') { base = x.val('increase'); if (base === undefined) { skipped.push(t.label); return; } lo = hi = base; }
      else if (t.k === 'price') { base = x.val('price'); if (base === undefined) { skipped.push(t.label); return; } lo = hi = base; }
      else return;
      terms.push({ k: t.k, label: t.label, lo: Math.max(0, lo), hi: Math.max(0, hi), d: d });
    });
    if (!terms.length) return null;
    var lo = Math.min.apply(null, terms.map(function (t) { return t.lo; })), hi = Math.min.apply(null, terms.map(function (t) { return t.hi; }));
    var by = terms.filter(function (t) { return t.hi === hi; })[0];
    return { lo: lo, hi: hi, by: by, approx: !!by.d.approx, terms: terms, skipped: skipped };
  }

  function evalProduct(rules, p, ans, today) {
    if (p.offer !== 'active') return { p: p, status: 'off' };
    var x = reader(rules, ans, p);
    x.rules = rules; x.p = p; x.key = null;
    if (p.until && p.until < today) return { p: p, status: 'check', why: '기준(' + p.until + '까지)이 지나 다시 확인하고 있어요', asks: [], notes: [], lines: [] };
    var w = ev(p.when, x), vs = p.variants.map(function (vt) { return variantOf(p, vt, x); });
    var vr = vs.some(function (v) { return v.v === true; }) ? true : vs.some(function (v) { return v.v === null; }) ? null : false;
    var res = { p: p, lines: [], notes: [], asks: [] };
    if (w.v === false) { res.status = 'no'; res.why = w.why; return res; }
    // 청약 당첨 분양 여부를 답하기 전, 그 답으로만 열리는 상품은 「답하면 볼 수 있는 항목」
    if (w.v === null && ans.saleWin == null && w.asks.indexOf('saleWin') >= 0) { res.status = 'later'; return res; }
    if (vr === false) { res.status = 'no'; res.why = failWhy(p, vs, x); return res; }
    res.status = w.v === true && vr === true ? 'ok' : 'check';
    res.why = w.v === null ? w.why : null;
    res.asks = w.asks.slice();
    res.notes = w.notes.slice();
    vs.forEach(function (v) {
      if (v.v === false) return;
      if (v.v === null) res.asks = res.asks.concat(v.asks);
      res.notes = res.notes.concat(v.notes);
      x.asks = [];
      if (p.limit) v.limit = limitOf(p, v, x, today);
      res.asks = res.asks.concat(v.more, x.asks);
      x.asks = null;
      res.lines.push(v);
    });
    if (p.limit && p.limit.notice) res.notes.push(p.limit.notice);
    res.asks = uniq(res.asks); res.notes = uniq(res.notes);
    // 청약 당첨 분양 여부를 답하기 전, 그 답으로만 열리는 상품은 「답하면 볼 수 있는 항목」
    return res;
  }

  CY.match = function (rules, ans, today, group) {
    return rules.loans.filter(function (p) { return p.group === group; })
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (p) { return evalProduct(rules, p, ans, today); });
  };
  // 특공 한 종류(5-2): 관문 → 변형(민영·국민)마다 구간을 순서대로 본다. 처음 참인 구간을 붙이고, 그 앞에 모르는 구간이 있으면 「확인 필요」
  function evalProgram(rules, p, ans, today, kind) {
    var x = reader(rules, ans, { special: true, kind: kind });
    x.rules = rules; x.p = p; x.key = null; x.isSpecial = true;
    if (p.until && p.until < today) return { p: p, status: 'check', why: '기준(' + p.until + '까지)이 지나 다시 확인하고 있어요', asks: [], notes: [], lines: [] };
    var w = ev(p.when, x), res = { p: p, lines: [], notes: w.notes.slice(), asks: w.asks.slice() };
    if (w.v === false) { res.status = 'no'; res.why = w.why; return res; }
    if (p.later && ans[p.later] == null && w.v === null && w.asks.indexOf(p.later) >= 0) { res.status = 'later'; return res; }
    res.why = w.v === null ? w.why : null;
    p.variants.forEach(function (vt) {
      if (kind && vt.kinds.indexOf(kind) < 0) return;
      var vw = vt.when ? ev(vt.when, x) : T(), hit = null, maybe = [], asks = vw.asks.slice(), why = vw.why;
      if (vw.v !== false) for (var i = 0; i < vt.tiers.length && !hit; i++) {
        var t = vt.tiers[i], r = t.when ? ev(t.when, x) : T();
        if (r.v === true) hit = t;
        else if (r.v === null) { maybe.push(t.name); asks = asks.concat(r.asks); why = why || r.why; }
      }
      var v = vw.v === false || (!hit && !maybe.length) ? false : hit && !maybe.length && vw.v === true ? true : null;
      if (v === false) why = vw.v === false ? vw.why : p.failWhy || '기준에 맞는 구간이 없어요';
      if (hit && hit.note) res.notes.push(hit.note);
      res.asks = res.asks.concat(v === null ? asks : []);
      res.lines.push({ vt: vt, v: v, tier: hit ? hit.name : null, maybe: maybe, why: why });
    });
    var some = function (st) { return res.lines.some(function (l) { return l.v === st; }); };
    if (!some(true) && !some(null)) { res.status = 'no'; res.why = (res.lines[0] || {}).why; return res; }
    res.status = w.v === true && some(true) ? 'ok' : 'check';
    res.asks = uniq(res.asks); res.notes = uniq(res.notes);
    return res;
  }
  CY.matchSpecial = function (rules, ans, today, kind) {
    return rules.special.programs.slice().sort(function (a, b) { return a.order - b.order; }).map(function (p) { return evalProgram(rules, p, ans, today, kind); });
  };
  // 공고 정보 → 특공 판정 변형(16-5): 민영·국민 한쪽. 모르면 둘 다
  CY.noticeKind = function (n) { return n && n.houseKind === '민영' ? 'private' : n && n.houseKind === '국민' ? 'national' : null; };
  // 물량이 있는 공고(7-2): 접수가 끝나지 않고 그 유형 세대가 있는 공고, 접수일 순 최대 5개. 공공주택 특별법 공고는 뺀다
  CY.supplyList = function (notices, schedule, sp, today, kinds, newbornOnly) {
    var items = (schedule && schedule.items) || [], out = [];
    function byReceipt(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
    Object.keys((notices && notices.n) || {}).forEach(function (no) {
      var n = notices.n[no], k = CY.noticeKind(n);
      if (n.kind !== 'APT' || n.publicLaw === true || !Array.isArray(n.types)) return;
      if (k && kinds.indexOf(k) < 0) return;
      if (newbornOnly && k === 'private' && !(n.noticeDate >= '2026-06-15')) return;
      var units = n.types.reduce(function (s, t) { return s + ((t.spBy && t.spBy[sp]) || 0); }, 0);
      if (!units) return;
      var it = items.filter(function (i) { return String(i.id).indexOf(no + '-') === 0; })[0];
      var ph = it && (it.phases || []).filter(function (f) { return f.k === 'sp'; })[0] || it && (it.phases || []).filter(function (f) { return f.k === 'p1'; })[0];
      if (!ph || (ph.end || ph.date) < today) return;
      out.push({ no: no, name: n.name, region: n.region, date: ph.date, units: units, url: it.applyhomeUrl, kind: n.houseKind, old: n.noticeDate < '2026-06-15', knownKind: !!k && n.publicLaw != null });
    });
    return out.sort(byReceipt).slice(0, 5);
  };
  CY.checkedOf = function (rules) {
    return rules.loans.filter(function (p) { return p.offer === 'active'; }).reduce(function (m, p) { return !m || p.checked < m ? p.checked : m; }, '');
  };

  /* ---------- 공고 정보 가져오기(16절). 공고 한 줄 + 주택형 → 채울 칸. 사람 칸(소득·가구·무주택)은 채우지 않는다 ---------- */
  CY.typeLabel = function (ty) { var m = /^0*(\d+)(?:\.\d+)?(.*)$/.exec(String(ty)); return m ? m[1] + m[2] : String(ty); };
  CY.noticeFill = function (n, t) {
    var o = {};
    if (n.buyKind === 'apt' || n.buyKind === 'officetel') o.buyKind = n.buyKind;
    if (n.region) o.region = n.region === '서울' ? 'seoul' : n.region === '경기' || n.region === '인천' ? 'gyeonggiIncheon' : 'other';
    if (Array.isArray(n.regFlags)) o.regulated = n.regFlags.length > 0;
    if (t) {
      if (t.top > 0) o.price = t.top;
      // 대체본은 정수 면적 묶음이라 경계값(60·85·100)이면 어느 쪽인지 몰라 채우지 않는다(16-5)
      if (t.ex > 0 && !(n.areaExact === false && (t.ex === 60 || t.ex === 85 || t.ex === 100))) o.area = t.ex <= 60 ? 'le60' : t.ex <= 85 ? '60to85' : t.ex <= 100 ? '85to100' : 'over100';
    }
    return o;
  };

  if (typeof document === 'undefined') return;

  /* ---------- 계산기 화면(2절·15-2). 답은 mount 안 변수(S)에만 둔다 — 저장·전송하지 않는다(9-4). form을 쓰지 않는다(2-1) ---------- */
  var GROUPS = [['buy', '집 살 때'], ['jeonse', '전세'], ['rent', '월세']];
  var GROUP_FIELDS = ['price', 'buyKind', 'area', 'region', 'loanNow', 'deposit', 'rent', 'contract', 'increase'];
  var YN = [[true, '예'], [false, '아니오'], ['unknown', '모름']];
  var SALE = [['dream', '청년 주택드림 청약통장으로 당첨', 'dream', 'none'], ['landMain', '토지임대부 분양주택 본청약 당첨', 'other', 'main'],
    ['landPre', '토지임대부 분양주택 사전청약 당첨', 'other', 'pre'], ['newHope', '신혼희망타운 분양계약', 'newHope', 'none'],
    ['other', '그 밖 청약 당첨', 'other', 'none'], ['none', '아님', 'none', 'none'], ['unknown', '모름', 'unknown', 'unknown']];
  var OPT = {
    house: [['none', '모두 없음'], ['own1', '본인·배우자가 1채'], ['other', '그 밖(2채 이상, 다른 가족 소유)'], ['unknown', '애매함']],
    marriage: [['single', '미혼'], ['le7y', '혼인신고 7년 이내'], ['over7y', '7년 넘음'], ['soon', '3개월 안에 결혼 예정']],
    kidsMinor: [[0, '0명'], [1, '1명'], [2, '2명'], [3, '3명 이상']],
    newborn: [['yes', '있음'], ['pregnant', '임신 중'], ['no', '없음']],
    head: [['head', '세대주'], ['member', '세대원'], ['soonHead', '예비 세대주(곧 분가)']],
    netAsset: [['le345', '3.45억원 이하'], ['345to511', '3.45억~5.11억원'], ['over511', '5.11억원 넘음'], ['unknown', '모름']],
    buyKind: [['apt', '아파트'], ['house', '아파트 아닌 주택'], ['officetel', '주거용 오피스텔']],
    area: [['le60', '60㎡ 이하'], ['60to85', '60~85㎡'], ['85to100', '85~100㎡'], ['over100', '100㎡ 넘음'], ['unknown', '모름']],
    region: [['seoul', '서울'], ['gyeonggiIncheon', '경기·인천'], ['other', '그 밖 지역']],
    loanNowBuy: [['none', '없음'], ['fundJeonse', '기금 전세대출(새 대출 실행일에 갚음)'], ['midLoan', '분양 중도금대출'], ['other', '그 밖 주택담보·전세대출'], ['unknown', '모름']],
    loanNow: [['none', '없음'], ['other', '있음'], ['unknown', '모름']],
    contract: [['new', '신규 계약'], ['renew', '갱신(증액)']],
    term: [[10, '10년'], [15, '15년'], [20, '20년'], [30, '30년']],
    bankbook: [['rank1', '1순위'], ['over6m', '1순위 아님(가입 6개월·국민 6회 납입 또는 민영 예치금 충족)'], ['under6m', '가입 6개월 안 됨·납입 부족·없음'], ['unknown', '모름']],
    fetus: [[0, '없음'], [1, '1명'], [2, '2명 이상']],
    wonPremarital: [['self', '본인이 혼인신고 전'], ['spouse', '배우자가 혼인신고 전'], ['no', '아님(혼인 뒤·그 밖)'], ['unknown', '모름']],
    wonRecent: [['none', '없음'], ['le5y', '최근 5년 안 당첨'], ['le10y', '5~10년 전 당첨'], ['unknown', '모름']]
  };
  var SP_NAMES = [['NWWDS', '신혼'], ['LFE_FRST', '생애최초'], ['NWBB', '신생아'], ['MNYCH', '다자녀'], ['OLD_PARNTS_SUPORT', '노부모'], ['YGMN', '청년'], ['INSTT_RECOMEND', '기관추천'], ['TRANSR_INSTT_ENFSN', '이전기관'], ['ETC', '기타']];
  // 질문 문구(2-2·2-3)와 한 줄 풀이. n이 있으면 숫자 칸(단위)
  var Q = {
    house: { t: '본인·배우자(따로 살아도 포함)·같은 등본 가족 누구라도 집이나 분양권·입주권을 갖고 있나요?', h: '이번에 사거나 분양받는 집은 빼고 답해 주세요' },
    marriage: { t: '혼인 상태' },
    kidsMinor: { t: '이미 태어난 미성년 자녀 수', h: '입양 포함, 태아는 빼고 세요' },
    newborn: { t: '2년 안에 태어나거나 입양한 자녀가 있나요?' },
    age: { t: '만 나이', n: '세' },
    head: { t: '등본상 나는', h: '세대주 = 주민등록등본 맨 위에 있는 사람' },
    household: { t: '같은 등본 가구원 수', h: '곧 분가하면 분가한 뒤 등본 기준', n: '명' },
    incSelf: { t: '본인 작년 총급여', h: '원천징수영수증 기준(비과세 제외). 실수령액이 아니에요', n: '만원' },
    incSpouse: { t: '배우자 작년 총급여', h: '혼인신고 전이어도 2년 안에 낳은 아이의 다른 부모 포함', n: '만원' },
    netAsset: { t: '세대 순자산(자산 − 부채) 구간', h: '세대원 전원 합계, 2026년도 기준' },
    price: { t: '집값(매매가·분양가)', n: '만원' },
    buyKind: { t: '어떤 집인가요' },
    area: { t: '전용면적' },
    region: { t: '집이 있는 곳' },
    loanNow: { t: '지금 쓰는 주택담보·전세대출이 있나요?' },
    deposit: { t: '보증금', h: '갱신이면 늘어난 뒤 총 보증금', n: '만원' },
    contract: { t: '신규 계약인가요, 갱신인가요?' },
    increase: { t: '갱신으로 늘어나는 보증금', n: '만원' },
    term: { t: '원하는 만기' },
    otherInterest: { t: '다른 대출(신용·자동차 등) 1년 이자 합계', n: '만원' },
    regulated: { t: '규제지역(조정대상·투기과열지구) 주택인가요?', h: '모르면 두 경우를 범위로 보여요' },
    everOwned: { t: '세대원 누구라도 집을 가진 적이 있나요?' },
    newbornSpecialWin: { t: '신생아 특별공급에 당첨된 적이 있나요?' },
    eupmyeon: { t: '수도권 밖의 「도시지역이 아닌」 읍·면 지역인가요?', h: '읍·면이어도 도시지역이면 아니오' },
    saleWin: { t: '청약에 당첨돼 분양받는 집인가요?' },
    landLeaseEarly: { t: '토지임대부 단지의 입주자모집공고(사전청약 포함)가 2026-08-25 이전인가요?' },
    dreamSaved: { t: '청년 주택드림 통장에 1년 이상 가입해 1천만원 이상 냈나요?' },
    youthExtend: { t: '중소·중견기업에 다니거나 창업 지원을 받고 있고, 병역 복무기간을 빼면 만 34세 이하인가요?' }
  };
  // 특공 확인기 문구(2-2·2-3). 없으면 Q를 쓴다
  var QS = {
    house: { t: '본인·배우자(따로 살아도 포함)·같은 등본 가족 누구라도 집이나 분양권·입주권을 갖고 있나요?', h: '같은 등본 만 60세 이상 부모님만 가진 경우는 「애매함」을 고르세요 — 노부모 특공 외에는 무주택으로 볼 수 있어요' },
    kidsMinor: { t: '이미 태어난 미성년 자녀 수', h: '입양 포함. 이혼·재혼이면 같은 등본 자녀만 세요' },
    newborn: { t: '공고일 기준 2세 미만 자녀(입양 포함)가 있나요?', h: '2세가 되는 날까지 포함해요' },
    fetus: { t: '지금 임신 중인 태아 수', h: '특공은 태아도 자녀로 세요' },
    household: { t: '같은 등본 가구원 수', h: '태아 포함. 부모님은 1년 이상 같은 등본일 때만, 형제자매는 같은 등본이어도 세지 마세요', n: '명' },
    otherAdults: { t: '부부 말고 같은 등본에 부모님·성년 자녀가 있나요?', h: '형제자매 제외' },
    fullYearOthers: { t: '그 성인 가족 모두 작년에 1년 내내 일했나요?' },
    unmarriedChild: { t: '같은 등본에 미혼 자녀(성년 포함)가 있나요?', h: '있으면 1인가구가 아니에요' },
    wonByCouple: { t: '그 특별공급 당첨자가 본인이나 배우자인가요?', h: '부모 등 다른 세대원 이력은 예외로 풀리지 않아요' },
    wonPremarital: { t: '그 당첨은 혼인신고 전 이력인가요?' },
    incSelf: { t: '본인 작년 총급여', h: '원천징수영수증 기준(비과세 제외). 실수령액이 아니에요', n: '만원' },
    fullYearSelf: { t: '본인이 작년에 1년 내내 일했나요?' },
    incSpouse: { t: '배우자 작년 총급여', n: '만원' },
    fullYearSpouse: { t: '배우자가 작년에 1년 내내 일했나요?' },
    incOthers: { t: '그 밖 성인 가족 작년 총급여 합계', h: '소득을 보는 공고는 성년 가구원 전원의 소득을 합해요', n: '만원' },
    bankbook: { t: '청약통장', h: '1순위 요건은 지역·주택에 따라 달라요. 모르면 청약홈에서 확인하세요' },
    wonRecent: { t: '본인·배우자·같은 등본 가족이 최근 10년 안에 청약에 당첨된 적이 있나요?', h: '일반공급·특별공급 모두, 계약 안 했어도 포함' },
    wonSpecial: { t: '특별공급에 당첨된 적이 있나요?(계약 안 했어도)', h: '세대당 평생 1회예요. 부적격 취소·사업주체 파산 등 당첨자로 보지 않는 경우나 분양전환 안 되는 공공임대라면 「모름」을 고르고 청약홈에서 확인하세요' },
    everOwned: { t: '세대원 누구라도 집을 가진 적이 있나요?' },
    tax5y: { t: '소득세를 통산 5년 이상 냈나요?' },
    taxRecent: { t: '지금 일하고 있거나 최근 1년 안에 근로·사업소득세를 냈나요?' },
    save600: { t: '청약통장 저축액이 600만원 이상인가요?', h: '국민주택 생애최초에 필요해요' },
    parent65_3y: { t: '만 65세 이상 부모님을 3년 이상 같은 등본으로 모시고 있나요?' },
    parentNoHouse: { t: '부모님(과 그 배우자)도 집·분양권이 없나요?' },
    realEstate331: { t: '세대 부동산 합계(공시가격 기준)가 3억 3,100만원 이하인가요?', h: '세대원 전원, 자동차·예금 제외' },
    childAfter20240619: { t: '2024-06-19 이후 태어난 자녀(태아·입양 포함)가 있나요?' },
    onceExceptionUsed: { t: '그 예외로 특별공급을 이미 한 번 더 쓴 적이 있나요?' }
  };
  var STATUS = { ok: '공통 요건 충족(입력 기준)', check: '확인 필요', no: '해당 안 됨(입력 기준)' };
  var OFF = { ended: '신규 취급 종료', unverified: '취급 여부 확인 필요', planned: '출시 예정' };
  var WARN = {
    buy: '집 계약 전에 기금e든든(보금자리론은 한국주택금융공사)에서 사전 자산심사와 대출 여부를 먼저 확인하세요. 이 화면 결과만 보고 계약하지 마세요.',
    jeonse: '계약 전에 기금e든든에서 대출 여부를 먼저 확인하세요. 보증기관(HUG·HF·SGI) 한도와 은행 심사는 반영하지 않았어요.',
    rent: '계약 전에 기금e든든에서 대출 여부를 먼저 확인하세요.'
  };
  var HEAD_ASKS = { buy: ['term', 'otherInterest', 'regulated'] }; // 묶음 머리 질문(기본값으로 이미 계산됨). saleWin은 「답하면 볼 수 있는 항목」 줄에서 묻는다

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function amt(lo, hi, approx) { return lo === hi ? (approx ? '약 ' : '') + man(hi) : man(lo) + '~' + man(hi); }
  function pctTxt(r) { return r[0] === r[1] ? r[0] + '%' : r[0] + '~' + r[1] + '%'; }

  // 답 칸 하나 그리기(정책대출·특공 공통). o: 칸 설정
  function qBlock(rules, f, g, c, v, opts, filled, extra, q) {
    q = q || Q[f] || { t: (rules.fields[f] || {}).label || f };
    var id = 'cyq-' + (extra ? 's-' : '') + f + '-' + (g || 'c') + (c ? '-' + c : ''), dc = c ? ' data-c="' + c + '"' : '', dg = ' data-f="' + f + '" data-g="' + (g || '') + '"';
    var h = '<div class="cy-q"><p class="cy-qt" id="' + id + '">' + esc(q.t) + (filled ? ' <span class="cy-tag">공고</span>' : '') + '</p>' + (q.h ? '<p class="cy-qh">' + esc(q.h) + '</p>' : '') + (extra && extra.h ? '<p class="cy-qh">' + esc(extra.h) + '</p>' : '');
    if (opts) {
      h += '<div class="cy-opts" role="group" aria-labelledby="' + id + '">' + opts.map(function (o, i) {
        return '<button type="button" class="cy-opt" data-act="pick"' + dg + ' data-i="' + i + '"' + dc + ' aria-pressed="' + (v === o[0]) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    } else {
      h += '<label class="cy-num"><input type="text" inputmode="numeric" autocomplete="off"' + dg + dc + ' value="' + (v == null ? '' : v) + '"' + (DEFAULTS.hasOwnProperty(f) ? ' placeholder="' + DEFAULTS[f] + '"' : '') + ' aria-labelledby="' + id + '"><span>' + esc(q.n || '') + '</span></label>';
    }
    return h + '</div>';
  }
  var SHARED = ['house', 'marriage', 'kidsMinor', 'newborn', 'age', 'head', 'household', 'incSelf', 'incSpouse', 'everOwned'];
  function answered(v) { return v != null && v !== 'unknown'; }
  function copyShared(from, to) { var keys = SHARED.filter(function (k) { return answered(from[k]); }); keys.forEach(function (k) { to[k] = from[k]; }); return keys; }
  // 다른 확인기에서 넣은 값 확인 화면(2-5). 값은 복사만 하고 서로 따라 바뀌지 않는다
  function prefillHtml(rules, from, vals, optsOf) {
    var rows = SHARED.filter(function (f) { return answered(vals[f]); }).map(function (f) {
      var o = optsOf(f, 'buy'), x = o && o.filter(function (e) { return e[0] === vals[f]; })[0], q = Q[f] || {};
      return '<li>' + esc(q.s || q.t || f) + ': <b>' + esc(x ? x[1] : vals[f] + (q.n || '')) + '</b></li>';
    }).join('');
    return '<div class="cy-q"><p class="cy-qt cy-prog-t" tabindex="-1">' + from + '에서 넣은 값이에요. 맞으면 그대로 쓸게요</p><ul class="cy-pf">' + rows + '</ul></div>' +
      '<div class="cy-nav cy-nav-col"><button type="button" class="cy-btn" data-act="pfok">맞아요</button><button type="button" class="cy-btn2" data-act="pfedit">고칠게요</button></div>';
  }

  // 특공 자격 확인기(2-2·2-3·2-4). 답·결과는 이 안에만. 공고 상태는 shared에서 읽기만 한다
  function mountSpecial(box, rules, shared) {
    var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), R = rules.special;
    var S = { step: 0, result: false, a: {}, pre: null, skip: [] };
    var live = document.createElement('p');
    live.className = 'cy-live'; live.setAttribute('aria-live', 'polite');
    box.parentNode.insertBefore(live, box.nextSibling);
    var cache = {};
    function optsOf(f) {
      if (f === 'house') return [['none', '모두 없음'], ['own1', '본인·배우자가 1채'], ['other', '그 밖(2채 이상, 만 60세 미만 가족 소유)'], ['unknown', '애매함']];
      if (OPT[f]) return OPT[f];
      var d = rules.fields[f];
      return d && d.type === 'bool' ? YN : null;
    }
    function visible(f) {
      var a = S.a;
      if (f === 'incSpouse' || f === 'fullYearSpouse') return a.marriage === 'le7y' || a.marriage === 'over7y';
      if (f === 'incOthers' || f === 'fullYearOthers') return a.otherAdults === true;
      return true;
    }
    function screens() {
      var all = [['house', 'marriage'], ['kidsMinor', 'newborn', 'fetus'], ['age', 'head', 'household', 'otherAdults'], ['incSelf', 'fullYearSelf', 'incSpouse', 'fullYearSpouse', 'incOthers', 'fullYearOthers'], ['bankbook'], ['wonRecent', 'wonSpecial']];
      // 가구원 수·자녀 수는 특공 기준(태아 포함, 형제자매 제외, 같은 등본 자녀)이 달라 미리 채워도 다시 보여 준다
      return all.map(function (fs) { return fs.filter(function (f) { return f === 'household' || f === 'kidsMinor' || S.skip.indexOf(f) < 0; }); }).filter(function (fs) { return fs.length; });
    }
    function q(f, c) { return qBlock(rules, f, '', c, S.a[f], optsOf(f), false, { special: true }, QS[f]); }
    function renderStep() {
      var sc = screens(), last = S.step === sc.length - 1;
      var h = '<p class="cy-prog" tabindex="-1">특공 자격 예비 확인 · ' + (S.step + 1) + '/' + sc.length + '</p>';
      sc[S.step].filter(visible).forEach(function (f) { h += q(f); });
      h += '<div class="cy-nav">' + (S.step ? '<button type="button" class="cy-btn2" data-act="prev">이전</button>' : '') + '<button type="button" class="cy-btn" data-act="next">' + (last ? '결과 보기' : '다음') + '</button></div>';
      h += '<p class="cy-foot">모르는 칸은 비워 두면 「확인 필요」로 보여요. 입력값은 저장하거나 보내지 않아요.</p>';
      box.innerHTML = h; live.textContent = '';
    }
    function noticeHead(kind) {
      if (!shared.applied || !shared.notice) return '';
      var n = shared.notice, t = shared.type, btns = '<div class="cy-opts">' + (n.types.length > 1 ? '<button type="button" class="cy-btn2" data-act="nchange">주택형 바꾸기</button>' : '') + '<button type="button" class="cy-btn2" data-act="nremove">공고 정보 빼기</button></div>', h = '<div class="cy-nbar"><p class="cy-nt">「' + esc(n.name) + '」' + (t ? ' ' + esc(CY.typeLabel(t.ty)) : '') + ' 공고 기준이에요' + (n.houseKind ? ' <span>(' + esc(n.houseKind) + ')</span>' : '') + '</p>';
      if (!n.publicLaw && n.types.length) {
        var total = {}, spOk = true;
        n.types.forEach(function (x) { if (!x.spOk) spOk = false; Object.keys(x.spBy || {}).forEach(function (k) { total[k] = (total[k] || 0) + x.spBy[k]; }); });
        if (!spOk) {
          var sp = n.types.reduce(function (s, x) { return s + (x.sp || 0); }, 0);
          h += '<p class="cy-qh">유형 구분 없음(신혼희망타운 등) — 특별공급 ' + sp + '세대</p>';
        } else {
          var rows = SP_NAMES.filter(function (e) { return total[e[0]]; }).map(function (e) { return e[1] + ' ' + (t ? ((t.spBy || {})[e[0]] || 0) + '/' : '') + total[e[0]]; }).join(' · ');
          h += '<p class="cy-qh">' + (rows ? '이 공고의 특별공급 세대(' + (t ? esc(CY.typeLabel(t.ty)) + ' / ' : '') + '전체): ' + rows : '이 공고에는 특별공급 세대가 없어요') + '</p>';
        }
      }
      if (n.noticeDate && n.noticeDate < '2026-06-15') h += '<p class="cy-qh">2026-06-15 전 공고라 종전 규정이 적용될 수 있어요 — 공고문을 확인하세요</p>';
      return h + btns + '</div>';
    }
    function isOff(n) { return n && (n.publicLaw || n.kind !== 'APT'); }
    function answersFor(n) {
      var a = {}, k;
      for (k in S.a) a[k] = S.a[k];
      if (n && Array.isArray(n.regFlags)) a.regulated = n.regFlags.length > 0; // 공고의 규제 표시는 묻지 않고 쓴다(대출 탭과 답을 섞지 않음)
      return a;
    }
    function cardHtml(r, kind) {
      var p = r.p, n = shared.applied && shared.notice, h = '<article class="cy-card is-' + r.status + '" data-p="' + p.code + '">';
      h += '<p class="cy-st">' + STATUS[r.status] + '</p><h4 tabindex="-1">' + esc(p.name) + '</h4>';
      if (r.status === 'check' && r.why) h += '<p class="cy-why">' + esc(r.why) + '</p>';
      r.lines.forEach(function (l) {
        var tier = l.v === false ? '해당 안 됨: ' + (l.why || '') : l.v === true ? (l.tier + (/소득|사업주체/.test(l.tier) ? '' : ' 소득 구간')) : '구간 확인 필요' + (l.maybe.length ? '(' + l.maybe.concat(l.tier ? [l.tier] : []).join(' 또는 ') + ')' : '') + (l.why ? ': ' + l.why : '');
        h += '<p class="cy-amt"><span class="cy-vl">' + esc(kind === 'private' ? '민영' : kind === 'national' ? '국민' : l.vt.label) + '</span> ' + esc(tier) + '</p>';
      });
      var a = r.asks.filter(function (f) { return QS[f] || Q[f]; });
      a = a.filter(function (f) { return S.a[f] == null; }).concat(a.filter(function (f) { return S.a[f] != null; })).slice(0, 3); // 아직 안 답한 질문 먼저
      if (a.length) h += '<div class="cy-asks"><p class="cy-askt">아래를 답하면 확인할 수 있어요</p>' + a.map(function (f) { return q(f, p.code); }).join('') + '</div>';
      if (n && n.types.length && n.types.every(function (t) { return t.spOk; })) {
        if (!n.types.some(function (t) { return (t.spBy || {})[p.sp]; })) h += '<p class="cy-why">이 공고에는 이 유형 물량이 없어요</p>';
        else if (shared.type && !(shared.type.spBy || {})[p.sp]) h += '<p class="cy-why">고른 주택형에는 이 유형 물량이 없어요</p>';
      }
      if (p.code === 'A2' && shared.applied && shared.type && shared.type.ex > 60 && r.notes.some(function (x) { return x.indexOf('1인가구') >= 0; })) h += '<p class="cy-why">이 주택형은 전용 60㎡를 넘어요. 단독세대는 신청할 수 없어요(직계존속과 같은 등본이면 공고문 확인)</p>';
      if (r.notes.length) h += '<details class="cy-notes"><summary>알아 둘 것 ' + r.notes.length + '개</summary><ul>' + r.notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
      h += '<p class="cy-links">' + (p.links.guide ? '<a href="' + esc(p.links.guide) + '">' + esc(p.links.guideLabel || '신청 방법·조건 글') + '</a>' : '') +
        '<button type="button" class="cy-btn2" data-act="supply" data-p="' + p.code + '">이 유형 물량이 있는 공고</button>' +
        '<a href="' + esc(p.links.official) + '" target="_blank" rel="noopener">청약홈 공식 안내</a></p>';
      if (cache[p.code]) h += cache[p.code];
      return h + '</article>';
    }
    function renderResult() {
      var n = shared.applied && shared.notice, kind = n ? CY.noticeKind(n) : null;
      var rs = isOff(n) ? [] : CY.matchSpecial(rules, answersFor(n), today, kind);
      var by = function (st) { return rs.filter(function (r) { return r.status === st; }); };
      var sum = isOff(n) ? '이 공고는 계산 범위 밖이에요' : [by('ok').length && '공통 요건 충족 ' + by('ok').length, by('check').length && '확인 필요 ' + by('check').length, by('no').length && '해당 안 됨 ' + by('no').length].filter(Boolean).join(' · ');
      var body = '<p class="cy-warn">' + esc(R.warn) + '</p>';
      if (isOff(n)) body += '<p class="cy-why">' + esc(n.publicLaw ? R.outOfScope : R.outOfKind) + '</p>' + (shared.no ? '<p class="cy-links"><a href="https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=' + esc(shared.no) + '&pblancNo=' + esc(shared.no) + '" target="_blank" rel="noopener">청약홈 공고 보기</a></p>' : '');
      rs.forEach(function (r) { if (r.status === 'ok' || r.status === 'check') body += cardHtml(r, kind); });
      if (by('later').length) body += '<div class="cy-asks"><p class="cy-askt">답하면 볼 수 있는 항목: ' + by('later').map(function (r) { return esc(r.p.name); }).join(' · ') + '</p>' + q('parent65_3y') + '</div>';
      if (by('no').length) body += '<details class="cy-no"><summary>해당 안 됨 ' + by('no').length + '개 보기</summary><ul>' + by('no').map(function (r) { return '<li><b>' + esc(r.p.name) + '</b>: ' + esc(r.why || '') + '</li>'; }).join('') + '</ul></details>';
      // 카드에서만 답한 값도 고칠 수 있게 모아 둔다(답한 뒤 카드 질문이 사라져도)
      var onScreens = screens().reduce(function (m, fs) { return m.concat(fs); }, ['house', 'marriage', 'kidsMinor', 'newborn', 'fetus', 'age', 'head', 'household', 'otherAdults', 'incSelf', 'fullYearSelf', 'incSpouse', 'fullYearSpouse', 'incOthers', 'fullYearOthers', 'bankbook', 'wonRecent', 'wonSpecial']);
      var cardOnly = Object.keys(S.a).filter(function (f) { return onScreens.indexOf(f) < 0 && answered(S.a[f]) && (QS[f] || Q[f]); });
      if (cardOnly.length) body += '<details class="cy-asks"><summary>결과 화면에서 답한 값 고치기</summary>' + cardOnly.map(function (f) { return q(f, 'fix'); }).join('') + '</details>';
      (R.info || []).forEach(function (x) { body += '<p class="cy-off">' + esc(x.name) + ': ' + esc(x.text) + '</p><p class="cy-links"><a href="' + esc(x.link) + '">기관추천 자세히(내 블로그)</a></p>'; });
      box.innerHTML = '<div class="cy-res-head"><p class="cy-prog" tabindex="-1">특공 자격 예비 확인</p><button type="button" class="cy-btn2" data-act="edit">답 고치기</button><button type="button" class="cy-btn2" data-act="reset">다시 하기</button></div>' +
        '<p class="cy-fix">입력하신 값으로만 본 예비 확인이에요(기준일 ' + esc(R.programs.reduce(function (m, p) { return !m || p.checked < m ? p.checked : m; }, '')) + '). 실제 자격은 입주자모집공고와 기관 심사에서 정해져요. 민영·국민주택 기준이고 공공주택 특별법 적용 공고는 포함하지 않아요.</p>' +
        noticeHead(kind) + '<p class="cy-sum" tabindex="-1">' + esc(sum || '결과 없음') + '</p>' + body +
        '<p class="cy-foot">공고마다 해당지역 거주기간·공급 비율이 달라요. 입력값은 이 계산기 코드가 저장하거나 보내지 않아요.</p>';
      live.textContent = sum || '결과 없음';
    }
    function render(sel, card) {
      var had = box.contains(document.activeElement);
      if (S.pre) { box.innerHTML = prefillHtml(rules, '정책대출', S.pre, optsOf); live.textContent = ''; } else if (S.result) renderResult(); else renderStep();
      var el = sel && box.querySelector(sel);
      if (el) el.focus();
      // 누른 칸이 사라지면 그 카드 제목, 없으면 요약 줄로(15-4)
      if (had && !box.contains(document.activeElement)) {
        var back = (card && box.querySelector('.cy-card[data-p="' + card + '"] h4')) || box.querySelector('.cy-sum') || box.querySelector('.cy-prog');
        if (back) back.focus();
      }
    }
    function top() { render(S.pre ? '.cy-prog-t' : '.cy-prog'); if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start' }); }
    function num(v) { var n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return isNaN(n) ? undefined : n; }
    var pressing = false, redraw = false;
    box.addEventListener('mousedown', function (e) { pressing = !!(e.target.closest && e.target.closest('button, a, summary')); });
    document.addEventListener('mouseup', function () {
      if (!pressing) return;
      pressing = false;
      setTimeout(function () { if (redraw) { redraw = false; render(); } }, 0);
    });
    function supply(code) {
      var p = R.programs.filter(function (x) { return x.code === code; })[0];
      var base = String(g.CHEONGYAK_SCHEDULE_URL || '').replace(/[^\/]*$/, '');
      var json = function (f) { return fetch(base + f, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
      var sel = '[data-act="supply"][data-p="' + code + '"]', n = shared.applied && shared.notice, nk = n ? CY.noticeKind(n) : null;
      cache[code] = '<p class="cy-sup">공고를 찾는 중이에요…</p>';
      render(sel, code);
      Promise.all([json('notices.json'), json('schedule.json')]).then(function (d) {
        // 지금 판정에서 해당 안 됨인 변형(민영·국민) 공고는 빼고, 공고를 가져왔으면 그 쪽만(7-2)
        var cur = CY.matchSpecial(rules, answersFor(n), today, nk).filter(function (x) { return x.p.code === code; })[0];
        var kinds = (cur.lines || []).filter(function (l) { return l.v !== false; }).reduce(function (a, l) { return a.concat(l.vt.kinds); }, []);
        if (!cur.lines || !cur.lines.length) kinds = nk ? [nk] : ['private', 'national'];
        var list = CY.supplyList(d[0], d[1], p.sp, today, kinds, code === 'A3');
        cache[code] = '<div class="cy-sup"><p class="cy-askt">이 유형 특별공급 물량이 있는 공고(자격은 공고문 확인)</p>' + (list.length ? '<ul>' + list.map(function (x) {
          return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a> · ' + esc(x.region || '') + ' · 접수 ' + esc(x.date) + ' · ' + x.units + '세대' + (x.knownKind ? ' · ' + esc(x.kind) : ' · 주택 구분 확인 필요') + (x.old ? ' · 종전 규정' : '') + '</li>';
        }).join('') + '</ul>' : '<p class="cy-qh">지금 접수 전·중인 공고 가운데 없어요</p>') + '</div>';
        if (S.result) render(document.activeElement === document.body || box.contains(document.activeElement) ? sel : null, code);
        live.textContent = list.length ? p.name + ' 물량이 있는 공고 ' + list.length + '곳' : p.name + ' 물량이 있는 공고 없음';
      }).catch(function () { cache[code] = '<p class="cy-sup">공고 목록을 불러오지 못했어요</p>'; if (S.result) render(sel, code); });
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-act]');
      if (!b) return;
      redraw = false;
      var act = b.getAttribute('data-act'), f = b.getAttribute('data-f');
      if (act === 'pick') {
        var c = b.getAttribute('data-c'), cs = c ? '[data-c="' + c + '"]' : ':not([data-c])';
        S.a[f] = optsOf(f)[+b.getAttribute('data-i')][0];
        cache = {}; // 답이 바뀌면 열어 둔 공고 목록도 다시 고른다
        return render('[data-act="pick"][data-f="' + f + '"][data-i="' + b.getAttribute('data-i') + '"]' + cs, c);
      }
      if (act === 'supply') return supply(b.getAttribute('data-p'));
      if (act === 'nchange' || act === 'nremove') { if (shared.act) shared.act(act); return; }
      if (act === 'pfok' || act === 'pfedit') {
        var kept = copyShared(S.pre, S.a);
        S.pre = null; S.skip = act === 'pfok' ? kept : []; S.step = 0;
        if (act === 'pfedit') S.result = false;
        return top();
      }
      if (act === 'next') { if (S.step < screens().length - 1) S.step++; else S.result = true; return top(); }
      if (act === 'prev') { S.step--; return top(); }
      if (act === 'edit') { S.result = false; S.step = 0; S.skip = []; return top(); }
      if (act === 'reset') { S = { step: 0, result: false, a: {}, pre: null, skip: [] }; cache = {}; return top(); }
    });
    box.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute && t.hasAttribute('data-f') && !S.result) { S.a[t.getAttribute('data-f')] = num(t.value); cache = {}; }
    });
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (!(t.getAttribute && t.hasAttribute('data-f')) || !S.result) return;
      var f = t.getAttribute('data-f'), c = t.getAttribute('data-c');
      S.a[f] = num(t.value);
      cache = {};
      if (pressing) { redraw = true; return; }
      render('input[data-f="' + f + '"]' + (c ? '[data-c="' + c + '"]' : ':not([data-c])'), c);
    });
    render();
    return {
      answers: function () { return S.a; },
      touched: function () { return SHARED.some(function (k) { return answered(S.a[k]); }); },
      // 정책대출의 「그 밖」(다른 가족 소유)은 특공에서 60세 이상 부모 소유와 갈린다: 넘기지 않고 다시 묻는다
      prefill: function (v) { if (v.house === 'other') delete v.house; if (!SHARED.some(function (k) { return answered(v[k]); })) return; S.pre = v; render(); },
      redraw: function () { cache = {}; render(); },
    };
  }

  // 계산기 입구: 규칙에 special이 있으면 탭 둘(15-2). 탭마다 답을 따로 가진다(2-5)
  CY.mount = function (box, rules, hash, notice) {
    if (!rules.special) { mountLoan(box, rules, hash, notice, {}); return; }
    box.innerHTML = '<div class="cy-tabs" role="tablist" aria-label="확인기 고르기"><button type="button" role="tab" id="cy-tab-loan" aria-controls="cy-pane-loan">정책대출</button><button type="button" role="tab" id="cy-tab-special" aria-controls="cy-pane-special">특공 자격</button></div>' +
      '<div id="cy-pane-loan" role="tabpanel" aria-labelledby="cy-tab-loan"><div class="cy-root"></div></div><div id="cy-pane-special" role="tabpanel" aria-labelledby="cy-tab-special"><div class="cy-root"></div></div>';
    var mn = /[#&]n=(\d+)/.exec(hash || '');
    var shared = { notice: notice || null, no: mn ? mn[1] : null, applied: false, type: null, act: null };
    var loan = mountLoan(box.querySelector('#cy-pane-loan .cy-root'), rules, hash, notice, shared);
    var special = mountSpecial(box.querySelector('#cy-pane-special .cy-root'), rules, shared);
    var offered = { loan: false, special: false };
    function show(tab) {
      ['loan', 'special'].forEach(function (t) {
        var on = t === tab, b = box.querySelector('#cy-tab-' + t);
        b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
        box.querySelector('#cy-pane-' + t).hidden = !on;
      });
      // 다른 확인기에서 답한 값이 있으면 처음 열 때 한 번 확인받는다
      if (!offered[tab]) {
        var from = tab === 'special' ? loan : special, to = tab === 'special' ? special : loan;
        if (from.touched() && !to.touched()) { offered[tab] = true; var snap = {}, fa = from.answers(); SHARED.forEach(function (k) { snap[k] = fa[k]; }); to.prefill(snap); }
      }
      if (tab === 'special') special.redraw();
    }
    // 특공 탭의 공고 줄 버튼: 공고 상태는 정책대출 쪽이 가진다
    shared.act = function (a) { if (a === 'nchange') { show('loan'); loan.notice(a); } else { loan.notice(a); special.redraw(); } };
    box.querySelector('.cy-tabs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[role=tab]');
      if (b) show(b.id === 'cy-tab-special' ? 'special' : 'loan');
    });
    box.querySelector('.cy-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var tab = box.querySelector('#cy-tab-loan').getAttribute('aria-selected') === 'true' ? 'special' : 'loan';
      show(tab);
      box.querySelector('#cy-tab-' + tab).focus();
      e.preventDefault();
    });
    show(/[#&]calc=special/.test(hash || '') && !/[#&]n=\d/.test(hash || '') ? 'special' : 'loan');
  };

  function mountLoan(box, rules, hash, notice, shared) {
    var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    if (notice && !Array.isArray(notice.types)) notice.types = [];
    var groups = GROUPS.filter(function (g) { return rules.loans.some(function (p) { return p.group === g[0] && p.offer === 'active'; }); });
    var S = { step: 0, result: false, mode: {}, c: {}, g: { buy: {}, jeonse: {}, rent: {} } };
    // 공고 상태: nstep(ask·type 화면), applied(채움), typeOf(고른 주택형), filled(공고에서 채운 칸 — 사람이 고치면 빠진다), offer(「공고 정보로 채우기」 줄)
    var N = { nstep: notice ? 'ask' : null, applied: false, typeOf: null, filled: {}, offer: false };
    var m = /[#&]t=(buy|jeonse|rent)/.exec(hash || '');
    var preset = m ? m[1] : /[#&]n=\d/.test(hash || '') ? 'buy' : null;
    if (preset) S.mode[preset] = true;
    // 결과 요약 알림(15-4): 다시 그려도 사라지지 않게 상자 밖에 한 번만 둔다
    var live = document.createElement('p');
    live.className = 'cy-live'; live.setAttribute('aria-live', 'polite');
    box.parentNode.insertBefore(live, box.nextSibling);

    function store(f, g) { return GROUP_FIELDS.indexOf(f) >= 0 ? S.g[g] : S.c; }
    function get(f, g) { return f === 'saleWin' ? S.c.saleWinQ : store(f, g)[f]; }
    function fk(f, g) { return (GROUP_FIELDS.indexOf(f) >= 0 ? g : 'c') + ':' + f; }
    function set(f, g, v) {
      if (get(f, g) !== v) delete N.filled[fk(f, g)];
      if (f === 'saleWin') {
        var s = SALE.filter(function (o) { return o[0] === v; })[0];
        S.c.saleWinQ = v; S.c.saleWin = s[2]; S.c.landLease = s[3];
        return;
      }
      store(f, g)[f] = v;
    }
    function clearFilled() {
      for (var k in N.filled) {
        var a = k.split(':');
        delete (a[0] === 'c' ? S.c : S.g[a[0]])[a[1]];
      }
      N.filled = {};
    }
    // 공고 값 채우기. 사람이 이미 넣은 칸은 건드리지 않는다(16-4)
    function applyNotice(t) {
      clearFilled();
      var o = CY.noticeFill(notice, t);
      for (var f in o) {
        var st = store(f, 'buy');
        if (st[f] != null) continue;
        st[f] = o[f]; N.filled[fk(f, 'buy')] = 1;
      }
      S.mode.buy = true; N.applied = true; N.typeOf = t; N.offer = false; N.nstep = null;
      shared.applied = true; shared.type = t;
    }
    function isFilled(f, g) { return !!N.filled[fk(f, g)]; }
    function labelOf(f) { var o = optsOf(f, 'buy'), v = S.g.buy[f], x = (o || []).filter(function (e) { return e[0] === v; })[0]; return x ? x[1] : ''; }
    function noticeBar() {
      if (N.offer) return '<div class="cy-nbar"><button type="button" class="cy-btn2" data-act="noffer">「' + esc(notice.name) + '」 공고 정보로 채우기</button></div>';
      if (!N.applied) return '';
      var t = N.typeOf, parts = S.mode.buy ? ['집 살 때'] : [];
      if (isFilled('buyKind', 'buy')) parts.push(labelOf('buyKind'));
      if (isFilled('area', 'buy')) parts.push(labelOf('area'));
      if (isFilled('region', 'buy')) parts.push(labelOf('region'));
      if (isFilled('price', 'buy')) parts.push('집값 ' + man(S.g.buy.price) + '(최고가 기준)');
      if (isFilled('regulated')) parts.push((S.c.regulated ? '규제지역' : '규제지역 아님') + '(공고 기준. 대출은 접수일 기준이에요)');
      var kind = [notice.houseKind, notice.publicLaw ? '공공주택특별법 적용' : ''].filter(Boolean).join(' · ');
      return '<div class="cy-nbar"><p class="cy-nt">「' + esc(notice.name) + '」' + (t ? ' ' + esc(CY.typeLabel(t.ty)) : '') + ' 공고 정보로 계산했어요' + (kind ? ' <span>(' + esc(kind) + ')</span>' : '') + '</p>' +
        ((S.result || S.step === 0) && parts.length ? '<p class="cy-qh">공고에서 채운 값: ' + esc(parts.join(' · ')) + '</p>' : '') +
        '<div class="cy-opts">' + (notice.types.length > 1 ? '<button type="button" class="cy-btn2" data-act="nchange">주택형 바꾸기</button>' : '') + '<button type="button" class="cy-btn2" data-act="nremove">공고 정보 빼기</button></div></div>';
    }
    function renderNotice() {
      var h, types = notice.types;
      if (N.nstep === 'ask') {
        var what = types.length ? '분양가·지역·전용면적·주택 종류를' : notice.buyKind ? '지역·주택 종류를' : '지역을';
        h = '<div class="cy-q"><p class="cy-qt cy-prog-t" tabindex="-1">보고 있던 「' + esc(notice.name) + '」 공고 정보로 계산할까요?</p><p class="cy-qh">' + what + ' 채워 드려요. 언제든 고칠 수 있어요.</p></div>' +
          '<div class="cy-nav cy-nav-col"><button type="button" class="cy-btn" data-act="nyes">예, 채워 주세요</button><button type="button" class="cy-btn2" data-act="nno">아니요, 직접 입력할게요</button></div>';
      } else {
        h = '<div class="cy-q"><p class="cy-qt cy-prog-t" tabindex="-1">주택형을 골라 주세요</p><p class="cy-qh">공고의 순서예요. 분양가는 주택형의 최고가이고, 층·동에 따라 더 낮을 수 있어요.</p><div class="cy-types">' +
          types.map(function (t, i) {
            return '<button type="button" class="cy-opt" data-act="ntype" data-i="' + i + '" aria-pressed="' + (N.typeOf === t) + '"><b>' + esc(CY.typeLabel(t.ty)) + '</b>' + (t.ex > 0 ? ' · 전용 ' + t.ex.toFixed(2) + '㎡' : '') + (t.top > 0 ? ' · 최고 분양가 ' + man(t.top) : '') + ' · 일반 ' + t.gen + ' · 특별 ' + t.sp + '세대</button>';
          }).join('') +
          '<button type="button" class="cy-opt" data-act="ntype" data-i="-1">아직 못 정했어요</button></div></div>';
      }
      box.innerHTML = h;
      live.textContent = '';
    }
    function ansFor(g) { var a = {}, k; for (k in S.c) a[k] = S.c[k]; for (k in S.g[g]) a[k] = S.g[g][k]; return a; }
    function optsOf(f, g) {
      if (f === 'saleWin') return SALE;
      if (f === 'loanNow') return g === 'buy' ? OPT.loanNowBuy : OPT.loanNow;
      if (OPT[f]) return OPT[f];
      var d = rules.fields[f];
      return d && d.type === 'bool' ? YN : null;
    }
    function visible(f) {
      if (f === 'incSpouse') return (S.c.marriage && S.c.marriage !== 'single') || S.c.newborn === 'yes';
      if (f === 'increase') return S.g.jeonse.contract === 'renew' || S.g.rent.contract === 'renew';
      return true;
    }
    function qHtml(f, g, c) {
      var extra = null;
      if (f === 'saleWin' && N.applied && !(notice.kind === '공공지원 민간임대' || (/임대/.test(notice.name) && !/토지임대부/.test(notice.name)))) extra = { h: '이 공고로 당첨되면 분양받는 집이에요' };
      if (f === 'price' && isFilled(f, g)) extra = { h: '최고가 기준이에요. 층·동에 따라 더 낮을 수 있어 고칠 수 있어요' };
      if (f === 'regulated' && isFilled(f, g)) extra = { h: '공고 기준이에요. 대출은 접수일 기준이라 그 사이 바뀔 수 있어요' };
      return qBlock(rules, f, g, c, get(f, g), optsOf(f, g), isFilled(f, g), extra);
    }
    function screens() {
      var s = [{ mode: true }];
      [['house', 'marriage'], ['kidsMinor', 'newborn'], ['age', 'head', 'household'], ['incSelf', 'incSpouse', 'netAsset']].forEach(function (fs) {
        var left = fs.filter(function (f) { return !S.skip || S.skip.indexOf(f) < 0; });
        if (left.length) s.push({ f: left });
      });
      if (S.mode.buy) s.push({ g: 'buy', f: ['price', 'buyKind', 'area'] }, { g: 'buy', f: ['region', 'loanNow'] });
      if (S.mode.jeonse) s.push({ g: 'jeonse', f: ['deposit', 'contract', 'increase'] }, { g: 'jeonse', f: ['area', 'region', 'loanNow'] });
      return s;
    }

    function renderStep() {
      var sc = screens(), st = sc[S.step], last = S.step === sc.length - 1;
      var h = '<p class="cy-prog" tabindex="-1">정책대출 예비 확인 · ' + (S.step + 1) + '/' + sc.length + '</p>' + noticeBar();
      if (st.mode) {
        h += '<div class="cy-q"><p class="cy-qt" id="cyq-mode">어떤 정책대출을 알아볼까요?(여러 개 선택)</p><div class="cy-opts" role="group" aria-labelledby="cyq-mode">' +
          groups.map(function (g) { return '<button type="button" class="cy-opt" data-act="mode" data-v="' + g[0] + '" aria-pressed="' + !!S.mode[g[0]] + '">' + g[1] + '</button>'; }).join('') + '</div></div>';
      } else {
        if (st.g) h += '<p class="cy-grp">' + esc(GROUPS.filter(function (g) { return g[0] === st.g; })[0][1]) + ' — 그 집에 대해</p>';
        st.f.filter(visible).forEach(function (f) { h += qHtml(f, st.g); });
      }
      h += '<div class="cy-nav">' + (S.step ? '<button type="button" class="cy-btn2" data-act="prev">이전</button>' : '') +
        '<button type="button" class="cy-btn" data-act="next">' + (last ? '결과 보기' : '다음') + '</button></div>';
      h += '<p class="cy-foot">' + (st.mode && !groups.some(function (g) { return S.mode[g[0]]; }) ? '하나 이상 골라 주세요. ' : '') + '모르는 칸은 비워 두면 「확인 필요」로 보여요. 입력값은 저장하거나 보내지 않아요.</p>';
      box.innerHTML = h;
      live.textContent = '';
    }

    function lineHtml(r, l, multi) {
      var L = l.limit, h = '<div class="cy-line">', lab = multi ? '<span class="cy-vl">' + esc(l.vt.label) + '</span> ' : '';
      if (l.v === null) h += '<p class="cy-why">' + lab + '확인 필요: ' + esc(l.why || '아래를 답하면 확인할 수 있어요') + '</p>';
      if (L) {
        h += '<p class="cy-amt">' + (l.v === null ? '' : lab) + '최대 예상 금액 <b>' + amt(L.lo, L.hi, L.approx) + '</b> <span class="cy-by">← ' + esc(L.by.label) + '에서 정해짐</span></p>';
        if (L.skipped.length) h += '<p class="cy-sk">' + esc(L.skipped.join(' · ')) + '은 입력이 없어 빼고 계산했어요</p>';
        h += '<details class="cy-calc-d"><summary>계산 보기</summary><ul>' + L.terms.map(function (t) {
          var a = amt(t.lo, t.hi, t.d.approx), s = esc(t.label) + ': ';
          if (t.k === 'pct') s += man(t.d.base) + ' × ' + pctTxt(t.d.pct) + (t.d.minus ? ' − ' + esc(t.d.minus.label) + ' ' + amt(t.d.minus.lo, t.d.minus.hi) : '') + ' = ' + a;
          else if (t.k === 'dti') s += '소득 ' + man(t.d.inc) + ' × ' + pctTxt(t.d.pct) + (t.d.oi ? ' − 다른 대출 이자 ' + man(t.d.oi) : '(다른 대출 이자 0원으로 계산)') + ', 연 ' + t.d.rate.toFixed(2) + '%' + (t.d.top ? '(그 만기 가장 높은 줄)' : '') + '·' + t.d.term + '년·원리금균등·거치 없음 가정 → ' + a;
          else s += a;
          return '<li>' + s + '</li>';
        }).join('') + '</ul></details>';
      }
      return h + '</div>';
    }
    function asksHtml(r, g, c) {
      var skip = (HEAD_ASKS[g] || []).concat(g === 'buy' ? ['saleWin'] : []);
      var a = r.asks.filter(function (f) { return Q[f] && skip.indexOf(f) < 0; });
      a = a.filter(function (f) { return get(f, g) == null; }).concat(a.filter(function (f) { return get(f, g) != null; })).slice(0, 3);
      return a.length ? '<div class="cy-asks"><p class="cy-askt">아래를 답하면 더 정확해져요</p>' + a.map(function (f) { return qHtml(f, g, c); }).join('') + '</div>' : '';
    }
    function cardHtml(r, g) {
      var p = r.p, multi = p.variants.length > 1, h = '<article class="cy-card is-' + r.status + '" data-p="' + p.code + '">';
      h += '<p class="cy-st">' + STATUS[r.status] + '</p><h4 tabindex="-1">' + esc(p.name) + ' <span>(' + esc(p.org) + ')</span></h4>';
      if (r.status === 'check' && r.why) h += '<p class="cy-why">' + esc(r.why) + '</p>';
      r.lines.forEach(function (l) { h += lineHtml(r, l, multi); });
      h += asksHtml(r, g, p.code);
      h += '<p class="cy-rate">정책 금리 ' + esc(CY.rateText(p, today)) + (p.rate.note ? ' · ' + esc(p.rate.note) : '') + '</p>';
      if (r.notes.length) h += '<details class="cy-notes"><summary>알아 둘 것 ' + r.notes.length + '개</summary><ul>' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></details>';
      h += '<p class="cy-fix">은행·기금 심사(담보평가·신용·보증 한도·선순위 채권)로 달라질 수 있는 예상값이에요.</p><p class="cy-links">';
      if (p.links.guide) h += '<a href="' + esc(p.links.guide) + '">' + esc(p.links.guideLabel || '신청 방법·조건 글') + '</a>';
      else if (p.links.related) h += '<a href="' + esc(p.links.related) + '">관련 글</a>';
      h += '<a href="' + esc(p.links.official) + '" target="_blank" rel="noopener">공식 안내</a></p>';
      return h + '</article>';
    }
    function renderResult() {
      var names = {}, cnt = { ok: 0, check: 0, no: 0 }, body = '';
      rules.loans.forEach(function (p) { names[p.id] = p.name; });
      groups.filter(function (g) { return S.mode[g[0]]; }).forEach(function (gg) {
        var g = gg[0], rs = CY.match(rules, ansFor(g), today, g), h = '';
        var by = function (s) { return rs.filter(function (r) { return r.status === s; }); };
        h += '<section class="cy-group"><h3>' + esc(gg[1]) + ' 정책대출</h3><p class="cy-warn">' + esc(WARN[g]) + '</p>';
        h += '<p class="cy-note">상품은 정해진 순서(상품 번호 순)로 보여요. 금리·금액 순이 아니에요.' +
          (g === 'buy' ? ' 최대 예상 금액은 만기 ' + (S.c.term || 30) + '년·원리금균등·거치 없음으로 계산했고, DSR 등 은행 심사는 반영하지 않았어요.' : '') + '</p>';
        (HEAD_ASKS[g] || []).forEach(function (f) {
          if (f === 'term' && S.c.term == null) S.c.term = 30;
          h += qHtml(f, g);
        });
        rs.forEach(function (r) { if (r.status === 'ok' || r.status === 'check') { cnt[r.status]++; h += cardHtml(r, g); } });
        if (by('later').length || (g === 'buy' && S.c.saleWinQ != null)) {
          h += '<div class="cy-asks">' + (by('later').length ? '<p class="cy-askt">답하면 볼 수 있는 항목: ' + by('later').map(function (r) { return esc(r.p.name); }).join(' · ') + '</p>' : '') + qHtml('saleWin', g) + '</div>';
        }
        var no = by('no'); cnt.no += no.length;
        if (no.length) h += '<details class="cy-no"><summary>해당 안 됨 ' + no.length + '개 보기</summary><ul>' + no.map(function (r) { return '<li><b>' + esc(r.p.name) + '</b>: ' + esc(r.why || '') + '</li>'; }).join('') + '</ul></details>';
        by('off').forEach(function (r) {
          h += '<p class="cy-off">' + OFF[r.p.offer] + ': ' + esc(r.p.name) + ' — ' + esc(r.p.offerNote) + ((r.p.instead || []).length ? ' → 대신 볼 상품: ' + r.p.instead.map(function (i) { return esc(names[i] || i); }).join(' · ') : '') + '</p>';
        });
        body += h + '</section>';
      });
      var sum = [cnt.ok && '공통 요건 충족 ' + cnt.ok, cnt.check && '확인 필요 ' + cnt.check, cnt.no && '해당 안 됨 ' + cnt.no].filter(Boolean).join(' · ');
      box.innerHTML = '<div class="cy-res-head"><p class="cy-prog" tabindex="-1">정책대출 예비 확인</p><button type="button" class="cy-btn2" data-act="edit">답 고치기</button><button type="button" class="cy-btn2" data-act="reset">다시 하기</button></div>' +
        '<p class="cy-fix">입력하신 값으로만 본 예비 확인이에요(기준일 ' + esc(CY.checkedOf(rules)) + '). 실제 대상·한도·금리는 취급은행·기금 심사에서 정해져요.</p>' +
        noticeBar() + '<p class="cy-sum" tabindex="-1">' + esc(sum || '결과 없음') + '</p>' + body +
        '<p class="cy-foot">입력값은 이 계산기 코드가 저장하거나 보내지 않아요. 결과를 남기려면 화면을 캡처하세요.</p>';
      live.textContent = sum || '결과 없음';
    }
    function render(focusSel) {
      if (N.nstep) renderNotice();
      else if (PRE) { box.innerHTML = prefillHtml(rules, '특공 자격', PRE, optsOf); live.textContent = ''; }
      else if (S.result) renderResult(); else renderStep();
      var el = focusSel && box.querySelector(focusSel);
      if (el) el.focus();
    }
    function top() {
      render(N.nstep || PRE ? '.cy-prog-t' : '.cy-prog');
      if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start' });
    }
    function num(v) { var n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return isNaN(n) ? undefined : n; }

    var pressing = false, redraw = false, PRE = null;
    box.addEventListener('mousedown', function (e) { pressing = !!(e.target.closest && e.target.closest('button, a, summary')); });
    document.addEventListener('mouseup', function () {
      if (!pressing) return;
      pressing = false;
      setTimeout(function () { if (redraw) { redraw = false; render(); } }, 0);
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-act]');
      if (!b) return;
      redraw = false; // 아래 동작이 어차피 다시 그린다
      var act = b.getAttribute('data-act'), f = b.getAttribute('data-f'), g = b.getAttribute('data-g');
      if (act === 'nyes' || act === 'noffer' || act === 'nchange') {
        if (notice.types.length > 1) N.nstep = 'type';
        else applyNotice(notice.types[0] || null);
        return top();
      }
      if (act === 'nno') { N.nstep = null; N.offer = true; return top(); }
      if (act === 'ntype') { var ti = +b.getAttribute('data-i'); applyNotice(ti >= 0 ? notice.types[ti] : null); return top(); }
      if (act === 'nremove') { clearFilled(); N.applied = false; N.typeOf = null; N.offer = true; shared.applied = false; shared.type = null; return top(); }
      if (act === 'pfok' || act === 'pfedit') {
        var kept = copyShared(PRE, S.c);
        PRE = null; S.skip = act === 'pfok' ? kept : []; S.step = 0;
        if (act === 'pfedit') S.result = false;
        return top();
      }
      if (act === 'mode') { var v = b.getAttribute('data-v'); S.mode[v] = !S.mode[v]; return render('[data-act="mode"][data-v="' + v + '"]'); }
      if (act === 'pick') {
        var c = b.getAttribute('data-c'), cs = c ? '[data-c="' + c + '"]' : ':not([data-c])';
        set(f, g, optsOf(f, g)[+b.getAttribute('data-i')][0]);
        render('[data-act="pick"][data-f="' + f + '"][data-g="' + g + '"][data-i="' + b.getAttribute('data-i') + '"]' + cs);
        // 답한 질문이 카드에서 사라지면 그 카드 제목으로, 카드가 「해당 안 됨」으로 접히면 요약 줄로
        if (c && !box.contains(document.activeElement)) { var h4 = box.querySelector('.cy-card[data-p="' + c + '"] h4') || box.querySelector('.cy-sum'); if (h4) h4.focus(); }
        return;
      }
      if (act === 'next') {
        if (S.step === 0 && !groups.some(function (x) { return S.mode[x[0]]; })) return render('[data-act="next"]');
        if (S.step < screens().length - 1) S.step++; else S.result = true;
        return top();
      }
      if (act === 'prev') { S.step--; return top(); }
      if (act === 'edit') { S.result = false; S.step = 1; S.skip = null; return top(); }
      if (act === 'reset') {
        // 다시 하기: 답만 지운다. 가져온 공고 값은 다시 채운다(2-4)
        S = { step: 0, result: false, mode: S.mode, c: {}, g: { buy: {}, jeonse: {}, rent: {} } };
        N.filled = {};
        if (N.applied) applyNotice(N.typeOf);
        return top();
      }
    });
    // 숫자 칸: 질문 화면에서는 고칠 때마다 담기만, 결과 화면에서는 칸을 떠날 때 다시 계산
    box.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute && t.hasAttribute('data-f') && !S.result) set(t.getAttribute('data-f'), t.getAttribute('data-g'), num(t.value));
    });
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (!(t.getAttribute && t.hasAttribute('data-f')) || !S.result) return;
      var f = t.getAttribute('data-f'), g = t.getAttribute('data-g'), c = t.getAttribute('data-c');
      set(f, g, num(t.value));
      if (pressing) { redraw = true; return; }
      render('input[data-f="' + f + '"][data-g="' + g + '"]' + (c ? '[data-c="' + c + '"]' : ':not([data-c])'));
    });
    render();
    return {
      answers: function () { return S.c; },
      touched: function () { return SHARED.some(function (k) { return answered(S.c[k]); }); },
      prefill: function (v) { PRE = v; render(); },
      notice: function (a) {
        if (a === 'nremove') { clearFilled(); N.applied = false; N.typeOf = null; N.offer = true; shared.applied = false; shared.type = null; render(); return; }
        if (notice.types.length > 1) N.nstep = 'type'; else applyNotice(notice.types[0] || null);
        top();
      },
    };
  }

  function remote(page) {
    var here = path(location.href);
    if (here === page || /^\/manage/.test(here)) return;
    var a = document.createElement('a');
    a.className = 'cy-remote';
    a.href = page + CY.hashFor(document, here);
    a.textContent = '자격 확인';
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
    box.setAttribute('aria-label', '정책대출·특공 자격 예비 확인');
    box.innerHTML = '<p class="cy-calc-loading">계산기를 불러오는 중이에요…</p>';
    body.parentNode.insertBefore(box, body);
    var base = String(g.CHEONGYAK_SCHEDULE_URL || '').replace(/[^\/]*$/, '');
    var fail = function () {
      box.innerHTML = '<p class="cy-calc-fail">지금은 계산기를 열 수 없어요. 아래 표에서 상품별 조건을 확인해 주세요.</p>';
    };
    if (!base) return fail();
    var json = function (f) { return fetch(base + f, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }); };
    // #n=공고번호일 때만 공고 파일을 받는다(15-3). 못 받거나 번호가 없으면 묻지 않고 빈 계산기로 연다(16-6)
    var m = /[#&]n=(\d+)/.exec(location.hash);
    var notice = m ? json('notices.json').then(function (d) { return d && d.schema === 1 && d.n && d.n.hasOwnProperty(m[1]) ? d.n[m[1]] : null; }).catch(function () { return null; }) : Promise.resolve(null);
    json('rules.json').then(function (rules) {
      if (!rules || rules.schema !== 1 || !rules.loans) return fail();
      return notice.then(function (n) { CY.mount(box, rules, location.hash, n); });
    }).catch(fail);
  }

  try {
    var page = g.CY_CALC_PAGE || CALC_PAGE;
    if (!page) return;
    if (path(location.href) === page) calcPage();
    else remote(page);
  } catch (e) { /* 다른 스크립트와 페이지를 막지 않는다 */ }
})(this);
