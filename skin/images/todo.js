/* 내 청약 할 일: 공고 하나 + 신청 유형 → 날짜순 할 일 → 달력 파일(.ics)·복사용 글. calendar.js 상세 창이 쓴다.
 * 공고 날짜는 일정 자료 값 그대로, 없으면 지어내지 않고 「공고문에서 확인」. 준비 날짜(tip)는 공고 일정이 아니라 권하는 시점이라 화면·파일에 따로 밝힌다.
 * 문구 근거: docs/policy/apply.md 2·6절, afterwin.md 6절, beginner.md 3절. 입력은 저장·전송하지 않는다.
 * node 점검: preview/todo.check.mjs가 vm으로 읽어 CY_TODO를 꺼낸다(화면 코드 없음). */
(function (g) {
  'use strict';
  var W = ['일', '월', '화', '수', '목', '금', '토'];
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var utc = function (s, days) { var a = s.split('-'); return new Date(Date.UTC(+a[0], a[1] - 1, +a[2] + (days || 0))); };
  var plusDays = function (s, n) { return utc(s, n).toISOString().slice(0, 10); };
  var dayText = function (s) { var d = utc(s); return s.replace(/-/g, '.') + ' (' + W[d.getUTCDay()] + ')'; };
  var shortDay = function (s) { var d = utc(s); return s.slice(5).replace('-', '.') + ' (' + W[d.getUTCDay()] + ')'; };
  var last = function (p) { return p.end && p.end > p.date ? p.end : p.date; };
  var phase = function (it, k) { return (it.phases || []).filter(function (p) { return p.k === k && ISO.test(p.date); })[0]; };

  // 청약홈 APT 메뉴로 받는 공고인가(09:00~17:30·청약홈 메뉴 안내는 이 경우만). 공공분양·LH·SH는 접수처가 달라 공고문에 맡긴다
  function viaApplyhome(it) {
    return ['APT', '무순위', '임의공급'].indexOf(it.kind) >= 0 && /applyhome\.co\.kr/.test(it.applyhomeUrl || '') &&
      !/공공|신혼희망|뉴:?홈|나눔형|선택형|토지임대|지분적립/.test(it.name || '') && !/lh\.or\.kr|i-sh\.co\.kr/.test(it.homepageUrl || '');
  }
  function applyLabel(it, k) {
    if (k === 'sp') return '특별공급 접수';
    if (k === 'p2') return it.kind === 'APT' ? '2순위 접수(해당지역)' : '2순위 접수';
    if (it.source === 'lh') return '접수 마감';
    return it.kind === 'APT' ? '1순위 접수(해당지역)' : '접수'; // 자료의 1·2순위 날짜는 해당지역 칸뿐이다(crawler/fetch.mjs)
  }
  var spMissing = function (it) { return it.kind === 'APT' && !phase(it, 'sp'); };
  // 고를 수 있는 신청 유형: 아직 끝나지 않은 접수만
  function options(it, today, hm) {
    var hb = viaApplyhome(it);
    return ['sp', 'p1', 'p2'].map(function (k) { return phase(it, k); }).filter(function (p) {
      return p && (last(p) > today || (last(p) === today && !(hb && hm && hm >= '17:30')));
    }).map(function (p) { return { k: p.k, label: applyLabel(it, p.k).replace(' 접수', '') }; });
  }
  // 처음 켜 둘 유형: 2순위는 끈다. 2순위만 남았으면 이미 신청한 사람일 수 있어 모두 끈다(발표·계약만)
  function defaultPicks(opts) {
    return opts.filter(function (o) { return o.k !== 'p2'; }).map(function (o) { return o.k; });
  }

  function tipsFor(it, hb, picks, today) {
    if (!hb) return [
      [7, 'read', '공고문 읽고 신청 방법 확인', '자격, 접수처, 접수 시간, 제출 서류는 공고마다 달라요. 공고문에서 확인해요.'],
      [3, 'prep', '서류·본인 인증 준비', '공고문에 적힌 제출 서류와 본인 인증 방법을 미리 준비해요.'],
    ];
    if (it.kind !== 'APT') return [ // 무순위·임의공급은 청약통장을 쓰지 않고 자격을 공고로 정한다(apply.md 1절)
      [7, 'read', '공고문 읽고 자격 확인', '자격과 거주 요건은 공고문에서 확인해요. 무순위·임의공급은 청약통장을 쓰지 않아요.'],
      [3, 'cert', '인증서 준비', '공동인증서나 금융인증서가 필요해요.'],
      [1, 'eve', '신청 내용 미리 정리', '신청에 필요한 내용을 공고문에서 미리 정리해요. 완료한 신청은 고칠 수 없어요.'],
    ];
    var one = picks.indexOf('p1') >= 0, p1 = phase(it, 'p1');
    return [
      [7, 'read', '공고문 읽고 자격 확인', '입주자모집공고에서 자격과 접수 일정을 읽어요. 청약홈 청약자격확인 메뉴에서 세대구성원 등록·동의, 청약제한사항, 주택소유, 청약통장 순위를 확인해요. 청약제한사항은 세대원도 각자 인증서로 확인해요.'],
      [3, 'cert', '인증서 준비', '공동·금융·네이버·KB국민·토스·신한·카카오 인증서를 쓸 수 있어요. 청약통장이 없으면 공동·금융인증서만 돼요.' +
        (one && p1 && p1.date > today ? ' 민영주택 일반공급 1순위라면 신청일 전날까지 청약홈 공고단지 청약연습도 할 수 있어요.' : '')],
      [1, 'eve', '신청 내용 미리 정리', '거주지는 입주자모집공고일 현재 주민등록표등본 주소지를 골라요.' +
        (one ? ' 민영주택 일반공급 1순위 가점제는 무주택 기간, 부양가족수, 배우자 청약통장 가입기간을 입력해요(본인 통장 기간은 자동 입력).' : '') + ' 완료한 신청은 고칠 수 없어요.'],
    ];
  }

  // 날짜순 할 일. tip=true면 공고 일정이 아니라 권하는 시점. picks는 고른 신청 유형(비어 있으면 발표·계약만 — 이미 신청한 사람)
  // hm: 지금 시각 "HH:MM"(없으면 시각을 따지지 않음). 청약홈 접수는 그날 17:30이 지나면 끝난 것으로 본다
  function build(it, picks, today, hm) {
    var hb = viaApplyhome(it), opts = options(it, today, hm), on = opts.filter(function (o) { return picks.indexOf(o.k) >= 0; }), out = [];
    var win = phase(it, 'win'), con = phase(it, 'con');
    var add = function (t) { out.push(t); };
    on.forEach(function (o, i) {
      var p = phase(it, o.k), name = applyLabel(it, o.k), open = hb ? { from: '09:00', to: '17:30' } : {}, notes = [];
      if (hb) notes.push('청약홈 → 청약신청 → APT에서 신청해요. 17:30 전에 최종신청까지 끝내야 하고, 신청일 17:30 전까지는 취소 후 다시 신청할 수 있어요.');
      else if (it.source === 'lh') notes.push('자료에는 마감일만 있어요. 접수 시작일, 접수처, 시간은 공고문에서 확인해 주세요.');
      else notes.push('접수처와 접수 시간은 공고문에서 확인해 주세요.');
      if (o.k === 'sp') notes.push('특별공급은 종류에 따라 접수 기간과 장소가 다를 수 있어요. 공고문에서 확인해 주세요.');
      if (it.kind === 'APT' && o.k !== 'sp') notes.push('해당지역 접수일이에요. 기타지역이면 공고문에서 접수일을 확인해 주세요.');
      if (o.k === 'p2') notes.push('1순위에서 마감되면 2순위 접수는 없을 수 있어요. ' + (hb ? '청약홈 경쟁률이나 공고문에서' : '공고문에서') + ' 확인해 주세요.');
      if (i === 0 && spMissing(it)) notes.push('특별공급 일정은 자료에 없어요. 특별공급이면 공고문에서 접수일을 확인해 주세요.');
      if (!win && !con) notes.push('발표·계약 일정은 자료에 없어요. 공고문에서 확인해 주세요.');
      var note = notes.join(' ');
      if (last(p) === p.date) return add(Object.assign({ id: o.k, date: p.date, title: name, note: note, rank: 2 }, open));
      if (p.date > today || (p.date === today && !(hb && hm && hm >= '17:30'))) add(Object.assign({ id: o.k + '-start', date: p.date, title: name + ' 시작', note: note, rank: 2 }, open));
      add(Object.assign({ id: o.k + '-end', date: p.end, title: name + ' 마지막 날', note: note, rank: 2 }, open));
    });
    if (on.length) {
      var first = on.map(function (o) { return phase(it, o.k).date; }).sort()[0];
      tipsFor(it, hb, on.map(function (o) { return o.k; }), today).forEach(function (t) {
        var d = plusDays(first, -t[0]);
        add({ id: 'tip-' + t[1], date: d < today ? today : d, title: t[2], note: t[3], tip: true, rank: 1 });
      });
    }
    if (win && win.date >= today) {
      var label = it.kind === '청년안심주택' || it.source === 'sh' ? '발표 확인' : '당첨자 발표 확인';
      add({ id: 'win', date: win.date, title: label, rank: 3,
        note: hb ? '청약홈 → 청약당첨조회 → APT(인증서 로그인)와 사업주체 홈페이지에서 확인해요. 발표 시각은 공고문에서 확인해 주세요.' : '확인 방법과 시각은 공고문에서 확인해 주세요.' });
      add({ id: 'tip-after', date: win.date, title: '당첨되면: 서류 제출 기간 확인', tip: true, rank: 4,
        note: (hb ? '자격 확인 서류는 공고문에 적힌 기간에 내요. 기간을 넘기면 계약하지 못할 수 있어요.' : '제출 서류와 기간은 공고문에서 확인해 주세요.') + (con ? '' : ' 계약일은 자료에 없어요. 공고문에서 확인해 주세요.') });
    }
    if (con && last(con) >= today) {
      add({ id: 'con', date: con.date, end: last(con) > con.date ? con.end : null, title: '당첨되면: 계약', rank: 5,
        note: '장소, 시간, 준비물은 단지마다 달라요. 공고문에서 확인해 주세요.' + (hb ? ' 공고문 예시 준비물은 신분증, 계약금 입금 증빙, 인감증명서와 인감도장(또는 본인서명사실확인서), 자격 서류예요. 기간 안에 계약하지 않으면 포기로 볼 수 있어요.' : '') });
    }
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rank - b.rank; });
  }

  // 이 공고와 함께 볼 글: 대출·지원 혜택·유의점(블로그로 다시 들어오는 길). 공고 종류와 고른 유형으로만 고른다 — 자격이 된다는 뜻이 아니라 「확인할 글」이다.
  // 주소는 공개된 글만(preview/todo.check.mjs가 posts/published.json과 대조). 맞는 글이 없는 칸은 비운다(오피스텔 지원 혜택 등)
  var BLOG = 'https://aulee.tistory.com';
  var SALE = ['APT', '무순위', '임의공급', '분양'], OFFICE = ['오피스텔', '도시형'];
  // 임대인가: 이름의 「토지임대부」는 분양이다
  var isRentName = function (it) { return /임대/.test(String(it.name || '').replace(/토지임대부?/g, '')); };
  function links(it, picks, analysis) {
    var no = /^(\d+)-/.exec(String(it.id)), calc = no ? '/75#n=' + no[1] : '/75', groups = [], name = it.name || '';
    var add = function (group, items) { items = items.slice(0, 3); if (items.length) groups.push({ name: group, items: items.map(function (x) { return { path: x[0], label: x[1] }; }) }); };
    if (analysis && /^\/\d+$/.test(analysis)) add('이 단지', [[analysis, '이 단지 분양가·청약 분석']]);
    if (SALE.indexOf(it.kind) >= 0 && !isRentName(it)) {
      // 특공 판정은 민영 APT만 계산 범위다(calc.js isOff)
      add('대출', [[calc, !no ? '정책대출 자격 확인' : it.kind === 'APT' && viaApplyhome(it) ? '이 공고로 정책대출·특공 자격 확인' : '이 공고로 정책대출 자격 확인'], ['/5', '청약 당첨 후 대출 총정리'], ['/9', '중도금대출 HUG 보증 조건']]);
      add('지원 혜택', (/신혼희망/.test(name) ? [['/50', '신혼희망타운 자격 조건']] : []).concat(picks.indexOf('sp') >= 0 ? [['/27', '특별공급 종류 한눈에']] : [],
        [['/6', '생애최초 주택 취득세 감면 조건'], ['/11', '디딤돌대출 조건 총정리'], ['/15', '신생아 특례 디딤돌대출 조건']]));
      // 부적격·계약 포기 글의 당첨자 관리·재당첨·통장 내용은 무순위·임의공급에 그대로 맞지 않는다(apply.md 1-1) → 일반 공고만
      add('유의점', it.kind === 'APT' || it.kind === '분양'
        ? [['/10', '입주자모집공고문 읽는 법']].concat(it.kind === 'APT' && (picks.indexOf('p1') >= 0 || picks.indexOf('p2') >= 0) ? [['/61', '해당지역·기타지역 우선공급 기준']] : [], [['/54', '부적격 당첨이 되는 경우와 불이익'], ['/55', '계약 포기 불이익']])
        : [['/10', '입주자모집공고문 읽는 법'], ['/7', '청약 용어 사전(무순위 포함)']]);
    } else if (OFFICE.indexOf(it.kind) >= 0) {
      add('대출', [[calc, no ? '이 공고로 대출 자격 확인' : '대출 자격 확인']]);
      add('유의점', [['/10', '모집공고문 읽는 법(아파트 기준)']]);
    } else {
      var young = ['행복주택', '청년안심주택', '매입임대'].indexOf(it.kind) >= 0 || /청년/.test(name);
      add('대출', [['/75#calc=loan&t=jeonse', '전세대출 자격 확인'], ['/22', '버팀목 전세자금대출 조건 비교'], ['/57', '전세자금대출 보증 한도 기준']]);
      add('지원 혜택', (it.kind === '행복주택' ? [['/60', '행복주택 자격 조건 총정리']] : it.kind === '매입임대' && it.source !== 'sh' ? [['/59', 'LH 매입임대·전세임대 차이와 자격']] : [])
        .concat(young && !/고령/.test(name) ? [['/58', '청년전용 버팀목 전세자금대출 조건']] : [], [['/47', '주택도시기금 대출 우대금리 항목']]));
      add('유의점', [['/10', '모집공고문 읽는 법(분양 기준)']]);
    }
    return groups;
  }
  // medium: 어디서 들어왔는지(ics·share·copy). 화면 안 링크는 없음
  function linkUrl(path, medium) {
    var m = /^([^#]*)(#.*)?$/.exec(path);
    return BLOG + m[1] + (medium ? '?utm_source=todo&utm_medium=' + medium : '') + (m[2] || '');
  }

  function whenText(t) {
    return dayText(t.date) + (t.from ? ' ' + t.from + '~' + t.to : '') + (t.end ? ' ~ ' + shortDay(t.end) : '');
  }
  var FOOT = '정확한 내용은 입주자모집공고를 확인해 주세요.';
  var TIP_NOTE = '이 날짜는 공고 일정이 아니라 준비를 권하는 시점이에요.';
  var link = function (it) { return /^https?:\/\//i.test(it.applyhomeUrl || '') ? it.applyhomeUrl : ''; };

  // 메모장 등에 붙여 넣는 글
  function text(it, tasks, updatedAt, groups) {
    var head = it.name + ' 청약 할 일';
    var body = tasks.map(function (t) { return '□ ' + whenText(t) + ' ' + t.title + (t.tip ? ' (권장 시점)' : '') + '\n  ' + t.note; });
    (groups || []).forEach(function (g) { body.push('[함께 볼 글: ' + g.name + ']\n' + g.items.map(function (x) { return x.label + ' ' + linkUrl(x.path, 'copy'); }).join('\n')); });
    var tail = [FOOT];
    if (updatedAt) tail.push('일정 수집: ' + String(updatedAt).slice(0, 10).replace(/-/g, '.'));
    if (link(it)) tail.push(link(it));
    return [head].concat(body, tail.join('\n')).join('\n\n');
  }

  // 개인 링크: 공고와 고른 유형만 주소 뒤(#)에 담는다. 열 때마다 최신 일정으로 다시 그린다
  function linkHash(it, picks) {
    return '#todo=' + encodeURIComponent(it.id) + '&p=' + picks.join(',');
  }
  function parseHash(hash) {
    var m = /^#todo=([^&]+)(?:&p=([a-z0-9,]*))?$/.exec(hash || '');
    if (!m) return null;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (e) { return null; }
    return { id: id, picks: m[2] == null ? null : m[2].split(',').filter(function (k) { return ['sp', 'p1', 'p2'].indexOf(k) >= 0; }) };
  }
  // 카톡 등으로 보내는 글: 공고 날짜만 + 개인 링크. 링크를 글 안에 넣는다(공유 받는 앱이 url 칸을 따로 다루는 방식이 제각각이라)
  function shareText(it, tasks, url, groups) {
    var lines = tasks.filter(function (t) { return !t.tip; }).map(function (t) { return whenText(t) + ' ' + t.title; });
    var read = (groups || []).map(function (g) { return g.name + ': ' + g.items[0].label + ' ' + linkUrl(g.items[0].path, 'share'); });
    return [it.name + ' 청약 할 일', lines.join('\n'), '할 일 전체와 최신 일정: ' + url].concat(read.length ? ['함께 볼 글\n' + read.join('\n')] : [], FOOT).join('\n\n');
  }

  // RFC 5545. 줄은 75바이트마다 접고(한글이 잘리지 않게 글자 단위) CRLF로 잇는다
  var utf8Len = function (c) { var n = c.codePointAt(0); return n < 0x80 ? 1 : n < 0x800 ? 2 : n < 0x10000 ? 3 : 4; };
  function fold(line) {
    var out = [], cur = '', size = 0;
    Array.from(line).forEach(function (c) {
      var n = utf8Len(c);
      if (size + n > 75) { out.push(cur); cur = ' '; size = 1; }
      cur += c; size += n;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  var icsText = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
  var dateOnly = function (s) { return s.replace(/-/g, ''); };
  // 한국 시각 → UTC(서머타임 없음, 09:00 이후 시각만 쓰므로 날짜가 넘어가지 않는다)
  var kstToUtc = function (date, hm) { var a = hm.split(':'); return dateOnly(date) + 'T' + pad(+a[0] - 9) + a[1] + '00Z'; };
  function stamp(now) { return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }

  // 일정마다 그때 필요한 글을 설명에 붙인다: 읽을거리는 준비 시작에, 대출은 발표·계약에. 그 일정이 없으면(임대·발표 뒤) 있는 일정 중 앞쪽에. 글 칸은 파일 안에 한 번씩 꼭 들어간다
  function homeOf(group, tasks) {
    var order = group === '대출' ? ['tip-after', 'con', 'tip-read'] : ['tip-read'];
    for (var i = 0; i < order.length; i++) if (tasks.some(function (t) { return t.id === order[i]; })) return order[i];
    return tasks[0] && tasks[0].id;
  }
  function ics(it, tasks, now, groups) {
    var uidBase = String(it.id).replace(/[^\w-]/g, '_'), url = link(it), lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//aulee.tistory.com//cheongyak todo//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    tasks.forEach(function (t) {
      var read = (groups || []).filter(function (g) { return homeOf(g.name, tasks) === t.id; }).map(function (g) {
        return '함께 볼 글(' + g.name + ')\n' + g.items.map(function (x) { return x.label + ': ' + linkUrl(x.path, 'ics'); }).join('\n');
      });
      var desc = [t.note, t.tip ? TIP_NOTE : '', FOOT, url].concat(read).filter(Boolean).join('\n');
      var summary = (t.tip ? '[청약 준비] ' : '[청약] ') + t.title + ' - ' + it.name;
      lines.push('BEGIN:VEVENT', 'UID:' + uidBase + '-' + t.id + '@aulee.tistory.com', 'DTSTAMP:' + stamp(now), 'SEQUENCE:' + Math.floor(now.getTime() / 60000)); // 정정 후 다시 받은 파일이 앞 파일을 덮도록 커지는 값
      if (t.from) lines.push('DTSTART:' + kstToUtc(t.date, t.from), 'DTEND:' + kstToUtc(t.date, t.to));
      else lines.push('DTSTART;VALUE=DATE:' + dateOnly(t.date), 'DTEND;VALUE=DATE:' + dateOnly(plusDays(t.end || t.date, 1))); // 끝 날짜는 포함하지 않는 값
      lines.push('SUMMARY:' + icsText(summary), 'DESCRIPTION:' + icsText(desc));
      if (url) lines.push('URL:' + url);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(summary), 'TRIGGER:' + (t.from ? '-PT30M' : 'PT9H'), 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function fileName(it) {
    var base = String(it.name || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
    return '청약 할 일 - ' + (base || '공고') + '.ics';
  }

  g.CY_TODO = { options: options, defaultPicks: defaultPicks, build: build, whenText: whenText, text: text, ics: ics, fileName: fileName, linkHash: linkHash, parseHash: parseHash, shareText: shareText, links: links, linkUrl: linkUrl, spMissing: spMissing, FOOT: FOOT, TIP_NOTE: TIP_NOTE };
})(this);
