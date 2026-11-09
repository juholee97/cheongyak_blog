// unslop 다듬기 안(2026-11-10). 아직 블로그에 적용하지 않은 미리보기용 — 승인되면 skin/style.css에 합친다.
// 각 단계의 규칙은 `$` 자리에 단계 접두어가 들어간다(영상: `.s1 `, 미리보기: 빈 문자열).
export const STEPS = [
  {
    name: 'Spacing 간격·정렬',
    css: `
@media (min-width: 900px) { $.hero > .hero-inner:first-child { align-items: center; } }
$.hero-main { gap: 16px; }
$.hero-stats { gap: 24px; margin-top: 8px; }
$.hero-cta { margin-top: 8px; padding: 12px 20px; }
$.hero-list-wrap { gap: 16px; }
$[data-hero=list] { gap: 16px; }
$.util .inner { padding-top: 8px; padding-bottom: 8px; }
`,
  },
  {
    name: 'Type 작은 글자 자간',
    css: `
$body { letter-spacing: 0; }
`,
  },
  {
    name: 'Details 모서리·그림자',
    css: `
$.hero-cta { border-radius: 10px; }
$.tile { border-radius: 12px; }
$.cal-card, $.day-card { border-radius: 12px; overflow: hidden; }
$.filter { border-radius: 12px; }
$.side-box { border-radius: 12px; overflow: hidden; }
$.tags a, $.post-tags a, $.todo-tip { border-radius: 6px; }
$.paging a, $.paging .selected, $.gu-toggle, $.modal-close { border-radius: 8px; }
@media (min-width: 701px) { $.modal { border-radius: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12); } }
$.cy-remote { box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
`,
  },
];
export const flat = () => STEPS.map((s) => s.css.replace(/\$/g, '')).join('\n');
export const story = () => STEPS.map((s, i) => s.css.replace(/\$/g, `.s${i + 1} `)).join('\n');
