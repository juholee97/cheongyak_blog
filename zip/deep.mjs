// 우리의 집 「심층 분석」 글(2026-10-30 사용자 지시): 글을 처음부터 직접 쓰지 않는다. D:\부동산_청약분석\<단지 폴더>에 유튜브 분석기(D:\dev\apt_youtube_analyzer)가
// 영상 여러 편·공고문·웹 공식 자료를 여러 시선으로 정리한 종합리포트.html을 만들면, 세션에서 그 리포트를 읽고 data/zip_deep/<키>.json(글 자료)을 쓴 뒤 이 스크립트로 올린다.
// 키 = 첫 공고번호. 폴더 → 공고번호는 data/deep_folders.json. 글은 첫 화면(현재 열린 공고) 오른쪽 「심층 분석」 칸에 보인다(zip/pages.mjs openPage).
// node zip/deep.mjs                  폴더별 리포트 상태
// node zip/deep.mjs --read <키>       리포트 글자 → data/deep/<키>.txt(세션이 읽는다). 가족 맞춤 절(우리집_정보 기반)은 빼고 옮긴다 — 글에 쓰지 않는다
// node zip/deep.mjs --lint <키>       글 자료 점검: 숫자가 리포트·공고 자료에 있는지, 금지 표현, 가족 정보, 해요체
// node zip/deep.mjs --verify <키>|all  공개된 글을 받아 화면에 남은 표시(** [[ ]] &#…;) 검수 — --publish 끝에 자동으로도 돈다
// node zip/deep.mjs --draft <키>      임시글로 올림(미리보기 링크)    --publish <키>  사용자 승인 뒤 공개(그 뒤 node zip/publish.mjs --go --pages로 메인 갱신)
// 글 자료: { title, excerpt, card: [메인 카드 숫자 줄], blocks: [{h}|{p}|{ul}|{key}|{table:{head,rows}}|{note}|{grid:{cols,rows}}|{plan:[[구분,내용,상태]]}|{timeline}|{claims:{keep:[공고문과 맞는 주장 중 실을 것의 글귀]}}|{links:[[이름,주소]]}], sources: [[이름,주소]] }
// 본문 글자 안 [[r:글귀]] 위험(빨강)·[[y:]] 주의(노랑)·[[b:]] 핵심(파랑)·[[g:]] 유리(초록) 배경색 — 한 항목에 한두 곳, 글 전반에. 쓰면 글 맨 위에 색 뜻 안내가 붙는다
// 리포트 속 분석 의견은 공고문과 맞춰 본 결과만 싣는다(전망 숫자·채널 평가는 옮기지 않는다). 채널·영상 이름·링크는 쓰지 않고 「공개된 분석 의견」으로 포괄한다(2026-10-30 사용자 결정).
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc } from '../posts/weekly.mjs';
import { BANNED } from '../posts/check.mjs';
import { wrap, planOf, liveDeep } from './post.mjs';
import { table, keyBox, note, src, chip, keepUnits } from './ui.mjs';
import { won } from './timeline.mjs';

export const BASE = 'D:/부동산_청약분석', CAT_DEEP = '심층 분석';
const FOLDERS = join(ROOT, 'data/deep_folders.json'), DIR = join(ROOT, 'data/zip_deep');
export const folders = async () => JSON.parse(await readFile(FOLDERS, 'utf8').catch(() => '{}'));
const folderOf = async (key) => Object.entries(await folders()).find(([, nos]) => nos[0] === key)?.[0];
export const loadDeep = async (key) => JSON.parse(await readFile(join(DIR, `${key}.json`), 'utf8').catch(() => 'null'));
export async function allDeep() {
  const out = [];
  for (const f of await readdir(DIR).catch(() => [])) if (/^\d+\.json$/.test(f)) out.push({ key: f.slice(0, -5), ...JSON.parse(await readFile(join(DIR, f), 'utf8')) });
  return out;
}

// 리포트 HTML → 글자. 그림(data:)·스크립트는 버리고, 가족 맞춤 절은 뺀다
const FAMILY = /우리 가족|우리 아기|우리집_정보|예비 신혼부부인|우리 기준/;
export function reportText(html) {
  let s = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/src="data:[^"]+"/g, '');
  s = s.replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|section|table)>/g, '\n').replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // 가족 절: 「우리 가족 청약 자격」~「영상별 의견 비교」 앞까지(우리 아기 관점 포함)
  s = s.replace(/\n\s*우리 가족 청약 자격\s*\n[\s\S]*?(?=\n\s*영상별 의견 비교\s*\n)/, '\n');
  return s.split('\n').map((l) => l.trim()).filter((l) => l && !FAMILY.test(l)).join('\n');
}

// 표 칸 글자를 한 덩어리로: 휴대폰 표(az-stack)는 칸이 flex라, keepUnits가 「60㎡」에 씌우는 span마다 따로 줄이 갈라진다
const cv = (t) => { const [a, ...b] = String(t).split('\n'); return `<span>${tx(a)}${b.map((x) => `<small>${tx(x)}</small>`).join('')}</span>`; }; // 줄바꿈 뒤는 작은 글씨 둘째 줄
// 괄호 밖의 구분자로만 자른다(「4억9,570만」의 쉼표·괄호 속 쪽수는 그대로)
const splitTop = (s, sep) => { const out = []; let d = 0, cur = ''; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '(') d++; if (ch === ')') d--; if (!d && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; } else cur += ch; } return [...out, cur].map((x) => x.trim()).filter(Boolean); };
// 대조표 공식 자료 칸: 「공고문 공급금액: A, B, C (9쪽)」 같은 나열은 한 줄에 하나씩(2026-10-30 사용자 지시 — 쉼표 나열보다 줄바꿈). 문장은 그대로
export const listItems = (t) => {
  let s = String(t || '').trim(), cite = '';
  const m = s.match(/\s*(\([^()]*쪽[^()]*\))$/); if (m) { cite = m[1]; s = s.slice(0, m.index); }
  const h = s.match(/^(.*?\.\s+)?([^:().]{1,20}):\s*/), lead = h?.[1]?.trim() || '', head = h ? h[2] : '', body = h ? s.slice(h[0].length) : s; // 「…없다. 웹 자료: A, B」 앞 문장은 따로
  let items = splitTop(body, ', '); if (items.length < 2) items = splitTop(body, ' / ');
  const sentence = items.slice(0, -1).some((x) => /(고|며|서|지만|는데)$/.test(x)); // 「…하지 않고, …한다」처럼 한 문장을 쉼표로 이은 것은 자르지 않는다
  return !sentence && items.length >= (head ? 2 : 3) ? { lead, head, items, cite } : { lead: '', head: '', items: [s], cite };
};
const listCell = (t) => { const { lead, head, items, cite } = listItems(t); return items.length < 2 ? cv(t) : `<span>${lead ? `${esc(lead)} ` : ''}${head ? esc(head) : ''}<ul class="az-cl">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${cite ? `<small>${esc(cite)}</small>` : ''}</span>`; };
const VERDICT = { 맞음: '확인', 다름: '다름', 과장: '다름', '확인 필요': '공식 자료 없음', '전망·검증불가': '공식 자료 없음' };
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
async function analyzerData(folder) {
  const d = join(BASE, folder, '_data');
  const [summary, state] = await Promise.all(['summary.json', 'state.json'].map((f) => readFile(join(d, f), 'utf8').then(JSON.parse).catch(() => null)));
  const videos = Object.entries(state?.videos || {}).filter(([, v]) => v.status === 'done').sort((a, b) => a[1].no - b[1].no)
    .map(([id, v]) => ({ id, title: v.title, channel: (v.html || '').split('_')[1] || '', url: `https://www.youtube.com/watch?v=${id}` }));
  return { summary, videos };
}

// 실을 주장: 가족 맞춤 문장과 가격 전망(전망·검증불가)은 뺀다
// 이름을 잘못 적거나 잘못 들은 것뿐인 주장도 뺀다(「물현기초」 → 물향기초: 내용은 맞고 표기만 틀림, 2026-10-30 사용자 지시). 금액이 걸린 주장은 남긴다
const TYPO = /오인식|오타|오기|잘못 (적|표기|들|읽)/, MONEY = /\d\s*(만|억)?\s*원/;
const claimRows = (checks) => (checks || []).filter((c) => c.verdict !== '전망·검증불가' && !FAMILY.test(c.claim + c.note + c.official) && !(TYPO.test(c.note) && !MONEY.test(c.claim)));
// 출처 매체를 밝히지 않는다(2026-10-30 사용자 결정: 채널·영상 이름을 쓰면 특정인을 깎아내린다는 다툼이 생길 수 있다 — 「공개된 분석 의견을 찾아본 결과」로 포괄해서 쓴다).
// 리포트 문장에 남은 영상 번호·재생 시각·채널 이름을 지우고 「영상」을 「분석 의견」으로 바꾼다. 남은 흔적은 --lint가 잡는다
export const scrub = (t, videos = []) => {
  let s = String(t || '').replace(/\s*\((?=[^()]*(?:t=\d|s_\d|\b[A-Za-z0-9_-]{11}\b))[^()]*\)/g, '');
  for (const v of videos) { // 영상 번호는 앞 네 글자만 적힌 곳도 있다. 조사가 바로 붙은 번호(「…에도 나온다」)는 「다른 분석 의견」으로 바꾸고 조사를 맞춘다
    const id = `${v.id.slice(0, 4).replace(/-/g, '\\-')}[A-Za-z0-9_-]*`;
    const at = '(?:\\s*\\([^()]*초\\))?'; // 번호 뒤에 붙은 재생 시점 「(539초)」
    s = s.replace(new RegExp(`(?:영상\\s*)?${id}${at}(는|가|를|와|에도|도|의|에서|에)`, 'g'), (_, j) => `다른 분석 의견${{ 는: '은', 가: '이', 를: '을', 와: '과' }[j] || j}`).replace(new RegExp(`${id}${at},?\\s*`, 'g'), '');
    if (v.channel) s = s.split(v.channel).join('다른 분석');
  }
  return s.replace(/출연자의? 의견/g, '개인 의견').replace(/출연자/g, '의견을 낸 쪽').replace(/로 들리는/g, '로 적힌').replace(/자막 오인식/g, '잘못 적은 이름').replace(/자막/g, '표기').replace(/영상/g, '분석 의견').replace(/가장 확실하다/g, '가장 정확하다').replace(/\bnotice(?:_[0-9a-f]+)?/g, '공고문').replace(/공고문·공고문/g, '공고문') // 리포트의 내부 파일 이름(notice_849f1ea1 = 공고문 원문).replace(/\s{2,}/g, ' ').trim();
};
// 분석 의견 대조표: 다른 것·공식 자료로 확인 못 한 것을 먼저. 공고문과 맞는 것은 keep(주장 글귀 일부)에 적은 것만 — 글 다른 절과 겹치는 당연한 내용은 뺀다(2026-10-30 사용자 지시)
const keptOk = (ch, keep) => ch.filter((c) => c.verdict === '맞음' && (!keep || keep.some((k) => c.claim.includes(k))));
function claimsHtml(checks, videos, keep) {
  const x = (t) => scrub(t, videos), off = claimRows(checks).filter((c) => c.verdict !== '맞음'), ok = keptOk(claimRows(checks), keep);
  const row = (c) => [esc(x(c.claim)), `<span>${chip(VERDICT[c.verdict] || '공식 자료 없음')}${c.note ? `<small>${esc(x(c.note))}</small>` : ''}</span>`, listCell(x(c.official))];
  const head = ['공개된 분석 의견', '확인 결과', '공고문·공식 자료'];
  return [
    '<h3>공고문과 맞춰 본 결과</h3>',
    `<p>사실에 가까운 내용과 그렇지 않은 내용을 구분하려고, 분석 의견 가운데 확인할 수 있는 주장 ${off.length + ok.length}개를 입주자모집공고문과 공식 자료에 맞춰 봤습니다. 공고문과 다르거나 공식 자료로 확인되지 않은 것을 먼저 놓았고, 공고문과 맞는 내용 중 이 글의 다른 부분에 이미 적은 것은 뺐습니다.</p>`,
    `<div class="az-claims">${table(head, [...off, ...ok].map(row))}</div>`,
    src('「공식 자료 없음」은 틀렸다는 뜻이 아니라 공고문·공식 자료로 확인되지 않았다는 뜻입니다. 앞으로의 가격 전망은 확인할 수 있는 사실이 아니어서 이 표에 싣지 않았습니다. 어느 한 의견을 평가하려는 표가 아니라, 청약 전에 사실을 가려 보려는 정리입니다.'),
  ];
}

// 타임라인 그림: zip/timeline.mjs 틀로 찍어 data/deep/img/<키>-<종류>.png. local이면 미리보기용 상대 경로, 아니면 미디어로 올린 주소
async function figures(key, blocks, local) {
  const { scheduleHtml, moneyHtml, shoot } = await import('./timeline.mjs'), out = {};
  await mkdir(join(ROOT, 'data/deep/img'), { recursive: true });
  for (const b of blocks.filter((x) => x.timeline)) {
    const t = b.timeline, name = `${key}-${t.kind}.png`, file = join(ROOT, 'data/deep/img', name);
    await shoot(t.kind === 'money' ? moneyHtml(t) : scheduleHtml(t), file);
    if (local) out[t.kind] = `img/${name}`;
    else { const { uploadMedia, wp } = await import('./wp.mjs'), id = await uploadMedia(file, `deep-${name}`, t.title); out[t.kind] = (await wp(`media/${id}`)).source_url; }
  }
  return out;
}
const altOf = (t) => (t.kind === 'money'
  ? `${t.title}. ${t.cash.map((c) => `${c.date} ${c.label} ${won(c.amount)}`).join(', ')}. ${t.loan ? t.loan.label + '. ' : ''}${t.interest ? t.interest.label + '. ' : ''}${t.total.label} ${t.total.value}.`
  : `${t.title}. ${t.items.map((x) => `${x.date} ${x.label}`).join(', ')}.`);
// 노선 이름에 노선 색 표시(2026-10-30 사용자 요청). 색은 수도권 전철 노선도 색. 새 노선이 글에 나오면 여기에 더한다
const LINES = { 'GTX-A': '#9a6292', 경의중앙선: '#77c4a3', 수인분당선: '#f5a200', 신분당선: '#d4003b', 서해선: '#8fc31f', 인천1호선: '#7ca8d5', 인천2호선: '#ed8b00', '1호선': '#0052a4', '2호선': '#00a84d', '3호선': '#ef7c1c', '4호선': '#00a5de', '5호선': '#996cac', '6호선': '#cd7c2f', '7호선': '#747f00', '8호선': '#e6186c', '9호선': '#bdb092' };
const LINE_RE = new RegExp(`(?<![0-9가-힣A-Za-z-])(${Object.keys(LINES).sort((a, b) => b.length - a.length).join('|')})`, 'g');
const line = (h) => h.replace(LINE_RE, (m) => `<span class="az-line" style="--c:${LINES[m]}">${m}</span>`); // h: 이미 이스케이프한 글자
// 키워드 배경색(2026-10-30 사용자 요청: 줄글은 키워드로 훑어 읽으니 위험·주의·핵심·유리를 색으로). 글 자료에 [[r:글귀]] 식으로 적는다 — 한 항목에 한두 곳, 짧은 글귀만
// 주로 빨강·노랑·초록, 파랑은 글 전체에서 손꼽을 핵심(분양가·필요한 돈 같은 것)에만 드물게. 굵게 하지 않는다(사용자 지시)
const HL = { r: ['위험', '손해·자격 상실·돈이 크게 더 들 수 있는 것'], y: ['주의', '생활 불편·바뀔 수 있는 것·직접 확인할 것'], g: ['유리', '청약자에게 좋은 점'], b: ['핵심', '이 글에서 가장 중요한 숫자'] };
const HL_RE = /\[\[([rybg]):(.+?)\]\]/g;
const hl = (h) => h.replace(HL_RE, (_, c, t) => `<mark class="az-hl ${c}">${t}</mark>`);
const unhl = (t) => String(t).replace(HL_RE, '$2');
const tx = (t) => hl(line(esc(t)));
const lead = (h) => h.replace(/^([^:<]{1,16}):\s/, '<b>$1</b>: '); // 목록 앞머리 「지역 우선:」은 굵게
const legend = () => `<p class="az-hl-legend">${Object.entries(HL).map(([c, [n, d]]) => `<span><mark class="az-hl ${c}">${n}</mark> ${d}</span>`).join('')}</p>`;
// 입지 표: [구분, 내용, 상태] 줄을 구분별 묶음으로(좁은 구분 칸이 세로 글씨가 되지 않게). 상태 앞머리 「확정·계획·공고문」은 색 표시
const STATE = { 확정: 'ok', 계획: 'plan', 공고문: 'na' };
const planHtml = (rows) => {
  const groups = [];
  for (const [g, ...r] of rows) { if (groups.at(-1)?.[0] !== g) groups.push([g, []]); groups.at(-1)[1].push(r); }
  const st = (t) => { const m = t.match(/^(확정|계획|공고문)\s*[·:]\s*/); return m ? `<span class="az-chip ${STATE[m[1]]}">${m[1]}</span> ${esc(t.slice(m[0].length))}` : esc(t); };
  return `<div class="az-plan">${groups.map(([g, r]) => `<section><p class="az-plan-h">${esc(g)}</p><ul>${r.map(([w, s]) => `<li><p class="w">${tx(w)}</p><p class="s">${st(s)}</p></li>`).join('')}</ul></section>`).join('')}</div>`;
};
// 기본 정보 그리드: 칸마다 이름, 3단지·4단지처럼 나란히 놓을 값. 두 값이 같으면 한 칸으로 합친다(「3단지·4단지 공통」 표시 — 한 칸인지 두 칸인지 헷갈리지 않게, 2026-10-30 사용자 지적)
const gridHtml = ({ cols, rows }) => `<div class="az-grid" style="--n:${cols.length}"><div class="az-grid-r az-grid-h"><span></span>${cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>${rows.map(([k, ...v]) => `<div class="az-grid-r"><span class="k">${esc(k)}</span>${v.every((x) => x === v[0]) ? `<span class="all"><em class="az-both">${esc(cols.join('·'))} 공통</em>${tx(v[0])}</span>` : v.map((x) => `<span>${tx(x)}</span>`).join('')}</div>`).join('')}</div>`;

export async function render(key, { local = false } = {}) {
  const d = await loadDeep(key), folder = await folderOf(key);
  if (!d) throw new Error(`data/zip_deep/${key}.json 없음`);
  const { summary, videos } = await analyzerData(folder), figs = await figures(key, d.blocks, local);
  // PC 오른쪽 안내 칸(2026-10-30 사용자: PC에서는 PC답게 널널하게): 목차·핵심 숫자·함께 볼 글. 휴대폰에서는 숨긴다(site.css .az-deep-post)
  const heads = [...d.blocks.filter((b) => b.h).map((b) => b.h), '이 글의 자료'];
  let hn = 0;
  const more = d.blocks.find((b) => b.links && b.links.some(([, u]) => u.includes('/apt-')))?.links || [];
  const rail = `<aside class="az-drail" aria-label="이 글 안내"><div><p class="az-drail-h">목차</p><ol>${heads.map((t, i) => `<li><a href="#s${i + 1}">${esc(t)}</a></li>`).join('')}</ol>${d.card?.length ? `<p class="az-drail-h">핵심 숫자</p><ul>${d.card.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${more.length ? `<p class="az-drail-h">함께 보기</p><ul class="az-drail-links">${more.map(([t, u]) => `<li><a href="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul>` : ''}</div></aside>`;
  const block = (b) => {
    if (b.h) return `<h2 id="s${++hn}">${esc(b.h)}</h2>`;
    if (b.h3) return `<h3>${esc(b.h3)}</h3>`;
    if (b.p) return `<p>${tx(b.p)}</p>`;
    if (b.ul) return `<ul>${b.ul.map((t) => `<li>${lead(tx(t))}</li>`).join('')}</ul>`;
    if (b.key) return keyBox(b.key.map(tx), b.title || '한눈에 보기');
    if (b.table) return table(b.table.head, b.table.rows.map((r) => r.map(cv)), { stack: !b.table.compact });
    if (b.grid) return gridHtml(b.grid);
    if (b.plan) return planHtml(b.plan);
    if (b.timeline) return `<figure class="az-fig"><img src="${esc(figs[b.timeline.kind])}" alt="${esc(altOf(b.timeline))}" width="720" loading="lazy">${b.timeline.caption ? `<figcaption>${esc(b.timeline.caption)}</figcaption>` : ''}</figure>`;
    if (b.note) return note(tx(b.note));
    if (b.src) return src(tx(b.src));
    if (b.links) return `<ul class="az-links">${b.links.map(([t, u]) => `<li><a href="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul>`;
    if (b.claims) return claimsHtml(summary?.claim_checks, videos, b.claims.keep).join('\n');
    throw new Error(`모르는 블록 ${JSON.stringify(b).slice(0, 60)}`);
  };
  const html = [
    JSON.stringify(d.blocks).includes('[[') ? legend() : '',
    ...d.blocks.map(block),
    `<h2 id="s${heads.length}">이 글의 자료</h2>`,
    '<p>이 글은 입주자모집공고문과 청약홈·LH·교육청 같은 공식 자료를 기준으로, 온라인에 공개된 여러 분석 의견을 함께 찾아보고 aulee가 다시 정리한 결과입니다. 분석 의견은 여러 시선을 보려고 참고했고, 숫자와 조건은 공고문을 기준으로 적었습니다.</p>',
    `<ul class="az-links">${(d.sources || []).map(([t, u]) => `<li><a href="${esc(u)}" rel="nofollow noopener">${esc(t)}</a></li>`).join('')}</ul>`,
    src('분석 의견은 aulee가 확인한 사실이 아니며, 공고문과 맞춰 본 결과만 옮겼습니다. 이 글은 청약 판단을 돕는 정보이고 청약이나 투자를 권하지 않습니다. 자격·분양가·일정은 청약 전에 청약홈 입주자모집공고 원문으로 다시 확인하시기 바랍니다.'),
  ].filter(Boolean).join('\n');
  return { slug: `deep-${key}`, title: d.title, html: wrap(keepUnits(html.replace(/\*\*([^*<>]+?)\*\*/g, '<b>$1</b>')) + rail).replace('<div class="az">', '<div class="az az-deep-post">'), excerpt: d.excerpt, categories: [CAT_DEEP], tags: d.tags || [] };
}

// 화면에 남은 표시 찾기(2026-10-30 사용자 지시: 「**개교시기 미정**」처럼 굵게 하려다 실패한 흔적을 작성·게시 뒤 항상 검수). 태그를 걷어낸 글자에서 찾는다
export function leftovers(html) {
  const t = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const pats = [[/\*\*|__/g, '굵게 표시(** __)가 그대로 보임'], [/\[\[|\]\]/g, '색 표시([[ ]])가 그대로 보임'], [/&#?[A-Za-z0-9]+;/g, '문자 코드(&#…;)가 그대로 보임'], [/(^|\s)#{1,6}\s/g, '제목 표시(#)가 그대로 보임'], [/\\n/g, '줄바꿈 \\n이 글자로 보임'], [/\b(undefined|NaN|null)\b|\[object /g, '빈 값(undefined·NaN·null)'], [/\(\d+초\)|\bnotice\b|장면 s_\d/g, '리포트 안쪽 표시(재생 시점·notice·장면 번호)가 남음']];
  return pats.flatMap(([re, m]) => [...t.matchAll(re)].slice(0, 3).map((x) => `${m}: 「${t.slice(Math.max(0, x.index - 18), x.index + 22).replace(/\s+/g, ' ').trim()}」`));
}

// 게시 뒤 검수: 실제 페이지를 받아 본문 칸(entry-content~꼬리 줄)에 남은 표시가 없는지. 머리의 CSS에도 클래스 이름이 있어 실제 본문 칸부터 자른다
export async function verifyLive(link) {
  const r = await fetch(`${link}?check=${Date.now()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null), page = r?.ok ? await r.text() : '';
  const i = page.indexOf('<div class="entry-content'), j = page.indexOf('class="wp-block-group az-footer'), body = i > 0 ? page.slice(i, j > i ? j : undefined) : '', live = body ? leftovers(body) : null;
  console.log(!live ? `게시 뒤 검수 못 함: 페이지 응답 ${r?.status ?? '없음'} — 브라우저로 직접 확인` : live.length ? `게시 뒤 검수 실패 ${link}\n${live.join('\n')}` : `✓ 게시 뒤 검수 통과(남은 표시 없음) ${link}`);
  if (!live || live.length) process.exitCode = 1;
  return live;
}

// 점검: 글 숫자가 리포트·공고 자료에 있는지(지어낸 숫자 막기), 금지 표현, 가족 정보, 해요체(워드프레스는 합쇼체)
export async function check(key) {
  const d = await loadDeep(key), folder = await folderOf(key), issues = [];
  const { summary, videos } = await analyzerData(folder);
  const tl = (t) => (!t ? [] : [t.title, t.sub, t.caption, t.note, ...(t.items || []).flatMap((x) => [x.date, x.label, x.sub]), ...(t.cash || []).flatMap((c) => [c.date, c.label, won(c.amount)]), t.loan?.label, ...(t.loan?.dates || []), t.loan && won(t.loan.amount), t.interest?.label, t.total?.label, t.total?.value]);
  const texts = d.blocks.flatMap((b) => [b.h, b.h3, b.p, b.note, b.src, ...(b.ul || []), ...(b.key || []), ...(b.table ? [...b.table.head, ...b.table.rows.flat()] : []), ...(b.grid ? [...b.grid.cols, ...b.grid.rows.flat()] : []), ...(b.plan || []).flat(), ...tl(b.timeline)]).filter(Boolean).concat([d.title, d.excerpt, ...(d.card || [])]);
  for (const t of texts) if (/\[\[|\]\]/.test(unhl(t))) issues.push(`색 표시 문법 틀림([[r:글귀]]·y·b·g만): 「${t.slice(0, 50)}」`);
  for (const t of [d.title, d.excerpt, ...(d.card || [])]) if (/\[\[[rybg]:/.test(t ?? '')) issues.push(`제목·요약·카드에는 색 표시를 쓰지 않는다: 「${t.slice(0, 50)}」`);
  texts.splice(0, texts.length, ...texts.map(unhl));
  const auto = d.blocks.some((b) => b.claims) ? claimRows(summary?.claim_checks).flatMap((c) => [c.claim, c.note, c.official]).filter(Boolean).map((t) => scrub(t, videos)) : []; // 대조표는 리포트 문장 그대로라 숫자 대조는 건너뛰고 표현만 본다
  const corpus = [await readFile(join(BASE, folder, '종합리포트.html'), 'utf8'), await readFile(join(BASE, folder, '_data/notice.json'), 'utf8').catch(() => ''),
    ...await Promise.all((await folders())[folder].map((n) => readFile(join(ROOT, 'data/zip_posts', `${n}.json`), 'utf8').catch(() => '')))].join('\n').replace(/(\d),(?=\d{3})/g, '$1');
  for (const k of d.blocks.find((b) => b.claims)?.claims.keep || []) if (!keptOk(claimRows(summary?.claim_checks), [k]).length) issues.push(`대조표 keep 「${k}」 — 공고문과 맞는 주장 중에 없음(리포트가 새로 만들어졌으면 다시 고른다)`);
  for (const t of [...texts, ...auto]) {
    if (!auto.includes(t)) for (const m of t.replace(/(\d),(?=\d{3})/g, '$1').match(/\d{2,}(?:\.\d+)?/g) || []) if (!corpus.includes(m)) issues.push(`숫자 ${m} — 리포트·공고 자료에 없음: 「${t.slice(0, 50)}」`);
    for (const w of BANNED) if (t.replace(/기관추천/g, '').includes(w)) issues.push(`금지 표현 「${w}」: 「${t.slice(0, 50)}」`);
    if (FAMILY.test(t)) issues.push(`가족 정보: 「${t.slice(0, 50)}」`);
    if (/유튜브|영상|채널|출연자|자막|구독|조회수/.test(t) || videos.some((v) => t.includes(v.id.slice(0, 4)) || (v.channel && t.includes(v.channel)))) issues.push(`매체 흔적(채널·영상을 밝히지 않는다): 「${t.slice(0, 50)}」`);
    if (/(해요|에요|예요|세요|어요|아요|네요|죠)[.!?]/.test(t)) issues.push(`해요체: 「${t.slice(0, 50)}」`);
  }
  return issues;
}

if (process.argv[1]?.endsWith('deep.mjs')) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  if (process.argv.includes('--self-check')) {
    const assert = (await import('node:assert/strict')).default;
    const t = reportText('<h2>종합 판단</h2><p>좋은 점</p><h2>우리 가족 청약 자격</h2><p>혼인 정보</p><h2>영상별 의견 비교</h2><p>우리 가족 기준 한 줄</p><p>영상 A</p><img src="data:image/png;base64,AAAA">');
    assert.ok(t.includes('좋은 점') && t.includes('영상 A') && !t.includes('혼인 정보') && !t.includes('우리 가족') && !t.includes('base64'));
    const r = listItems('공고문 공급금액: 3단지 60형 4억9,570만~5억8,900만원, 84A 6억7,270만~7억9,800만원, 88형 6억9,000만~8억4,100만원 (3단지 9·10쪽)');
    assert.deepEqual([r.head, r.items.length, r.items[1], r.cite], ['공고문 공급금액', 3, '84A 6억7,270만~7억9,800만원', '(3단지 9·10쪽)']);
    assert.equal(listItems('공고문: 우선공급(3단지 135세대, 4단지 114세대) 대상자는 청약을 하지 않고, 서류만 제출한다').items.length, 1);
    const g = listItems('공고문에는 GTX 관련 서술이 없다. 웹 자료: 운정중앙~서울역 개통, 서울역~수서 2026년 개통 예정(삼성역 무정차 통과), 삼성역 포함 전 구간 2028년 예정');
    assert.deepEqual([g.lead, g.head, g.items.length], ['공고문에는 GTX 관련 서술이 없다.', '웹 자료', 3]);
    assert.equal(listItems('공고문: 3단지 주차 779대 / 472세대, 4단지 724대 / 472세대').items[0], '3단지 주차 779대 / 472세대');
    assert.equal(scrub('같은 주장이 NEwy2SruxEA(t=827)에도 나온다', [{ id: 'NEwy2SruxEA' }]), '같은 주장이 다른 분석 의견에도 나온다');
    assert.equal(scrub('iqwICfKxfTg(539초)는 같은 사실을 지적했다', [{ id: 'iqwICfKxfTg' }]), '다른 분석 의견은 같은 사실을 지적했다');
    assert.equal(scrub('무순위 공고문·notice 정리, notice_849f1ea1 38쪽'), '무순위 공고문 정리, 공고문 38쪽');
    assert.ok(leftovers('<p>(가칭)계양2초 **개교시기 미정**으로</p>').length > 0);
    assert.ok(leftovers('<p>a &amp;#34; b</p>').length > 0);
    assert.equal(leftovers('<p>개교 <b>시기 미정</b>, 21% 높음</p><style>a{b:c}</style>').length, 0);
    console.log('deep 점검 통과');
  } else if (arg('--read')) {
    const key = arg('--read'), folder = await folderOf(key);
    await mkdir(join(ROOT, 'data/deep'), { recursive: true });
    const out = join(ROOT, 'data/deep', `${key}.txt`);
    await writeFile(out, reportText(await readFile(join(BASE, folder, '종합리포트.html'), 'utf8')));
    console.log('→', out);
  } else if (arg('--lint')) {
    const issues = await check(arg('--lint'));
    console.log(issues.length ? issues.join('\n') : '✓ 점검 통과');
    process.exitCode = issues.length ? 1 : 0;
  } else if (arg('--verify')) {
    // 공개된 심층 분석 글 검수: --verify <키> | --verify all
    const k = arg('--verify'), all = (await allDeep()).filter((d) => liveDeep(d) && (k === 'all' || d.key === k));
    for (const d of all) await verifyLive(d.link);
  } else if (arg('--preview')) {
    // 올리기 전 화면 확인용: 사이트 CSS를 입힌 글 한 편 → data/deep/<키>.html
    const { previewHtml } = await import('./post.mjs'), key = arg('--preview'), out = join(ROOT, 'data/deep', `${key}.html`);
    await mkdir(join(ROOT, 'data/deep'), { recursive: true });
    await writeFile(out, await previewHtml([await render(key, { local: true })]));
    console.log('→', out);
  } else if (arg('--draft') || arg('--publish')) {
    const key = arg('--draft') || arg('--publish'), now = !!arg('--publish');
    const issues = await check(key);
    if (issues.length) { console.log(issues.join('\n')); process.exit(1); }
    const { upsert, uploadMedia } = await import('./wp.mjs');
    const post = await render(key), bad = leftovers(post.html);
    if (bad.length) { console.log(`올리기 전 검수 실패\n${bad.join('\n')}`); process.exit(1); }
    const img = join(ROOT, 'data/zip_views', `${key}.jpg`);
    post.featured = await uploadMedia(img, `deep-${key}.jpg`, `${post.title}`).catch(() => undefined);
    // 공개 시각(2026-10-30 사용자 결정): 첫 접수일 7일 전 06:00 예약, 그 시각이 지났으면 바로. 이미 공개된 글은 고쳐도 공개 그대로
    const d = await loadDeep(key), nos = Object.values(await folders()).find((n) => n.includes(key)) || [key];
    const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8').catch(() => '{"items":[]}'));
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const pl = now && d.status !== 'publish' ? planOf(items.filter((x) => nos.includes(x.no)).flatMap((x) => x.phases || []), today, { lead: 7, time: '06:00' }) : { mode: 'now', why: '이미 공개된 글' };
    if (now) console.log(`공개 계획: ${pl.mode === 'at' ? `${pl.at} 예약` : '바로'} · ${pl.why}`);
    const o = await upsert(post, now && pl.mode === 'at' ? pl.at : null, now && pl.mode === 'now');
    if (o.ok) await writeFile(join(DIR, `${key}.json`), JSON.stringify({ ...d, link: o.link, status: o.status, id: o.id, at: o.status === 'future' ? pl.at : undefined }, null, 1));
    console.log(`${o.ok ? '✓' : '✗'} ${o.status} ${o.link}${o.status === 'draft' || o.status === 'future' ? ` (미리보기 https://auleezip.com/?p=${o.id}&preview=true)` : ''}`);
    if (o.ok && o.status === 'publish') await verifyLive(o.link);
    if (o.ok && o.status === 'future') console.log(`게시 뒤 검수는 공개(${pl.at}) 뒤 매일 실행의 --verify all에서`);
  } else {
    for (const [folder, nos] of Object.entries(await folders())) {
      const prog = await readFile(join(BASE, folder, '진행상황.txt'), 'utf8').catch(() => '');
      const rep = await stat(join(BASE, folder, '종합리포트.html')).catch(() => null), d = await loadDeep(nos[0]);
      console.log(`${nos[0]} ${folder} · ${rep ? `리포트 ${new Date(rep.mtimeMs + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}` : (prog.match(/단계: (.+)/)?.[1] || '아직 시작 전')} · 글 ${d?.status || (d ? '자료만' : '없음')}`);
    }
  }
}
