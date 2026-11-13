/* 계산기 2종 — 지분적립형 「매달 얼마」(equity) · 월세 세액공제(wolse). 정책대출 확인기(calc.js)와 따로 둔 파일.
 * 글 주소가 PAGES에 있으면 그 글 본문 앞(.post-body 앞)에 계산기를 그린다. 값은 rules.json의 equity·wolse(원본 rules/equity.json·wolse.json)에서만 읽는다.
 * 입력값은 이 스크립트 변수에만 둔다. 저장·전송하지 않는다. 전체를 try로 감싸 다른 스크립트·페이지를 막지 않게 한다.
 * node 점검(preview/calc2.check.mjs): vm으로 읽어 CY2만 꺼낸다(document가 없으면 화면 코드는 건너뜀). */
(function (g) {
  'use strict';
  // 글 주소 → 계산기. 글을 공개해 번호가 생기면 채운다(예: '/80': 'equity'). 비어 있으면 아무것도 그리지 않는다. 미리보기는 window.CY2_PAGES로 덮는다
  var PAGES = {};
  var CY2 = g.CY2 = {};

  function won(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  CY2.won = won;

  /* 지분적립형(docs/policy/equity.md 7-2). R = rules.equity
   * a: price(원), shares[%], gap(년), rate(연 %|null), deposit(원|null), jeonse(원|null), convertPct(%), convRate(연 %) */
  CY2.equity = function (R, a) {
    var errs = [], warns = [], sum = 0, i;
    if (!(a.price > 0)) errs.push('주택공급가격을 넣어 주세요.');
    if (!a.shares.length || a.shares.some(isNaN)) errs.push('회차별 취득 비율을 쉼표로 나눠 숫자로 넣어 주세요.');
    else {
      for (i = 0; i < a.shares.length; i++) {
        sum += a.shares[i];
        if (a.shares[i] < R.share.min || a.shares[i] > R.share.max) warns.push((i + 1) + '회차 ' + a.shares[i] + '%는 법령 범위(회차마다 ' + R.share.text + ') 밖이에요.');
      }
      if (r3(sum) !== 100) errs.push('회차별 취득 비율의 합이 ' + r3(sum) + '%예요. 합이 100%가 되게 넣어 주세요.');
    }
    if (errs.length) return { errs: errs, warns: warns };
    var acc = 0, total = 0, rounds = [];
    for (i = 0; i < a.shares.length; i++) {
      var s = a.shares[i], base = Math.round(a.price * s / 100), years = (a.gap || 0) * i;
      acc += s; total += base;
      var pub = r3(100 - acc);
      // 가정(equity.md 7-2 「추론」): 이자를 붙이는 원금 = 공급가격 × 그 회차 비율, 일수 ÷ 365 = 회차 간격(년) × 지난 회차 수. 단리
      var extra = i === 0 ? 0 : a.rate == null ? null : Math.round(base * a.rate / 100 * years);
      rounds.push({ n: i + 1, years: years, share: s, base: base, extra: extra, total: extra == null ? null : base + extra, pub: pub,
        cap: a.jeonse ? Math.floor(a.jeonse * R.jeonseRatio.v / 100 * pub / 100) : null });
    }
    var E = R.example, cap0 = rounds[0].cap, D = a.deposit != null ? a.deposit : cap0, dep = null;
    if (D != null) {
      var unit = E.convertUnit.v, c = Math.floor(D * a.convertPct / 100 / unit) * unit;
      dep = { D: D, c: c, after: D - c, monthly: Math.floor(c * a.convRate / 1200 + 1e-6), fromCap: a.deposit == null };
      if (cap0 != null && D > cap0) warns.push('넣은 보증금이 전세 평균으로 계산한 1회차 뒤 상한(' + won(cap0) + ')보다 커요.');
    }
    if (a.convertPct > E.convertPct.v) warns.push(E.label + '은 보증금의 ' + E.convertPct.text + '까지 전환이 원칙이에요.');
    return { errs: [], warns: warns, rounds: rounds, total: total, dep: dep };
  };

  /* 월세 세액공제(docs/policy/yearend.md 1절). R = rules.wolse. a: pay(총급여, 원), income(종합소득금액, 원|null), rent(연 월세, 원)
   * 종합소득금액을 비우면 총급여로만 구간을 본다(1-3 처리 메모). 소득세 기준만(지방소득세 없음) */
  CY2.wolse = function (R, a) {
    var t = null, i;
    for (i = 0; i < R.tiers.length && !t; i++) if (a.pay <= R.tiers[i].pay && (a.income == null || a.income <= R.tiers[i].income)) t = R.tiers[i];
    if (!t) return { tier: null, rate: 0, base: 0, credit: 0, over: 0 };
    var base = Math.min(a.rent, R.cap.v);
    return { tier: t, rate: t.rate, base: base, credit: Math.floor(base * t.rate / 100), over: Math.max(0, a.rent - R.cap.v) };
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { v = String(v == null ? '' : v).replace(/[,\s]/g, ''); return v === '' ? null : parseFloat(v); }
  function field(pre, f) { // f = [키, 질문, 단위, 기본값, 도움말, 입력 폭(선택)]
    var id = pre + f[0];
    return '<div class="cy-q"><p class="cy-qt" id="' + id + '-t">' + esc(f[1]) + '</p><p class="cy-qh">' + esc(f[4]) + '</p>' +
      '<label class="cy-num"><input type="text" inputmode="' + (f[5] ? 'text' : 'decimal') + '" autocomplete="off" data-k="' + f[0] + '" value="' + esc(f[3]) + '" aria-labelledby="' + id + '-t"' + (f[5] ? ' style="width:' + f[5] + '"' : '') + '><span>' + esc(f[2]) + '</span></label></div>';
  }
  function warnHtml(r) { return r.warns.length ? '<p class="cy-warn">' + r.warns.map(esc).join('<br>') + '</p>' : ''; }

  function mountEquity(box, R) {
    var E = R.example, J = R.jeonseRatio.v;
    var F = [
      ['price', '주택공급가격', '만원', E.price.v / 1e4, '공고문 가격표의 지분 전체 가격이에요. 기본값은 ' + E.label + '(59A 1층)'],
      ['shares', '회차별 취득 비율', '%', E.shares.v.join(', '), '회차 순서대로 쉼표로 나눠 적어요. 법령은 회차마다 ' + R.share.text + ', 합계 100%예요. 기본값은 ' + E.label, '12em'],
      ['gap', '회차 간격', '년', E.gapYears.v, '법령에 없고 공고문이 정해요. 기본값은 ' + E.label],
      ['rate', '가산이자 가정 금리', '연 %', '', '은행 1년 만기 정기예금 평균이자율을 가정해 넣어요. 실제 이율은 최초 취득일과 그 회차 취득일 이율의 평균이라 미리 알 수 없어요. 비우면 가산이자 제외 금액만 보여요'],
      ['deposit', '최초 임대보증금', '만원', E.deposit.v / 1e4, '공고문 값을 넣어요. 기본값은 ' + E.label + '. 비우고 아래 전세 평균을 넣으면 그 상한을 보증금으로 써요'],
      ['jeonse', '인근 전세 평균(선택)', '만원', '', '비슷한 인근 2~3개 단지 전세계약금액 평균이에요. 넣으면 회차마다 보증금 상한(평균의 ' + J + '% × 남은 공공지분 비율)을 계산해요'],
      ['convertPct', '월세 전환 비율', '%', E.convertPct.v, '보증금 가운데 월세로 돌릴 비율이에요. 기본값은 ' + E.label + '(' + E.convertUnit.text + ', ' + E.convertPct.text + ' 원칙)'],
      ['convRate', '전환요율', '연 %', E.convRate.v, '기본 ' + E.convRate.v + '%는 ' + E.label + '(공고일 현재 값, 바뀔 수 있음)']
    ];
    box.innerHTML = '<p class="cy-prog">지분적립형 분양주택 · 매달 얼마</p><p class="cy-qh">입력값은 저장하거나 보내지 않아요.</p>' +
      F.map(function (f) { return field('cy2e-', f); }).join('') + '<div class="cy2-out"></div>';
    var out = box.querySelector('.cy2-out');
    function val(k) { return num(box.querySelector('[data-k="' + k + '"]').value); }
    function draw() {
      var man = function (k) { var v = val(k); return v == null ? null : v * 1e4; };
      var a = { price: man('price'), shares: String(box.querySelector('[data-k="shares"]').value).split(/[\s,·\/]+/).filter(Boolean).map(Number),
        gap: val('gap'), rate: val('rate'), deposit: man('deposit'), jeonse: man('jeonse'), convertPct: Math.min(100, Math.max(0, val('convertPct') || 0)), convRate: val('convRate') || 0 };
      var r = CY2.equity(R, a);
      if (r.errs.length) { out.innerHTML = '<p class="cy-warn">' + r.errs.map(esc).join('<br>') + '</p>' + warnHtml(r); return; }
      var h = warnHtml(r), d = r.dep;
      h += '<div class="cy-group"><h3>남은 지분 임대료 — 1회차 취득 뒤</h3>';
      if (d) {
        h += '<div class="cy-card is-ok"><p class="cy-amt">월 임대료 <b>' + won(d.monthly) + '</b></p>' +
          '<p class="cy-why">임대보증금 ' + won(d.D) + (d.fromCap ? '(전세 평균으로 계산한 상한)' : '') + ' 가운데 ' + won(d.c) + '를 월세로 전환 → 전환 후 보증금 <b>' + won(d.after) + '</b></p>' +
          '<p class="cy-note">월 임대료 = 전환 금액 × 전환요율 ' + a.convRate + '% ÷ 12. 전환한 금액에만 붙어요. 전환 금액은 ' + E.convertUnit.text + '로 끊었어요(' + E.label + ').</p></div>';
      } else h += '<p class="cy-note">최초 임대보증금이나 인근 전세 평균을 넣으면 보여요.</p>';
      h += '</div><div class="cy-group"><h3>회차별 지분 대금</h3>';
      r.rounds.forEach(function (x) {
        h += '<div class="cy-card"><h4>' + x.n + '회차 <span>' + (x.years ? '처음 취득 ' + x.years + '년 뒤' : '처음 취득') + ' · ' + x.share + '%</span></h4>' +
          '<p class="cy-amt">가산이자 제외 <b>' + won(x.base) + '</b></p>' +
          (x.n === 1 ? '<p class="cy-by">1회차는 가산이자가 없어요</p>'
            : x.extra == null ? '<p class="cy-by">가산이자 포함 금액은 가정 금리를 넣으면 보여요</p>'
            : '<p class="cy-amt">가산이자 포함 <b>' + won(x.total) + '</b> <span class="cy-tag">가정</span></p><p class="cy-by">가산이자 ' + won(x.extra) + '</p>') +
          '<p class="cy-why">취득 뒤 남은 공공지분 <b>' + x.pub + '%</b>' + (x.cap != null ? ' · 보증금 상한 ' + won(x.cap) : '') + '</p></div>';
      });
      h += '<p class="cy-sum">지분 대금 합계(가산이자 제외) ' + won(r.total) + '</p>' +
        (r.rounds[0].cap != null ? '<p class="cy-note">보증금 상한 = 인근 전세 평균 × ' + J + '% × 남은 공공지분 비율. 실제 보증금은 회차마다 사업자가 이 상한 안에서 다시 정해요.</p>' : '') + '</div>' +
        '<p class="cy-foot"><span class="cy-tag">가정</span> 가산이자 = 그 회차 지분 대금(공급가격 × 비율) × 가정 금리 × 지난 기간(회차 간격 × 365일로 셈), 단리. 이자를 붙이는 원금과 일수 셈법은 법령·공고문 문장에 없어 해석한 값이에요.</p>' +
        '<p class="cy-foot">근거: ' + esc(E.basis) + '. 실제 조건·금액은 단지별 입주자모집공고문이 우선이에요.</p>';
      out.innerHTML = h;
    }
    box.addEventListener('input', draw);
    draw();
  }

  function manw(n) { return String(n / 1e4).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '만원'; }
  function mountWolse(box, R) {
    var B = R.tiers[R.tiers.length - 1];
    var F = [
      ['pay', '총급여(근로자 본인)', '만원', '', '원천징수영수증의 총급여예요. 부부 합산이 아니에요'],
      ['income', '종합소득금액(선택)', '만원', '', '근로소득 말고 다른 종합소득도 있을 때 넣어요(근로소득금액 포함 합계). 비우면 총급여로만 구간을 봐요'],
      ['monthly', '한 달 월세', '만원', '', ''],
      ['months', '낸 개월 수', '개월', 12, R.year + '(그해 1~12월)에 낸 달 수예요'],
      ['annual', '연 월세 합계(선택)', '만원', '', '알면 넣어요. 넣으면 한 달 월세 × 개월 수 대신 이 값을 써요']
    ];
    box.innerHTML = '<p class="cy-prog">월세 세액공제 · ' + esc(R.year) + '</p><p class="cy-qh">입력값은 저장하거나 보내지 않아요.</p>' +
      F.map(function (f) { return field('cy2w-', f); }).join('') + '<div class="cy2-out"></div>';
    var out = box.querySelector('.cy2-out');
    function val(k) { return num(box.querySelector('[data-k="' + k + '"]').value); }
    function draw() {
      var pay = val('pay'), income = val('income'), annual = val('annual'), monthly = val('monthly'), months = val('months');
      var rent = annual != null ? annual : monthly != null ? monthly * (months == null ? 12 : months) : null;
      if (pay == null || rent == null) { out.innerHTML = '<p class="cy-note">총급여와 월세를 넣으면 공제액을 보여요.</p>'; return; }
      var r = CY2.wolse(R, { pay: pay * 1e4, income: income == null ? null : income * 1e4, rent: Math.round(rent * 1e4) }), h = '<div class="cy-group"><h3>결과 — ' + esc(R.year) + '</h3>';
      if (!r.tier) h += '<div class="cy-card is-check"><p class="cy-amt"><b>대상 아님</b></p><p class="cy-why">총급여 ' + manw(B.pay) + ' 초과' + (income != null ? ' 또는 종합소득금액 ' + manw(B.income) + ' 초과' : '') + '면 월세 세액공제를 받을 수 없어요.</p></div>';
      else h += '<div class="cy-card is-ok"><p class="cy-amt">세액공제액 <b>' + won(r.credit) + '</b></p>' +
        '<p class="cy-why">공제율 <b>' + r.rate + '%</b> · 총급여 ' + manw(r.tier.pay) + ' 이하' + (income != null ? '·종합소득금액 ' + manw(r.tier.income) + ' 이하' : '') + '</p>' +
        '<p class="cy-why">공제 대상 월세 <b>' + won(r.base) + '</b>' + (r.over ? ' — 연 ' + manw(R.cap.v) + ' 한도를 넘는 ' + won(r.over) + '은 빠져요' : '') + '</p></div>';
      h += '<p class="cy-note">공제액은 세금(산출세액)에서 빼는 금액이에요. 빼기 전 세금이 공제액보다 적으면 그 세금까지만 줄어들고, 공제액만큼 현금을 받는 것은 아니에요.</p>' +
        (income == null ? '<p class="cy-note">다른 종합소득이 있으면 종합소득금액 기준(' + R.tiers.map(function (t) { return t.rate + '%는 ' + manw(t.income) + ' 이하'; }).join(', ') + ')도 함께 확인하세요.</p>' : '') +
        '<p class="cy-note">무주택 세대주 등 대상 요건과 주택 요건을 갖췄을 때의 소득세 기준 금액이에요.</p></div>' +
        '<p class="cy-foot">근거: ' + esc(R.basis) + '. 실제 공제 여부는 회사(원천징수의무자)·관할 세무서가 판단해요.</p>';
      out.innerHTML = h;
    }
    box.addEventListener('input', draw);
    draw();
  }

  var MOUNT = { equity: mountEquity, wolse: mountWolse };
  var LABEL = { equity: '지분적립형 분양주택 매달 얼마 계산기', wolse: '월세 세액공제 계산기' };

  function path(u) {
    try { return decodeURIComponent(new URL(u, location.href).pathname).replace(/\/+$/, '') || '/'; } catch (e) { return ''; }
  }
  if (typeof document === 'undefined') return;
  try {
    var kind = (g.CY2_PAGES || PAGES)[path(location.href)], body = document.querySelector('.post-body');
    if (!kind || !MOUNT[kind] || !body) return;
    var box = document.createElement('section');
    box.className = 'cy-calc';
    box.setAttribute('aria-label', LABEL[kind]);
    box.innerHTML = '<p class="cy-calc-loading">계산기를 불러오는 중이에요…</p>';
    body.parentNode.insertBefore(box, body);
    var fail = function () { box.innerHTML = '<p class="cy-calc-fail">지금은 계산기를 열 수 없어요. 아래 본문의 표와 예시를 확인해 주세요.</p>'; };
    var base = String(g.CHEONGYAK_SCHEDULE_URL || '').replace(/[^\/]*$/, '');
    if (!base) fail();
    else fetch(base + 'rules.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rules) {
      if (!rules || rules.schema !== 1 || !rules[kind] || rules[kind].schema !== 1) return fail();
      MOUNT[kind](box, rules[kind]);
    }).catch(fail);
  } catch (e) { /* 다른 스크립트와 페이지를 막지 않는다 */ }
})(this);
