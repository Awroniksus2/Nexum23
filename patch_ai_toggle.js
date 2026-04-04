#!/usr/bin/env node
// node patch_ai_toggle.js
// Додає тумблер AI ON/OFF в навбар дашборду

const fs = require('fs');
const FILE = 'dashboard.html';
if (!fs.existsSync(FILE)) { console.error('❌ dashboard.html не знайдено в поточній папці'); process.exit(1); }

let html = fs.readFileSync(FILE, 'utf8');

// ─── 1. CSS ───────────────────────────────────────────────────────────────────
const CSS = `
/* ══ AI MODE TOGGLE ══ */
.aimt-wrap{display:flex;align-items:center;gap:6px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:5px 10px;cursor:pointer;transition:.2s;user-select:none;flex-shrink:0;}
.aimt-wrap:hover{border-color:var(--accent);}
.aimt-wrap.on{border-color:#8b5cf6;background:#8b5cf60a;}
.aimt-wrap.off{border-color:#f59e0b;background:#f59e0b0a;}
.aimt-tog{width:34px;height:19px;border-radius:10px;position:relative;transition:background .25s;flex-shrink:0;}
.aimt-th{position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;top:3px;transition:left .25s;box-shadow:0 1px 3px #0004;}
.aimt-lbl{font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;white-space:nowrap;}
.aimt-badge{font-size:9px;padding:1px 6px;border-radius:20px;font-family:'JetBrains Mono',monospace;font-weight:700;border:1px solid;}
.aimt-badge.on{background:#8b5cf620;color:#a78bfa;border-color:#8b5cf640;}
.aimt-badge.off{background:#f59e0b20;color:#fbbf24;border-color:#f59e0b40;}
.ai-banner{border-radius:10px;padding:11px 16px;margin-bottom:14px;font-size:12.5px;border:1px solid;display:flex;align-items:center;gap:10px;}
.ai-banner.on{background:#8b5cf608;border-color:#8b5cf630;color:#a78bfa;}
.ai-banner.off{background:#f59e0b08;border-color:#f59e0b30;color:#fbbf24;}
.ai-banner-body{flex:1;}
.ai-banner-title{font-weight:600;font-size:13px;display:block;margin-bottom:2px;}
.ai-banner-sub{font-size:11.5px;opacity:.8;line-height:1.5;}
`;

const cssEnd = html.lastIndexOf('</style>');
if (cssEnd === -1) { console.error('❌ </style> не знайдено'); process.exit(1); }
html = html.slice(0, cssEnd) + CSS + '\n</style>' + html.slice(cssEnd + 8);
console.log('✅ CSS додано');

// ─── 2. Тумблер у nav — вставляємо ПЕРЕД logout-btn ─────────────────────────
const TOGGLE_HTML = `<div class="aimt-wrap on" id="aimtWrap" onclick="toggleAiMode()" title="Перемкнути режим AI">
      <div class="aimt-tog" id="aimtTog" style="background:#8b5cf6"><div class="aimt-th" id="aimtTh" style="left:18px"></div></div>
      <span class="aimt-lbl" id="aimtLbl">🤖 AI</span>
      <span class="aimt-badge on" id="aimtBadge">ON</span>
    </div>
    `;

const logoutMarker = '<button class="logout-btn"';
const logoutIdx = html.indexOf(logoutMarker);
if (logoutIdx === -1) { console.error('❌ logout-btn не знайдено'); process.exit(1); }
html = html.slice(0, logoutIdx) + TOGGLE_HTML + html.slice(logoutIdx);
console.log('✅ Тумблер у навбар додано (перед кнопкою Вийти)');

// ─── 3. Банер у вкладці Конструктор ─────────────────────────────────────────
const BANNER_HTML = `<!-- AI MODE BANNER -->
      <div class="ai-banner on" id="aiBanner">
        <span id="aiBannerIcon" style="font-size:18px;flex-shrink:0">🤖</span>
        <div class="ai-banner-body">
          <span class="ai-banner-title" id="aiBannerTitle">Режим AI увімкнено</span>
          <span class="ai-banner-sub" id="aiBannerSub">Бот задає адаптивні питання. Питання конструктора використовуються як підказки для AI.</span>
        </div>
      </div>
      `;

const builderMarker = '<div id="builderPanel">';
const builderIdx = html.indexOf(builderMarker);
if (builderIdx === -1) {
  console.log('⚠️  builderPanel не знайдено — банер пропущено');
} else {
  html = html.slice(0, builderIdx) + BANNER_HTML + html.slice(builderIdx);
  console.log('✅ Банер у конструктор додано');
}

// ─── 4. JavaScript ───────────────────────────────────────────────────────────
const JS = `
// ── AI MODE TOGGLE ──────────────────────────────────────────────────────────
let _aiMode = localStorage.getItem('nexum_aiMode') !== 'false';

function toggleAiMode() {
  _aiMode = !_aiMode;
  localStorage.setItem('nexum_aiMode', _aiMode);
  _applyAiModeUI();
  apiFetch('/api/settings', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ doctorCode: doctorCode(), aiMode: _aiMode })
  }).catch(()=>{});
  showToast(_aiMode
    ? (currentLang==='en' ? '🤖 AI mode ON' : '🤖 Режим AI увімкнено')
    : (currentLang==='en' ? '📋 Survey-only mode ON' : '📋 Режим конструктора увімкнено')
  );
}

function _applyAiModeUI() {
  const wrap  = document.getElementById('aimtWrap');
  const tog   = document.getElementById('aimtTog');
  const th    = document.getElementById('aimtTh');
  const lbl   = document.getElementById('aimtLbl');
  const badge = document.getElementById('aimtBadge');
  const banner = document.getElementById('aiBanner');
  const bTitle = document.getElementById('aiBannerTitle');
  const bSub   = document.getElementById('aiBannerSub');
  const bIcon  = document.getElementById('aiBannerIcon');
  const en = currentLang === 'en';

  if (_aiMode) {
    if(wrap)  { wrap.className='aimt-wrap on'; wrap.title=en?'AI mode ON — click to disable':'Режим AI увімкнено — натисніть щоб вимкнути'; }
    if(tog)   tog.style.background='#8b5cf6';
    if(th)    th.style.left='18px';
    if(lbl)   lbl.textContent='🤖 AI';
    if(badge) { badge.textContent='ON'; badge.className='aimt-badge on'; }
    if(banner){ banner.className='ai-banner on'; }
    if(bIcon) bIcon.textContent='🤖';
    if(bTitle)bTitle.textContent=en?'AI mode enabled':'Режим AI увімкнено';
    if(bSub)  bSub.textContent=en
      ?'Bot asks adaptive questions. Constructor questions are used as hints for the AI.'
      :'Бот задає адаптивні питання. Питання конструктора використовуються як підказки для AI.';
  } else {
    if(wrap)  { wrap.className='aimt-wrap off'; wrap.title=en?'Survey-only mode — click to enable AI':'Режим конструктора — натисніть щоб увімкнути AI'; }
    if(tog)   tog.style.background='#f59e0b';
    if(th)    th.style.left='3px';
    if(lbl)   lbl.textContent='📋 Survey';
    if(badge) { badge.textContent='OFF'; badge.className='aimt-badge off'; }
    if(banner){ banner.className='ai-banner off'; }
    if(bIcon) bIcon.textContent='📋';
    if(bTitle)bTitle.textContent=en?'Survey-only mode':'Режим конструктора (без AI)';
    if(bSub)  bSub.textContent=en
      ?'Bot will ask ONLY questions from your constructor — in exact order. No AI adaptation.'
      :'Бот задаватиме ЛИШЕ питання з вашого конструктора — в точному порядку. Без AI-адаптації.';
  }
}
`;

const initIdx = html.lastIndexOf('if(checkAuth())');
if (initIdx === -1) { console.error('❌ checkAuth() не знайдено'); process.exit(1); }
html = html.slice(0, initIdx) + JS + '\n' + html.slice(initIdx);
console.log('✅ JS додано');

// ─── 5. _applyAiModeUI() в init ─────────────────────────────────────────────
// Find loadSurveys(); and add _applyAiModeUI() after it (inside the if block)
const surveyCall = 'loadSurveys();';
const surveyIdx = html.lastIndexOf(surveyCall);
if (surveyIdx !== -1 && !html.includes('_applyAiModeUI()')) {
  html = html.slice(0, surveyIdx + surveyCall.length) + '\n  _applyAiModeUI();' + html.slice(surveyIdx + surveyCall.length);
  console.log('✅ _applyAiModeUI() додано в init');
}

// ─── 6. chatHistory fallback ─────────────────────────────────────────────────
const OLD_M = "const msgs = Array.isArray(s.messages) ? s.messages : [];";
const NEW_M = "const msgs = Array.isArray(s.messages) ? s.messages : (Array.isArray(s.chatHistory) ? s.chatHistory : []);";
if (html.includes(OLD_M)) {
  html = html.replace(OLD_M, NEW_M);
  console.log('✅ chatHistory fallback виправлено');
} else if (html.includes(NEW_M)) {
  console.log('ℹ️   chatHistory fallback вже є');
}

fs.writeFileSync(FILE, html);
console.log('\n🎉 Готово! Тумблер з\'явиться ПЕРЕД кнопкою "Вийти" у навбарі');
