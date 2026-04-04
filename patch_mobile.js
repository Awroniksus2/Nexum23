#!/usr/bin/env node
// node patch_mobile.js
// Робить 3 речі:
//  1. Додає мобільний CSS до nexum.html і dashboard.html
//  2. Додає Firebase SDK до dashboard.html
//  3. Замінює loadChatLog() — читає логи розмов прямо з Firestore
// ─────────────────────────────────────────────────────────────────

const fs = require('fs');

// ╔══════════════════════════════════════════════════════════════════╗
// ║  ВСТАВТЕ ВАШ FIREBASE CONFIG (один раз тут — і все працює)     ║
// ╚══════════════════════════════════════════════════════════════════╝
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ─── МОБІЛЬНИЙ CSS ДЛЯ nexum.html ────────────────────────────────
const NEXUM_CSS = `
/* ── MOBILE RESPONSIVE ── */
@media(max-width:900px){
  nav{padding:0 16px;height:56px;}
  .nav-logo{font-size:18px;}
  .theme-wrap{display:none;}
  .nav-logo svg{width:28px;height:28px;}
  .nav-right{gap:8px;}
  .btn-ghost,.btn-accent{padding:7px 14px;font-size:12px;}
  .hero{padding:80px 20px 48px;gap:36px;}
  h1{font-size:clamp(32px,8vw,48px);}
  .hero-desc{font-size:14px;max-width:100%;}
  .hero-btns{gap:8px;}
  .btn-big,.btn-big2{padding:12px 20px;font-size:13px;}
  .hero-nums{gap:24px;margin-top:32px;padding-top:28px;}
  .hn-v{font-size:22px;}
  .chat-mock{max-height:420px;}
  .sec-wrap{padding:64px 0;}
  .sec-in{padding:0 20px;}
  h2{font-size:clamp(26px,6vw,40px);}
  .ag{grid-template-columns:1fr 1fr;gap:10px;}
  .ac{padding:20px 16px;}
  .ac h3{font-size:14px;}
  .ac p{font-size:12px;}
  .hs-title{font-size:14px;}
  .hs-desc{font-size:12px;}
  .pc{padding:22px 18px;}
  .faq-a-inner{padding-left:20px;}
  .faq-q{padding:14px 16px;}
  .faq-q-text{font-size:13.5px;}
  .reg-left{order:2;}
  .form-card{order:1;}
  .fc-body{padding:20px 18px;}
}
@media(max-width:600px){
  nav{padding:0 14px;}
  .nav-links{display:none;}
  .theme-wrap{display:none;}
  .nav-logo{font-size:17px;}
  .nav-logo svg{display:none;}
  .lang-btn{padding:4px 8px;font-size:10.5px;}
  .theme-icon{font-size:12px;}
  .theme-toggle{width:36px;height:20px;}
  .theme-toggle::before{width:13px;height:13px;}
  body.light .theme-toggle::before{transform:translateX(16px);}
  .btn-ghost{padding:6px 10px;font-size:11.5px;}
  .hero{padding:72px 14px 40px;gap:28px;}
  h1{font-size:clamp(28px,9vw,40px);}
  .hero-desc{font-size:13.5px;}
  .btn-big,.btn-big2{padding:11px 16px;font-size:13px;border-radius:10px;}
  .hero-btns{flex-direction:column;}
  .hero-btns .btn-big,.hero-btns .btn-big2{width:100%;}
  .hero-nums{flex-wrap:wrap;gap:18px;}
  .hn-v{font-size:20px;}
  .hn-l{font-size:10px;}
  .chat-mock{max-height:360px;}
  .bub-b,.bub-u{font-size:12px;}
  .bub-opt{font-size:11px;padding:6px 12px;}
  .scale-btn{width:28px;height:28px;font-size:11px;}
  .sec-wrap{padding:48px 0;}
  .sec-in{padding:0 14px;}
  h2{font-size:clamp(24px,7.5vw,34px);}
  .ag{grid-template-columns:1fr;}
  .ac{padding:18px 14px;}
  .how-steps,.how-flow{padding:22px 16px;}
  .hs{gap:12px;}
  .pc{padding:18px 16px;}
  .pc-name{font-size:17px;}
  .faq-stats{flex-direction:column;}
  .faq-stat{border-right:none;border-bottom:1px solid var(--border);}
  .faq-stat:last-child{border-bottom:none;}
  .faq-steps{flex-direction:column;}
  .fsm-arr{transform:rotate(90deg);}
  .ir{grid-template-columns:1fr;}
  .fc-tabs{flex-wrap:wrap;}
  .fc-tab{font-size:12px;padding:11px 8px;}
  footer div{flex-direction:column;gap:6px;text-align:center;}
}
`;

// ─── МОБІЛЬНИЙ CSS ДЛЯ dashboard.html ────────────────────────────
const DASH_CSS = `
/* ── DASHBOARD MOBILE RESPONSIVE ── */
@media(max-width:900px){
  .dp-nav{padding:0 14px;height:52px;gap:8px;}
  .dp-logo{font-size:15px;}
  .dp-sep{display:none;}
  .dp-tabs{gap:2px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .dp-tabs::-webkit-scrollbar{display:none;}
  .dp-tab{padding:6px 10px;font-size:12px;white-space:nowrap;flex-shrink:0;}
  .dp-user{gap:6px;}
  #navName{display:none;}
  .logout-btn{padding:4px 8px;font-size:11px;}
  .lang-btn{padding:3px 6px;font-size:10px;}
  .theme-icon{font-size:12px;}
  .theme-toggle{width:34px;height:19px;}
  .theme-toggle::before{width:13px;height:13px;}
  body.light .theme-toggle::before{transform:translateX(15px);}
  .dp-content{padding:16px 14px;}
  .pat-header{flex-direction:column;align-items:flex-start;gap:12px;}
  .pat-search-wrap{width:100%;flex-wrap:wrap;}
  .search-inp{width:100%;min-width:0;}
  .stats-grid{grid-template-columns:repeat(2,1fr);}
  .pat-card{padding:14px 14px;gap:12px;}
  .pat-av{width:38px;height:38px;font-size:12px;}
  .pat-name{font-size:13px;}
  .pat-diag{font-size:11.5px;}
  .pat-meta{gap:10px;}
  .pm{font-size:10px;}
  .anam-layout{grid-template-columns:1fr;}
  .pd-grid{grid-template-columns:1fr;}
  .pd-header{flex-direction:column;gap:14px;}
  .anam-hero{flex-wrap:wrap;gap:14px;}
  .anam-hero-actions{flex-wrap:wrap;gap:6px;width:100%;}
  .anam-hero-actions .btn-ghost,.anam-hero-actions .btn-danger{flex:1;text-align:center;justify-content:center;}
  .con-layout{grid-template-columns:1fr;height:auto;gap:12px;}
  .con-list{max-height:280px;}
  .add-type-grid{grid-template-columns:repeat(3,1fr);}
  .mode-toggle-wrap{width:100%;}
  .mode-toggle-btn{flex:1;justify-content:center;font-size:11.5px;padding:7px 8px;}
  #dt2>div:first-child{flex-direction:column;gap:12px;align-items:flex-start;}
  #dt2>div:first-child>div:last-child{width:100%;flex-wrap:wrap;}
  .survey-select-wrap{width:100%;}
  .survey-name-display{width:100%;}
  #dt3>div:last-child{grid-template-columns:1fr;}
  .ai-prompt-wrap{flex-direction:column;}
  .ai-gen-btn{width:100%;justify-content:center;}
  .ai-count-row{flex-wrap:wrap;gap:8px;}
  .ai-result-header{flex-direction:column;gap:10px;}
  .ai-result-header>div{display:flex;gap:8px;width:100%;}
  .ai-add-all-btn,.ai-add-sel-btn{flex:1;text-align:center;}
}
@media(max-width:600px){
  .dp-nav{padding:0 10px;height:50px;}
  .dp-logo{font-size:14px;}
  .theme-icon{display:none;}
  .theme-toggle{display:none;}
  .dp-tab span{font-size:0;}
  .dp-tab{padding:6px 10px;font-size:18px;}
  .dp-av{width:26px;height:26px;font-size:10px;}
  .logout-btn{font-size:10px;padding:3px 6px;}
  .dp-content{padding:12px 10px;}
  .stats-grid{grid-template-columns:repeat(2,1fr);gap:8px;}
  .sc-val{font-size:22px;}
  .sc-lbl{font-size:10px;}
  .stat-card{padding:14px 12px;}
  .pat-card{padding:12px 12px;gap:10px;}
  .pat-right .pat-score{font-size:16px;}
  .anam-breadcrumb{font-size:11px;flex-wrap:wrap;gap:4px;}
  .anam-hero{padding:16px 14px;}
  .anam-hero-meta h2{font-size:16px;}
  .anam-sec-hd{padding:11px 14px;}
  .anam-sec-bd{padding:12px 14px;}
  .anam-row{grid-template-columns:110px 1fr;gap:6px 8px;padding:7px 0;}
  .anam-lbl{font-size:10px;}
  .anam-val{font-size:12px;}
  .con-list{max-height:220px;}
  .add-type-grid{grid-template-columns:repeat(2,1fr);}
  .at-btn{padding:7px 8px;font-size:11px;}
  .ed-inp,.ed-textarea{font-size:13px;padding:10px 12px;}
  .modal-overlay{align-items:flex-end;}
  .modal-box{padding:20px 16px;border-radius:20px 20px 0 0;margin:0;max-width:100%;width:100%;max-height:90vh;}
  .modal-box.wide{border-radius:20px 20px 0 0;max-width:100%;}
  .modal-title{font-size:16px;}
  .modal-row{grid-template-columns:1fr;}
  .modal-btns{flex-direction:column;}
  .modal-cancel,.modal-confirm{width:100%;}
  .modal-inp{font-size:13px;padding:10px 12px;}
  .remind-opt{padding:12px 14px;}
  .remind-opt-title{font-size:12px;}
  .remind-opt-desc{font-size:11px;}
  .ai-input-area,.ai-results-area{padding:16px 14px;border-radius:12px;}
  .ai-prompt-inp{font-size:13px;padding:10px 12px;}
  .ai-q-card{padding:12px 12px;}
  .ai-q-text{font-size:13px;}
  .ai-chip{font-size:11px;padding:4px 10px;}
  .apt-card{padding:12px 12px;}
}
`;

// ─── FIREBASE SDK + CONFIG (вставляється в dashboard.html) ────────
const FIREBASE_HEAD = `
  <!-- ══ FIREBASE SDK ══ -->
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"><\/script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"><\/script>
  <script>
    const firebaseConfig = ${JSON.stringify(FIREBASE_CONFIG, null, 4)};
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
  <\/script>
`;

// ─── НОВА loadChatLog() — читає з Firestore ────────────────────────
const NEW_LOAD_CHATLOG = `async function loadChatLog(patId){
  var el      = document.getElementById('pd-chatlog');
  var countEl = document.getElementById('pd-chatlog-count');
  if (!el || !patId) return;
  el.dataset.loaded = '1';
  el.innerHTML = '<div class="cl-loading">⏳ Завантаження логів...</div>';

  var p = patients.find(function(x){ return x.id === patId; });
  if (!p) { el.innerHTML = '<div class="cl-empty">Пацієнта не знайдено</div>'; return; }

  try {
    var fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
    var phone    = (p.phone || '').replace(/\\s/g, '');
    var snaps    = [];

    // 1. Шукаємо за телефоном
    if (phone) {
      var qPhone = await db.collection('patients')
        .where('phone', '==', phone)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      qPhone.forEach(function(doc){ snaps.push({ id: doc.id, ...doc.data() }); });
    }

    // 2. Шукаємо за іменем
    if (!snaps.length && fullName) {
      var qName = await db.collection('patients')
        .where('name', '==', fullName)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      qName.forEach(function(doc){ snaps.push({ id: doc.id, ...doc.data() }); });
    }

    // 3. Якщо нічого — беремо останні 50 і фільтруємо локально
    if (!snaps.length) {
      var qAll = await db.collection('patients')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      qAll.forEach(function(doc){
        var d = doc.data();
        var nameMatch = p.firstName && 
          d.name && d.name.toLowerCase().includes(p.firstName.toLowerCase());
        var phoneMatch = phone && d.phone &&
          d.phone.replace(/\\s/g,'').includes(phone.slice(-7));
        if (nameMatch || phoneMatch) snaps.push({ id: doc.id, ...d });
      });
    }

    if (!snaps.length) {
      el.innerHTML =
        '<div class="cl-empty"><div style="font-size:26px;margin-bottom:8px">💬</div>' +
        '<p style="font-size:13px;color:var(--muted)">Логів розмов ще немає.<br>' +
        '<span style="font-size:12px">Зʼявляться після першого опитування через бота.</span></p></div>';
      return;
    }

    if (countEl) countEl.textContent = snaps.length + ' ' + declSess(snaps.length);

    var html2 = '';
    for (var si = 0; si < snaps.length; si++) {
      var sess = snaps[si];

      // Дата
      var dateVal = sess.createdAt;
      var dateStr = 'Сесія ' + (si + 1);
      if (dateVal && dateVal.toDate) {
        dateStr = dateVal.toDate().toLocaleString('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      } else if (dateVal) {
        dateStr = new Date(dateVal).toLocaleString('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      }

      // Повідомлення
      var history = sess.chatHistory || [];
      var SKIP = ['Почни опитування','Start the survey'];
      var msgs = history.filter(function(m){ return m.role !== 'system' && !SKIP.includes(m.content); });

      var msgHtml = '';
      for (var mi = 0; mi < msgs.length; mi++) {
        var m = msgs[mi];
        var isBot = m.role === 'assistant';
        var txt = (m.content || '');
        ['---ПІДСУМОК---','---SUMMARY---','ОПИТУВАННЯ_ЗАВЕРШЕНО','SURVEY_COMPLETE'].forEach(function(mk){
          var idx = txt.indexOf(mk); if (idx > -1) txt = txt.substring(0, idx);
        });
        txt = txt.trim(); if (!txt) continue;
        var side = isBot ? 'bot' : 'user';
        msgHtml +=
          '<div class="cl-msg cl-msg-' + side + '">' +
          '<div class="cl-av cl-av-' + side + '">' + (isBot ? '🤖' : '👤') + '</div>' +
          '<div class="cl-bubble cl-bubble-' + side + '">' + txt.split('\\n').join('<br>') + '</div>' +
          '</div>';
      }

      // Підсумок
      var sumHtml = '';
      var rawSum = sess.summary || '';
      if (!rawSum) {
        var lastBot = msgs.slice().reverse().find(function(m){ return m.role==='assistant'; });
        if (lastBot && lastBot.content && lastBot.content.indexOf('---ПІДСУМОК---') > -1) rawSum = lastBot.content;
      }
      if (rawSum) {
        var ai1 = rawSum.indexOf('---ПІДСУМОК---');
        var extracted = ai1 > -1
          ? rawSum.substring(ai1 + 14, rawSum.indexOf('---КІНЕЦЬ---') > -1 ? rawSum.indexOf('---КІНЕЦЬ---') : undefined)
          : rawSum;
        extracted = extracted.replace(/SURVEY_COMPLETE/g,'').replace(/ОПИТУВАННЯ_ЗАВЕРШЕНО/g,'').trim();
        if (extracted) {
          sumHtml = '<div class="cl-summary-block"><strong>📋 Підсумок AI</strong>' +
            extracted.split('\\n').join('<br>') + '</div>';
        }
      }

      html2 +=
        '<div class="cl-session">' +
        '<div class="cl-session-hd" onclick="clToggle(this)">' +
        '<span>💬</span><span class="cl-session-date">📅 ' + dateStr + '</span>' +
        '<span class="cl-session-badge">' + msgs.length + ' повідомлень</span>' +
        '</div><div class="cl-messages">' + msgHtml + sumHtml + '</div></div>';
    }
    el.innerHTML = html2 || '<div class="cl-empty">Повідомлень не знайдено</div>';

  } catch(e) {
    console.error('[chatlog]', e);
    el.innerHTML =
      '<div class="cl-empty" style="color:var(--muted);font-size:13px">⚠️ ' + e.message + '<br>' +
      '<span style="font-size:11px;opacity:.7">Перевірте Firebase config та Firestore Rules</span></div>';
  }
}`;

// ══════════════════════════════════════════════════════════════════
// ФУНКЦІЇ ПАТЧУ
// ══════════════════════════════════════════════════════════════════

function patchCSS(file, css) {
  let html = fs.readFileSync(file, 'utf8');
  const idx = html.lastIndexOf('</style>');
  if (idx === -1) { console.log('⚠️  No </style> in ' + file); return; }
  html = html.slice(0, idx) + css + '\n</style>' + html.slice(idx + 8);
  fs.writeFileSync(file, html);
  console.log('✅  CSS додано: ' + file);
}

function patchDashboardFirebase(file) {
  let html = fs.readFileSync(file, 'utf8');

  // 1. Firebase SDK
  if (html.includes('firebase-app-compat')) {
    console.log('ℹ️   Firebase SDK вже є в ' + file);
  } else {
    html = html.replace('</head>', FIREBASE_HEAD + '</head>');
    console.log('✅  Firebase SDK додано: ' + file);
  }

  // 2. Замінюємо loadChatLog()
  const funcStart = html.indexOf('async function loadChatLog(');
  if (funcStart === -1) { console.error('❌  loadChatLog() не знайдено'); fs.writeFileSync(file, html); return; }

  let depth = 0, i = funcStart, started = false;
  while (i < html.length) {
    if (html[i] === '{') { depth++; started = true; }
    if (html[i] === '}') depth--;
    if (started && depth === 0) { i++; break; }
    i++;
  }

  html = html.slice(0, funcStart) + NEW_LOAD_CHATLOG + html.slice(i);
  fs.writeFileSync(file, html);
  console.log('✅  loadChatLog() оновлено: ' + file);
}

// ══════════════════════════════════════════════════════════════════
// ЗАПУСК
// ══════════════════════════════════════════════════════════════════

if (fs.existsSync('nexum.html')) {
  patchCSS('nexum.html', NEXUM_CSS);
} else {
  console.log('⚠️  nexum.html не знайдено — пропускаємо');
}

if (fs.existsSync('dashboard.html')) {
  patchCSS('dashboard.html', DASH_CSS);
  patchDashboardFirebase('dashboard.html');
} else {
  console.log('⚠️  dashboard.html не знайдено — пропускаємо');
}

console.log('\n🎉  Готово!');
console.log('─────────────────────────────────────────────────────────');
console.log('Не забудьте: вставте реальні значення у FIREBASE_CONFIG');
console.log('(на початку цього файлу) і запустіть ще раз.');
console.log('─────────────────────────────────────────────────────────');
