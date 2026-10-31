// 우리의 집(auleezip) 고정 페이지: 현재 열린 공고(첫 화면 — 매일 다시 만든다) · 비교 기준 · 소개 · 개인정보처리방침. 틀은 zip/ui.mjs, 모양은 zip/site.css
import { esc } from '../posts/weekly.mjs';
import { areaOf } from '../posts/analysis_post.mjs';
import { shortName, closedOf, receiptOf, span, OPEN_URL, CAL_URL, METHOD_URL } from './post.mjs';
import { table, cmpBar, note, src } from './ui.mjs';
import { GAP, RATE } from './deals.mjs';
import { won } from './timeline.mjs';

const link = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
const page = (html) => `<!-- wp:html -->\n<div class="az az-page">\n${html}\n</div>\n<!-- /wp:html -->`;
const DEEP_URL = 'https://auleezip.com/category/%EC%8B%AC%EC%B8%B5-%EB%B6%84%EC%84%9D/';
const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);

// 첫 화면(현재 열린 공고) — 2026-10-30 사용자 승인 시안(넓은 두 단, 눌러서 골라 보기): 요약 4칸 → 청약 일정 2주(날짜를 누르면 그날 일정 공고만)
// → 왼쪽 공고 표(지역·구분·정렬·마감 포함) + 오른쪽 심층 분석·시세보다 낮은 공고·이번 주 발표. 표는 서버에서 다 그린다(검색엔진에도 보임).
// 골라 보기는 스크립트 없이 라디오·체크박스 + CSS :has()로 줄을 숨긴다 — 사이트 방화벽(NinjaFirewall)이 글 안의 <script>를 막는다(10-30 실측 403).
// 정렬은 순서가 다른 tbody 세 벌 중 하나만 보인다. 고정 규칙은 site.css, 날짜별 규칙은 날마다 바뀌어 글 안 <style>. 넓은 틀은 site.css의 .home 규칙(첫 화면에만).
// list: 장부(data/zip_registry.json)의 공고들. res: 공고번호 → { d(분양가가 비교 시세보다 높으면 + %), leasehold, p(주력 최고가 만원), m(주력 면적) } | { text }
// deeps: 공개된 심층 분석 { key, link, title, card, nos(다루는 공고번호들) }. views: 조감도(분양 시세비교 목록과 같은 그림)
const DOW = '일월화수목금토';
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (s) => { const d = new Date(`${s}T00:00:00Z`).getUTCDay(); return d > 0 && d < 6; };
const mdd = (s) => `${+s.slice(5, 7)}.${+s.slice(8, 10)}`;
const dowOf = (s) => DOW[new Date(`${s}T00:00:00Z`).getUTCDay()];
const SALE = ['APT', '오피스텔', '도시형'], RANDOM = ['무순위', '임의공급'];
const kindOf = (r) => (RANDOM.includes(r.kind) ? '무순위' : r.source === 'sh' || (r.kind && !SALE.includes(r.kind)) ? '임대' : '분양');
const regionOf = (r) => (['서울', '경기', '인천'].includes(r.region) ? r.region : '지방');
// 글이 없는 공고(r.url)는 청약홈·LH·SH 공고 화면으로
const postUrl = (r) => r.url || `https://auleezip.com/${r.slug || 'apt-' + r.no}/`;
// 장부(글이 있는 공고) + 청약달력 수집본의 접수가 남은 공고. 같은 공고번호는 장부를 쓴다
export function withSchedule(list, items, today) {
  const have = new Set(list.map((r) => r.no)), out = [...list];
  for (const it of items) {
    const no = /^\d+-\d+$/.test(it.id) ? it.id.split('-')[0] : it.id;
    if (have.has(no) || !receiptOf(it.phases) || closedOf(it.phases, today)) continue;
    have.add(no);
    out.push({ no, name: it.name, region: it.region, district: it.district || '', kind: it.kind, address: it.address || '', phases: it.phases, url: it.applyhomeUrl || it.url || it.homepageUrl, ...(no.startsWith('sh-') ? { source: 'sh' } : {}) });
  }
  return out;
}
// 공고 일정 → 날짜별 할 일(주말은 뺀다). 무순위·임대의 접수는 「접수」
export function eventsOf(r) {
  const name = { sp: '특공', p1: kindOf(r) === '분양' ? '1순위' : '접수', p2: '2순위', win: '발표' }, ev = {};
  for (const p of r.phases || []) {
    const k = name[p.k];
    if (!k || !p.date) continue;
    for (let s = p.date; s <= (p.end || p.date); s = addDays(s, 1)) if (weekday(s)) { ev[s] ||= []; if (!ev[s].includes(k)) ev[s].push(k); }
  }
  return ev;
}

export function openPage(list, today, res = {}, deeps = [], views = {}) {
  const start = (r) => receiptOf(r.phases)?.start || '9999';
  const open = list.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (start(a) < start(b) ? -1 : 1));
  const done = list.filter((r) => closedOf(r.phases, today)).sort((a, b) => ((receiptOf(a.phases)?.end || '') < (receiptOf(b.phases)?.end || '') ? 1 : -1));
  const deepOf = Object.fromEntries(deeps.flatMap((d) => (d.nos || [d.key]).map((n) => [n, d])));
  const ev = Object.fromEntries(list.map((r) => [r.no, eventsOf(r)]));
  const low = open.filter((r) => res[r.no] && !res[r.no].text && !res[r.no].leasehold && res[r.no].d < 0).sort((a, b) => res[a.no].d - res[b.no].d).filter((r, i, a) => a.findIndex((x) => shortName(x.name) === shortName(r.name)) === i);
  const soon = open.filter((r) => start(r) >= today && start(r) <= addDays(today, 7));
  const dayList = []; for (let s = today; dayList.length < 10; s = addDays(s, 1)) if (weekday(s)) dayList.push(s);
  // 오른쪽 칸은 청약을 준비하는 사람 기준(2026-10-31 사용자: 당첨 발표를 기다리려고 오는 곳이 아니다) — 마감이 가까운 접수 + 접수 전에 챙길 것
  const ends = open.map((r) => ({ r, rc: receiptOf(r.phases) })).filter((x) => x.rc).map((x) => ({ ...x, end: x.rc.end || x.rc.start })).sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0)).slice(0, 8);

  // 요약 칸마다 해당 공고 이름 2곳까지(2026-10-30 사용자: 숫자만 있어 휑함)
  const now = open.filter((r) => start(r) <= today).length, nameOf = (d) => list.find((r) => (d.nos || [d.key]).includes(r.no));
  const sub = (rows) => rows.length ? `<ul>${rows.slice(0, 2).map(([r, t]) => `<li>${link(postUrl(r), shortName(r.name))}<span>${t}</span></li>`).join('')}</ul>` : '';
  const sum = [
    ['접수 중·예정 공고', open.length, `<p class="ds">접수 중 ${now} · 예정 ${open.length - now}</p>`],
    ['7일 안에 청약 시작', soon.length, sub(soon.map((r) => [r, mdd(start(r))]))],
    ['주변 시세보다 낮은 분양가', low.length, sub(low.map((r) => [r, `<i class="az-blur">−${Math.round(-res[r.no].d)}%</i>`]))],
    ['심층 분석', deeps.length, deeps.length ? `<ul>${deeps.slice(0, 2).map((d) => `<li><a href="${esc(d.link)}">${esc(nameOf(d) ? shortName(nameOf(d).name) : d.title)}</a></li>`).join('')}</ul>` : ''],
  ].map(([t, n, x]) => `<div><p class="lb">${t}</p><p class="num">${n}</p>${x}</div>`).join('');
  // 고르는 칸: 라디오 + 이름표. 기본값이 아닌 칸(az-x)을 고르면 「조건 지우기」가 보인다. 번호는 site.css 고정 규칙과 맞춘다(g1 서울 … k3 임대, s1 시세 대비, s2 분양가)
  const opt = (name, id, label, cls, on = false, extra = '') => `<input type="radio" class="az-sr${on ? '' : ' az-x'}" name="${name}" id="${id}"${on ? ' checked' : ''}${extra}><label for="${id}" class="${cls}">${label}</label>`;
  const day = (s, i) => {
    const hit = list.filter((r) => ev[r.no][s]), cnt = (ks) => hit.filter((r) => ev[r.no][s].some((k) => ks.includes(k))).length;
    const parts = [['특공', cnt(['특공'])], ['청약', cnt(['1순위', '2순위', '접수'])], ['발표', cnt(['발표'])]].filter(([, n]) => n).map(([t, n]) => `${t} ${n}`);
    return opt('az-d', `az-d${i + 1}`, `<span class="dt">${mdd(s)}<small>${s === today ? '오늘' : dowOf(s)}</small></span><span class="ct">${parts.join(' · ') || '일정 없음'}</span>`, `az-day${i && dowOf(s) === '월' ? ' wk' : ''}`, false, hit.length ? '' : ' disabled');
  };
  const chips = (name, label, vals) => `<div class="az-fg" role="radiogroup" aria-label="${label}"><span>${label}</span>${vals.map((t, i) => opt(name, `${name}${i}`, t, 'az-fc', i === 0)).join('')}</div>`;
  const dayCss = dayList.map((s, i) => `.az-front:has(#az-d${i + 1}:checked) .az-ft tbody tr:not([data-ev~="${s}"]){display:none!important}.az-front:has(#az-d${i + 1}:checked) .az-fev[data-day="${s}"]{display:inline-block}`).join('');
  const badge = (r) => { const rc = receiptOf(r.phases); return closedOf(r.phases, today) ? '<span class="az-bd end">접수 마감</span>' : !rc ? '' : `<span class="az-bd ${today < rc.start ? 'd' : 'now'}">${recLabel(rc, today)}</span>`; };
  const row = (r) => {
    const rc = receiptOf(r.phases), x = res[r.no] || {}, closed = closedOf(r.phases, today), dp = deepOf[r.no];
    const cmp = x.text ? `<span class="az-cmp-t">${esc(x.text)}</span>` : x.leasehold ? '<span class="az-cmp-t">토지임대부라 땅값이 빠진 분양가입니다</span>' : typeof x.d === 'number' ? cmpBar(x.d) : '-';
    // 첫 화면에서는 비교 결과를 흐리게만 보여 글로 들어가 보게 한다(2026-10-31 사용자 요청 — 값은 화면 읽기 프로그램과 검색엔진에 그대로 있다). 토지임대부 안내문은 그대로
    const peek = (h) => `<a class="az-peek" href="${esc(postUrl(r))}" title="분양가와 주변 시세 비교 보기"><span class="az-peek-v">${h}</span><span class="az-peek-l" aria-hidden="true">비교 보기</span></a>`;
    const evs = Object.entries(ev[r.no]).filter(([d]) => dayList.includes(d)).map(([d, ks]) => `<span class="az-fev" data-day="${d}">${mdd(d)} ${ks.join('·')}</span>`).join('');
    const o1 = rank1.get(r.no), o2 = rank2.get(r.no), cls = [closed && 'cl', o1 !== undefined && 'o1', o2 !== undefined && 'o2'].filter(Boolean).join(' ');
    return `<tr${cls ? ` class="${cls}"` : ''}${o1 !== undefined || o2 !== undefined ? ` style="${o1 !== undefined ? `--o1:${o1};` : ''}${o2 !== undefined ? `--o2:${o2}` : ''}"` : ''} data-g="${regionOf(r)}" data-k="${kindOf(r)}" data-ev="${Object.keys(ev[r.no]).join(' ')}"><td class="c1"><p class="az-fnm">${r.url ? `<a class="az-ext" href="${esc(r.url)}" rel="nofollow noopener" title="공고 원문">${esc(shortName(r.name))}</a>` : link(postUrl(r), shortName(r.name))}${badge(r)}</p>${evs}</td><td class="c2">${esc(areaOf(r))}</td><td class="c3">${esc(r.url && kindOf(r) === '임대' ? r.kind : kindOf(r))}</td><td class="c4 n">${rc ? span(rc.start, rc.end) : '-'}</td><td class="c5 n">${x.p ? `${won(x.p)}<small>${x.m}㎡</small>` : '<span class="az-na">-</span>'}</td><td class="c6">${r.url ? '<span class="az-na">-</span>' : x.leasehold || cmp === '-' ? cmp : peek(cmp)}</td><td class="c7">${dp ? `<a class="az-deepbtn" href="${esc(dp.link)}">심층 분석</a>` : ''}</td></tr>`;
  };
  const all = [...open, ...done], num = (v) => (typeof v === 'number' ? v : Infinity);
  const dOf = (r) => { const x = res[r.no]; return x && !x.text && !x.leasehold ? x.d : undefined; };
  const by = (f) => [...all].sort((a, b) => num(f(a)) - num(f(b)));
  // 정렬 순번(2026-10-31): 표를 정렬마다 세 벌 그리면 공고가 늘 때 글이 커져 워드프레스가 502로 거절한다 — 한 벌에 순번을 달고 site.css가 order로 줄을 바꾼다
  const rank1 = new Map(by(dOf).filter((r) => dOf(r) !== undefined).map((r, i) => [r.no, i])), rank2 = new Map(by((r) => res[r.no]?.p).filter((r) => res[r.no]?.p).map((r, i) => [r.no, i]));
  const img = (d) => { const v = views[d.key], href = v?.page || v?.homepage, site = esc(v?.site || '분양 홈페이지'); return v?.url ? `<a href="${esc(d.link)}" tabindex="-1" aria-hidden="true"><img src="${esc(v.url)}" alt="" width="800" height="500" loading="lazy"></a><p class="az-deep-cap">${esc(v.label || '조감도')} · ${href ? `<a href="${esc(href)}" rel="nofollow noopener">${site}</a>` : site}</p>` : ''; };
  const deepBox = deeps.length ? `<section class="az-rbox az-rdeep"><h2>심층 분석<a href="${esc(DEEP_URL)}">전체 보기</a></h2>${deeps.map((d) => `<article>${img(d)}<h3><a href="${esc(d.link)}">${esc(d.title)}</a></h3>${d.card?.length ? `<ul>${d.card.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<p class="go"><a href="${esc(d.link)}">심층 분석 읽기</a></p></article>`).join('')}</section>` : '';
  const item = (r, right) => `<li><div>${link(postUrl(r), shortName(r.name))}<small>${esc(areaOf(r))} · ${kindOf(r)}</small></div>${right}</li>`;
  return page([
    `<style>${dayCss}</style>`,
    '<form class="az-front" action="#">',
    `<p class="az-flead">청약 공고마다 분양가(임대는 임대료)를 주변 단지 실거래와 맞춰 봤습니다. <time class="az-fdate" datetime="${today}">${esc(today.replaceAll('-', '.'))} 기준</time>이고 매일 아침 다시 만듭니다.</p>`,
    deepGrid(deeps, list, today, views), // 시험: 심층 분석을 맨 위에 격자로(오른쪽 칸의 심층 분석은 뺐다)
    `<div class="az-sum">${sum}</div>`,
    `<section class="az-days" aria-labelledby="az-days-h"><div class="az-days-head"><h2 id="az-days-h">청약 일정 2주</h2><p>날짜를 누르면 그날 일정이 있는 공고만 봅니다 · 전체 일정은 ${link(CAL_URL, '우리의 청약달력')}</p>${opt('az-d', 'az-d0', '날짜 해제', 'az-dclear', true)}</div><div class="az-days-row" role="radiogroup" aria-label="청약 일정 날짜">${dayList.map(day).join('')}</div></section>`,
    '<div class="az-fgrid"><section class="az-fmain" aria-label="공고 목록">',
    `<div class="az-fbar">${chips('az-g', '지역', ['전체', '서울', '경기', '인천', '지방'])}${chips('az-k', '구분', ['전체', '분양', '무순위', '임대'])}${chips('az-s', '정렬', ['접수 빠른 순', '시세 대비 낮은 순', '분양가 낮은 순'])}<label class="az-fck"><input type="checkbox" id="az-c" class="az-x">접수 끝난 공고도 보기</label></div>`,
    '<div class="az-fres"><p>기본은 접수 중·예정 공고입니다. 날짜를 고르면 접수가 끝난 공고의 발표 일정도 함께 보입니다. 「시세 대비 낮은 순」·「분양가 낮은 순」은 시세를 비교한 공고만 보입니다.</p><button type="reset">조건 지우기</button></div>',
    `<table class="az-ft"><thead><tr><th>단지</th><th>지역</th><th>구분</th><th class="n">접수</th><th class="n">주력 최고가</th><th>분양가와 주변 시세</th><th><span class="az-sr">심층 분석</span></th></tr></thead><tbody>${all.map(row).join('')}</tbody><tfoot><tr><td colspan="7" class="az-fcount"></td></tr></tfoot></table>`,
    src(`막대는 주력 주택형 최고 분양가가 비교 단지 실거래 중앙값(같은 면적 환산)보다 얼마나 높거나 낮은지이고 ±40%까지 그립니다. 계산 방법은 ${link(METHOD_URL, '비교 기준')}에 있습니다. 접수 일정은 입주자모집공고 기준이며 사업주체 사정에 따라 바뀔 수 있으니, 신청 전 공고문을 확인하시기 바랍니다.`),
    '</section><aside class="az-frail" aria-label="함께 보기">',
    ends.length ? `<section class="az-rbox"><h2>마감 임박</h2><ul class="az-rls">${ends.map(({ r, rc, end }) => item(r, `<span>${rc.start === end ? `<b>${mdd(end)}(${dowOf(end)}) 하루만</b>` : `${today < rc.start ? `${mdd(rc.start)} 시작<br>` : ''}<b>${mdd(end)}(${dowOf(end)}) 마감</b>`}</span>`)).join('')}</ul></section>` : '',
    '<section class="az-rbox az-prep"><h2>청약 전에 챙길 것</h2><ul><li>거주지·무주택·혼인·자녀는 <b>입주자모집공고일</b> 기준으로 따집니다. 공고가 나온 뒤에 옮겨도 바뀌지 않습니다.</li><li>청약통장 가입기간과 예치금도 공고일 기준입니다. 청약홈에서 순위확인서로 미리 확인해 두십시오.</li><li>당첨자 발표일이 같은 단지는 한 사람이 한 곳만 넣을 수 있습니다.</li><li>특별공급은 한 세대가 평생 한 번만 당첨될 수 있습니다.</li><li>당첨 서류는 대부분 공고일 이후 발급분만 받습니다. 미리 떼 둔 서류는 다시 떼야 할 수 있습니다.</li></ul></section>',
    '</aside></div></form>',
  ].join('\n'));
}
// 「분양 시세비교」 목록(카테고리 템플릿 category-5에 들어간다): 글마다 왼쪽 글, 오른쪽 조감도(2026-10-29 사용자 요청 — 정보 제공용, 출처는 사업주체 분양 홈페이지).
// posts: 공고번호 → { title, excerpt, link }. views: 공고번호 → { url, homepage }(조감도가 없으면 단지 이름 칸으로 자리만 채운다)
export function saleList(list, today, res = {}, posts = {}, views = {}) {
  const start = (r) => receiptOf(r.phases)?.start || '9999';
  const items = list.filter((r) => r.source !== 'sh' && posts[r.no]);
  const open = items.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (start(a) < start(b) ? -1 : 1));
  const done = items.filter((r) => closedOf(r.phases, today)).sort((a, b) => ((receiptOf(a.phases)?.end || '') < (receiptOf(b.phases)?.end || '') ? 1 : -1));
  const item = (r) => {
    const p = posts[r.no], v = views[r.no], rc = receiptOf(r.phases), x = res[r.no];
    const status = !rc ? '' : closedOf(r.phases, today) ? '접수 마감' : recLabel(rc, today);
    const meta = [esc(areaOf(r)), r.kind === '무순위' ? '무순위' : '분양', rc ? `접수 ${span(rc.start, rc.end)}` : '', status ? `<span class="az-status${status === '접수 마감' ? ' end' : ''}">${status}</span>` : ''].filter(Boolean).join(' · ');
    // 그림 밑 출처: 그림 이름(조감도·투시도) · 그림이 있던 곳(기본 분양 홈페이지 — LH 공고·공고문에서 받은 것은 그 이름, zip/views.mjs의 label·site)
    const label = esc(v?.label || '조감도'), site = esc(v?.site || '분양 홈페이지'), href = v?.page || v?.homepage;
    const img = v?.url
      ? `<figure class="az-vimg"><a href="${esc(p.link)}" tabindex="-1" aria-hidden="true"><img src="${esc(v.url)}" alt="${esc(shortName(r.name))} ${label}" width="800" height="500" loading="lazy"></a><figcaption>${label} · ${href ? `<a href="${esc(href)}" rel="nofollow noopener">${site}</a>` : site}</figcaption></figure>`
      : `<div class="az-vph" aria-hidden="true">${esc(shortName(r.name))}</div>`;
    return `<li class="az-vitem"><div class="az-vtext"><p class="az-vmeta">${meta}</p><h2><a href="${esc(p.link)}">${esc(p.title)}</a></h2><p class="az-vex">${esc(p.excerpt)}</p>${x && !x.text && !x.leasehold ? `<p class="az-vcmp">${cmpBar(x.d)}</p>` : ''}</div>${img}</li>`;
  };
  return [
    `<p class="az-vlead">청약 공고마다 주력 주택형 분양가를 주변 단지 실거래(전용 3.3㎡당 중앙값)와 비교합니다. 접수 중이거나 곧 열리는 공고가 위에 있고, ${esc(today.replaceAll('-', '.'))} 기준입니다.</p>`,
    open.length ? `<h2 class="az-vgroup">접수 중·예정 ${open.length}곳</h2><ul class="az-vlist">${open.map(item).join('')}</ul>` : '',
    done.length ? `<h2 class="az-vgroup">접수가 끝난 공고 ${done.length}곳</h2><ul class="az-vlist">${done.map(item).join('')}</ul>` : '',
    src('조감도·투시도는 사업주체 분양 홈페이지(청약홈 공고에 적힌 주소), LH 청약플러스 공고, 입주자모집공고문 같은 공식 자료에서 정보 제공을 위해 옮긴 그림으로, 실제와 다를 수 있습니다. 그림마다 밑에 출처를 적었습니다. 그림이 없는 공고는 공식 자료에서 찾지 못한 경우입니다.'),
  ].filter(Boolean).join('\n');
}

// 「심층 분석」·「임대 시세비교」 목록(2026-10-31 사용자 요청): 분양 시세비교처럼 오른쪽에 카드. 글자는 그림에 굽지 않고 HTML로 얹는다(선명하고 휴대폰에서도 같은 글).
// 심층 분석 카드 = 공식 조감도 위에 한 줄 훅(data/zip_deep/<key>.json의 hook: [작은 줄, 큰 줄, 노란 줄] — 글에 있는 사실만), 임대 카드 = 가장 낮은 월세와 주변 월세 대비 비율
// 「D-2」만으로는 시작인지 마감인지 모른다(2026-10-31 사용자) — 시작 전은 「2일 뒤 접수 시작」, 접수 중은 마감일까지 적는다
const recLabel = (rc, today) => { const n = days(today, rc.start), end = rc.end || rc.start; return n > 0 ? (n === 1 ? '내일 접수 시작' : `${n}일 뒤 접수 시작`) : end === today ? '오늘 접수 마감' : `접수 중 · ${mdd(end)} 마감`; };
const statusOf = (phases, today) => { const rc = receiptOf(phases); return !rc ? '' : closedOf(phases, today) ? '접수 마감' : recLabel(rc, today); };
// 접수 중·곧 열리는 것 먼저(첫 접수일 순), 마감된 것은 뒤로
const order = (r, today) => (!r ? 9e12 : (closedOf(r.phases, today) ? 5e12 : 0) + Date.parse(receiptOf(r.phases)?.start || '2999-01-01'));
const metaOf = (parts, status) => [...parts, status ? `<span class="az-status${status === '접수 마감' ? ' end' : ''}">${status}</span>` : ''].filter(Boolean).join(' · ');
const listItem = (meta, title, link, excerpt, card) => `<li class="az-vitem az-wide"><div class="az-vtext"><p class="az-vmeta">${meta}</p><h2><a href="${esc(link)}">${esc(title)}</a></h2><p class="az-vex">${esc(excerpt)}</p></div>${card}</li>`;

// 심층 분석 카드(조감도 + 훅 세 줄)와 접수 순 정렬 — 「심층 분석」 목록과 첫 화면 격자가 같이 쓴다
const deepCard = (d, r, v) => {
  const h = d.hook || [d.card?.[1] || '', shortName(r?.name || d.title), ''];
  const label = esc(v?.label || '조감도'), site = esc(v?.site || '분양 홈페이지'), href = v?.page || v?.homepage;
  return `<figure class="az-thumb-f"><a class="az-thumb deep" href="${esc(d.link)}" tabindex="-1" aria-hidden="true">${v?.url ? `<img src="${esc(v.url)}" alt="" width="800" height="500" loading="lazy">` : ''}<span class="k">${esc(h[0])}</span><span class="t">${esc(h[1])}${h[2] ? `<em>${esc(h[2])}</em>` : ''}</span></a>${v?.url ? `<figcaption>${label} · ${href ? `<a href="${esc(href)}" rel="nofollow noopener">${site}</a>` : site}</figcaption>` : ''}</figure>`;
};
const sortDeeps = (deeps, reg, today) => deeps.map((d) => [d, d.nos.map((n) => reg[n]).find(Boolean)]).sort(([, a], [, b]) => order(a, today) - order(b, today));
// 첫 화면 맨 위 심층 분석 격자(2026-10-31 사용자: 시험 삼아 심층 분석을 먼저 깔아 보기)
export const deepGrid = (deeps, list, today, views = {}) => {
  const reg = Object.fromEntries(list.map((r) => [r.no, r]));
  return deeps.length ? `<section class="az-dgrid" aria-labelledby="az-dgrid-h"><div class="az-days-head"><h2 id="az-dgrid-h">심층 분석</h2><p>공고문과 공개된 분석 의견으로 단지를 하나씩 따져 봤습니다 · <a href="${esc(DEEP_URL)}">전체 보기</a></p></div><ul>${sortDeeps(deeps, reg, today).map(([d, r]) => `<li>${deepCard(d, r, views[d.key])}<p class="az-vmeta">${metaOf([r ? esc(areaOf(r)) : ''], r ? statusOf(r.phases, today) : '')}</p><h3><a href="${esc(d.link)}">${esc(d.title)}</a></h3></li>`).join('')}</ul></section>` : '';
};

export function deepList(deeps, list, today, views = {}) {
  const reg = Object.fromEntries(list.map((r) => [r.no, r]));
  const item = (d, r) => listItem(metaOf([r ? esc(areaOf(r)) : '', '심층 분석'], r ? statusOf(r.phases, today) : ''), d.title, d.link, d.excerpt, deepCard(d, r, views[d.key]));
  return [
    `<p class="az-vlead">시세 비교만으로는 보이지 않는 것 — 입지·교통 계획, 주택형별 분양가와 필요한 돈, 공고문과 맞춰 본 공개된 분석 의견을 단지마다 정리했습니다. ${esc(today.replaceAll('-', '.'))} 기준입니다.</p>`,
    `<ul class="az-vlist">${sortDeeps(deeps, reg, today).map(([d, r]) => item(d, r)).join('')}</ul>`,
    src('카드의 조감도·투시도는 사업주체 분양 홈페이지, LH 청약플러스 공고, 입주자모집공고문 같은 공식 자료에서 정보 제공을 위해 옮긴 그림으로, 실제와 다를 수 있습니다. 카드 문구는 각 글의 내용을 줄인 것입니다.'),
  ].join('\n');
}

// units: data/sh_rent.json(호별 보증금·월세, 만원). 비율은 비교 거래가 충분한 호만
export function rentList(list, today, posts = {}, units = []) {
  const items = list.filter((r) => r.source === 'sh' && posts[r.no]);
  const item = (r) => {
    const p = posts[r.no], us = units.filter((u) => u.id === r.no), low = us.reduce((a, u) => (!a || u.rent < a.rent ? u : a), null);
    const rs = us.filter((u) => u.result && !u.result.insufficient).map((u) => Math.round(u.result.ratio * 100)), lo = Math.min(...rs), hi = Math.max(...rs);
    const areas = us.map((u) => Math.round(u.area)), ar = Math.min(...areas) === Math.max(...areas) ? `${areas[0]}㎡` : `${Math.min(...areas)}~${Math.max(...areas)}㎡`;
    const badge = rs.length ? `<span class="b${hi < 100 ? ' dn' : ''}">주변 월세의 ${lo === hi ? lo : `${lo}~${hi}`}%</span>` : '<span class="b">주변 비교 거래 부족</span>';
    const card = low ? `<figure class="az-thumb-f"><a class="az-thumb rent" href="${esc(p.link)}" tabindex="-1" aria-hidden="true"><span class="k">서울 ${esc(r.district || '')} · ${esc(r.kind || 'SH 임대')}</span><span class="t"><small>월세</small>${esc(Math.round(low.rent))}만원<small>부터</small></span><span class="s">보증금 ${esc(won(low.deposit))} · ${ar} · ${us.length}호</span>${low.result && !low.result.insufficient && low.result.ratio < 1 ? `<span class="s">주변 비슷한 집 월세 <s>${esc(Math.round(low.result.market))}만원</s></span>` : ''}${badge}</a></figure>` : '';
    return listItem(metaOf([`서울 ${esc(r.district || '')}`, '임대'], statusOf(r.phases, today)), p.title, p.link, p.excerpt, card);
  };
  return [
    `<p class="az-vlead">SH 임대 공고마다 호별 보증금·월세를 같은 구의 비슷한 면적·층·보증금 전월세 실거래와 비교합니다. ${esc(today.replaceAll('-', '.'))} 기준입니다.</p>`,
    `<ul class="az-vlist">${items.map(item).join('')}</ul>`,
    src('카드의 월세는 공고문의 호별 임대조건 중 가장 낮은 값이고, 비율은 주변 월세 거래 중앙값과 견준 값입니다(비교 거래가 모자란 호는 뺐습니다). 계산 방법은 비교 기준에 있습니다.'),
  ].join('\n');
}

// 비교 기준: zip/deals.mjs(분양)·zip/sh_rent.mjs(임대)·zip/ui.mjs(눈금)가 실제로 하는 그대로 적는다 — 코드를 바꾸면 이 글도 같이 고친다
export const methodPage = () => page([
  '<p>우리의 집 글이 숫자를 어떻게 고르고 계산하는지 한곳에 적었습니다. 글마다 쓴 기간과 단지 수는 각 글의 「이 글의 자료」에 있습니다.</p>',
  '<h2>분양 공고: 분양가와 비교 단지 실거래</h2>',
  '<ul><li><b>분양가</b>: 청약홈 입주자모집공고에서 세대수가 가장 많은 주력 주택형의 최고 분양가를 씁니다. 발코니 확장·옵션 비용은 빠져 있습니다.</li>'
  + '<li><b>비교 단지</b>: 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 고릅니다. 같은 시·군·구와 생활권이 이어지는 옆 시·군·구에서 고르고, 단지마다 고른 이유를 글에 적습니다. 고르는 일은 판단이라 다른 의견이 있을 수 있습니다.</li>'
  + '<li><b>실거래</b>: 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 씁니다.</li>'
  + '<li><b>비교 단지 시세</b>: 단지마다 전용 3.3㎡당 거래가의 중앙값을 내고, 그 값들의 중앙값을 씁니다. 거래 몇 건이 크게 튀어도 덜 흔들리게 평균 대신 중앙값을 씁니다.</li>'
  + '<li><b>같은 면적 환산</b>: 비교 단지 시세(전용 3.3㎡당)를 주력 주택형의 전용면적에 맞춰 바꾼 뒤 분양가와 견줍니다.</li></ul>',
  '<h2>비교 결과 눈금</h2>',
  '<p>분양가가 비교 단지 시세보다 몇 % 높거나 낮은지를 반올림한 값으로 다섯 구간에 놓습니다.</p>',
  `<div style="max-width:720px">${table(['구간', '기준'], [['많이 낮음', '20% 이상 낮음'], ['낮음', '5~19% 낮음'], ['비슷', '위아래 4% 안'], ['높음', '5~19% 높음'], ['많이 높음', '20% 이상 높음']], { stack: false })}</div>`,
  `<p>토지임대부 공고는 땅값이 빠진 분양가라 일반 아파트 거래가와 그대로 견줄 수 없어서 눈금을 그리지 않습니다. 「꿀분양」은 주력 주택형 기준으로 비교 단지 시세보다 ${GAP / 10000}억원 이상 또는 ${Math.round(RATE * 100)}% 이상 낮은 공고입니다(토지임대부는 넣지 않습니다).</p>`,
  '<h2>임대 공고: 임대보증금·월세와 주변 전월세 실거래</h2>',
  '<ul><li><b>임대조건</b>: SH 입주자 모집공고에 적힌 호별 임대보증금·월세를 옮겨 적고, 공고문 이미지에서 글자를 읽는 프로그램(OCR)으로 숫자를 다시 대조합니다.</li>'
  + '<li><b>주변 거래</b>: 국토교통부 전월세 실거래(아파트·연립다세대·오피스텔·단독다가구) 중 이 집과 같은 종류의 주택을, 같은 구에서 최근 6개월 안에 새로 맺은 계약만 씁니다. 갱신 계약과 같은 건물의 거래는 뺍니다. 단독·다가구 거래에는 층 정보가 없어 층대는 맞추지 못하고, 면적은 계약면적으로 봅니다.</li>'
  + '<li><b>맞추는 조건</b>: 전용면적이 비슷하고(±5㎡ 또는 ±15% 중 큰 쪽) 임대보증금이 ±30% 안인 월세 거래만 봅니다. 같은 층대(반지하·1층·저층·중층·고층)와 연식대끼리 먼저 보고, 거래가 3건 미만이면 조건을 풉니다. 실제로 쓴 조건은 글의 표에 적습니다. 신축은 비슷한 연식의 거래가 없으면 판단하지 않습니다.</li>'
  + '<li><b>월세 비율</b>: 이 집 월세 ÷ 그 거래들의 월세 중앙값입니다.</li></ul>',
  '<h2>날짜와 고친 기록</h2>',
  '<p>글 위에는 처음 올린 날과 마지막으로 고친 날을 적습니다. 실거래가 새로 쌓이거나 공고가 정정돼 숫자가 바뀌면 같은 글을 고치고, 글 끝 「고친 기록」에 날짜와 바뀐 내용을 남깁니다. 화면 모양만 바꾼 것은 기록하지 않습니다. 접수가 끝난 공고의 글은 「접수 마감」 표시를 달고 그대로 둡니다.</p>',
  '<h2>비교 글에서 지키는 것</h2>',
  '<ul><li>숫자는 공고문과 국토교통부 실거래 자료에서만 가져오고, 계산은 이 페이지에 적은 방법 그대로 합니다.</li><li>기사·영상의 이야기는 공식 자료와 맞춰 본 것만 「확인」으로 적습니다.</li><li>광고나 협찬을 받은 글은 글 첫머리에 따로 밝힙니다.</li></ul>',
].join('\n'));

export const aboutPage = () => page([
  // 2026-11-01 사용자 문안. 첫 문단이 검색 설명(Rank Math 자동)이 되니 두 문장을 한 문단에. 「최소 5명」은 실제와 달라(중앙하이츠 구성 1명·엘리프 시흥 3명 등) 「여러」로 — 수를 적으려면 영상별 폴더의 채널 수로 확인
  '<p>우리의 집(auleezip.com)은 청약 공고에 나온 분양 단지를 분석하는 블로그입니다. 먼저 입지와 미래 가치를 근거로 분석하고, 저 혼자만의 시선에 머물지 않도록 다른 애널리스트들의 인사이트까지 함께 살펴 분양 분석 리포트를 씁니다. 한쪽으로 치우치지 않는 중립적인 청약 리포트를 지향합니다.</p>',
  '<h2>이렇게 만듭니다</h2>',
  '<ul><li><b>공식 자료 수집:</b> 청약홈 입주자모집공고, 국토교통부 실거래가, 정부·지자체·사업주체의 공식 발표처럼 공식 기관이 제공하는 객관적인 자료를 모읍니다.</li>'
  + '<li><b>사실에 근거한 작성:</b> 모은 자료와 실제 입지, 공식 발표된 미래 계획만을 바탕으로 글을 씁니다.</li>'
  + '<li><b>여러 시선 교차 검토:</b> 객관성을 위해 공개된 여러 애널리스트의 분석을 함께 참고합니다. 그 내용을 사실과 하나씩 맞춰 보고, 놓친 정보는 보태고 한쪽으로 치우친 정보는 최대한 걸러 객관적인 내용만 전해 드립니다.</li></ul>',
  '<h2>글을 쓸 때 지키는 것</h2>',
  '<ul><li>작성된 모든 글은 청약이나 투자를 권하는 글이 아닙니다.</li><li>미래를 확신하는 말로 현혹하지 않고 객관적으로 분석합니다.</li><li>광고나 협찬을 받은 글은 글 첫머리에 따로 밝히며, 뒷광고는 하지 않습니다.</li></ul>',
  `<h2>함께 보면 좋은 곳</h2><p>청약 일정과 대출·정책 가이드는 ${link('https://aulee.tistory.com', '우리의 청약달력')}에서 매일 정리합니다. 지금 열린 공고는 ${link(OPEN_URL, '현재 열린 공고')}에서 볼 수 있습니다.</p>`,
].join('\n'));

export const privacyPage = () => page([
  '<p>우리의 집(auleezip.com, 이하 「사이트」)은 방문자의 개인정보를 직접 수집하지 않습니다. 회원가입과 댓글 기능이 없습니다.</p>',
  '<h2>자동으로 처리되는 정보</h2>',
  '<ul><li><b>방문 통계:</b> 구글 애널리틱스(Site Kit)를 통해 방문 기록(접속 페이지, 대략적인 지역, 기기 종류 등)이 익명으로 집계됩니다.</li><li><b>글꼴:</b> 한글 글꼴(IBM Plex Sans KR)을 구글 글꼴 서버에서 불러옵니다. 이때 브라우저가 구글 서버에 접속합니다.</li><li><b>쿠키:</b> 통계와 광고(구글 애드센스 사용 시)를 위해 쿠키가 쓰일 수 있습니다. 브라우저 설정에서 쿠키를 막거나 지울 수 있습니다.</li><li><b>서버 기록:</b> 호스팅 서버에는 접속 IP와 접속 시각이 보안·장애 대응을 위해 기록될 수 있습니다.</li></ul>',
  '<h2>제3자 제공</h2><p>위 서비스(구글 등)가 각자의 정책에 따라 처리하는 것 외에 개인정보를 제3자에게 제공하지 않습니다.</p>',
  '<h2>문의</h2><p>개인정보와 관련한 문의는 <a href="https://aulee.tistory.com">우리의 청약달력</a> 블로그의 방명록으로 남겨 주시기 바랍니다.</p>',
  note('이 방침은 사이트 운영 방식이 바뀌면 고쳐서 이 페이지에 알립니다.'),
].join('\n'));
