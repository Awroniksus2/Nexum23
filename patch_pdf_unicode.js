#!/usr/bin/env node
// Run: node patch_pdf_unicode.js [path/to/dashboard.html]
// Replaces the PDF generator script in dashboard.html
// Uses pdf-lib + fontkit + Noto Sans TTF — full Ukrainian Cyrillic support

const fs = require('fs');
const FILE = process.argv[2] || 'dashboard.html';

if (!fs.existsSync(FILE)) {
  console.error('❌ File not found: ' + FILE);
  console.error('   Usage: node patch_pdf_unicode.js [path/to/dashboard.html]');
  process.exit(1);
}

let html = fs.readFileSync(FILE, 'utf8');

// ── Locate the old PDF <script> block ────────────────────────────
// Find the comment marker OR the pdf-lib script tag
let blockStart = html.indexOf('<!-- ── NEXUM PDF GENERATOR');
if (blockStart === -1) {
  // Try finding by pdf-lib script tag
  const pdfLibIdx = html.indexOf('unpkg.com/pdf-lib');
  if (pdfLibIdx === -1) {
    console.error('❌ Cannot find pdf-lib script in file.');
    process.exit(1);
  }
  blockStart = html.lastIndexOf('<script', pdfLibIdx);
  // Check if there's a comment before it
  const commentBefore = html.lastIndexOf('<!--', blockStart);
  if (commentBefore !== -1 && commentBefore > blockStart - 100) {
    blockStart = commentBefore;
  }
}

// Find end: last </script> before </body>
const bodyIdx = html.lastIndexOf('</body>');
if (bodyIdx === -1) {
  console.error('❌ Cannot find </body> in file.');
  process.exit(1);
}
const scriptEnd = html.lastIndexOf('</script>', bodyIdx) + '</script>'.length;

const before = html.slice(0, blockStart);
const after  = html.slice(scriptEnd);

// ── New PDF script block with Noto Sans (full Cyrillic) ──────────
const NEW_BLOCK = `<!-- ── NEXUM PDF GENERATOR (Unicode / Cyrillic) ── -->
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>
<script>
// Noto Sans TTF — full Cyrillic + Latin support
const _FONT_REG  = 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRASf6M7Q.ttf';
const _FONT_BOLD = 'https://fonts.gstatic.com/s/notosans/v36/o-0NIpQlx3QUlC5A4PNjXhFVadyBx2pqPIif.ttf';
const _fontCache = {};

async function _fetchFont(url) {
  if (_fontCache[url]) return _fontCache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error('Font fetch failed (' + r.status + '): ' + url);
  _fontCache[url] = await r.arrayBuffer();
  return _fontCache[url];
}

async function downloadPatientPDF(patId) {
  const p = patients.find(x => x.id === patId);
  if (!p) return;
  let pdfBtn = null;
  document.querySelectorAll('.anam-hero-actions button').forEach(b => {
    if (b.textContent.includes('PDF')) pdfBtn = b;
  });
  if (pdfBtn) { pdfBtn.textContent = '⏳'; pdfBtn.disabled = true; }
  try {
    const bytes = await _buildPDF(p);
    const blob  = new Blob([bytes], { type: 'application/pdf' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const name  = [p.lastName, p.firstName].filter(Boolean).join('_') || 'patient';
    const date  = new Date().toLocaleDateString('uk-UA').replace(/\\./g, '-');
    a.href = url; a.download = 'Nexum_' + name + '_' + date + '.pdf';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('PDF завантажено ✓');
  } catch(e) {
    console.error('[nexum-pdf]', e);
    showToast('Помилка PDF: ' + e.message, 'error');
  } finally {
    if (pdfBtn) { pdfBtn.textContent = '📄 PDF'; pdfBtn.disabled = false; }
  }
}

async function _buildPDF(p) {
  const { PDFDocument, rgb } = PDFLib;

  // Load Noto Sans with full Cyrillic support
  const [regBuf, boldBuf] = await Promise.all([
    _fetchFont(_FONT_REG),
    _fetchFont(_FONT_BOLD)
  ]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fr = await doc.embedFont(regBuf);
  const fb = await doc.embedFont(boldBuf);

  const page = doc.addPage([595, 842]);
  const W=595, H=842, M=28, IW=W-M*2;
  const C = {
    dark:   rgb(.05,.07,.10),
    accent: rgb(.12,.64,.85),
    white:  rgb(1,1,1),
    gray:   rgb(.40,.40,.40),
    lgray:  rgb(.65,.65,.65),
    border: rgb(.88,.88,.88),
    bgRow:  rgb(.99,.99,.99),
    labBg:  rgb(.93,.94,.96),
  };

  const isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
  const fullName   = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
  const doctorName = sessionStorage.getItem('nexum_name') || sessionStorage.getItem('nexum_auth') || '';
  const now        = new Date();
  const dateStr    = now.toLocaleDateString('uk-UA', {day:'2-digit',month:'2-digit',year:'numeric'})
                   + ', ' + now.toLocaleTimeString('uk-UA', {hour:'2-digit',minute:'2-digit'});

  const L = isEn ? {
    subtitle:'Medical assistant', title:'PATIENT ANAMNESIS', dateLabel:'Date: ',
    doctor:'DOCTOR', patient:'PATIENT',
    sec1:'MAIN COMPLAINT',
    fComplaint:'Complaint', fOnset:'Symptom onset', fDynamics:'Dynamics', fSymptoms:'Associated symptoms',
    fPain:'Pain intensity', noPain:'No pain', unbearable:'Unbearable',
    sec2:'MEDICAL HISTORY',
    fChronic:'Chronic conditions', fAllergies:'Allergies', fMeds:'Medications',
    sec3:'FOR DOCTOR  (filled by doctor)',
    fDiagnosis:'Preliminary diagnosis', fPrescription:'Prescriptions & recommendations',
    fNext:'Next appointment', fSickLeave:'Sick leave',
    sigPat:'Patient signature:', sigDoc:'Doctor signature:',
    consent:'CONSENT: Patient confirms accuracy of information and consents to its processing.',
    footer:'Document generated automatically by Nexum AI. Doctor may make corrections before signing.'
  } : {
    subtitle:'Медичний асистент', title:'АНАМНЕЗ ПАЦІЄНТА', dateLabel:'Дата: ',
    doctor:'ЛІКАР', patient:'ПАЦІЄНТ',
    sec1:'ОСНОВНА СКАРГА',
    fComplaint:'Скарга', fOnset:'Початок симптомів', fDynamics:'Динаміка стану', fSymptoms:'Супутні симптоми',
    fPain:'Інтенсивність болю', noPain:'Немає болю', unbearable:'Нестерпно',
    sec2:'АНАМНЕЗ ЖИТТЯ',
    fChronic:'Хронічні захворювання', fAllergies:'Алергії та непереносимість', fMeds:'Поточні медикаменти',
    sec3:'ДЛЯ ЛІКАРЯ  (заповнює лікар)',
    fDiagnosis:'Попередній діагноз', fPrescription:'Призначення та рекомендації',
    fNext:'Наступний прийом', fSickLeave:'Лікарняний лист',
    sigPat:'Підпис пацієнта:', sigDoc:'Підпис лікаря:',
    consent:'ЗГОДА: Підписуючи документ, пацієнт підтверджує достовірність наданої інформації та надає згоду на її обробку.',
    footer:'Документ сформовано автоматично системою Nexum AI. Лікар може внести корективи перед підписанням.'
  };

  // Parse last chat session summary
  let parsed = {};
  const sessions = Array.isArray(p.chatSessions) ? p.chatSessions : [];
  if (sessions.length) {
    const last = [...sessions].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    (last.summary || '').split('\\n').forEach(line => {
      const m = line.match(/^([^:]+):\\s*(.+)$/);
      if (m) parsed[m[1].trim().toLowerCase()] = m[2].trim();
    });
  }
  const g = (uk, en) => parsed[(isEn && en ? en : uk).toLowerCase()] || parsed[uk.toLowerCase()] || '';

  const complaint   = g('скарга','complaint')   || p.diag || '—';
  const onset       = g('початок','onset')       || '—';
  const dynamics    = g('динаміка','dynamics')   || (p.notes ? p.notes.split('.')[0] : '—');
  const symptoms    = g('симптоми','symptoms')   || '—';
  const painRaw     = g('інтенсивність болю','pain intensity') || g('інтенсивність','intensity') || '0';
  const chronic_val = g('хронічні хвороби','chronic conditions') || (p.chronic && p.chronic.length ? p.chronic.join(', ') : 'Ні');
  const allergy_val = g('алергії','allergies')   || (p.allergy && p.allergy.length ? p.allergy.join(', ') : 'Ні');
  const meds_val    = g('медикаменти','medications') || (p.meds && p.meds.length ? p.meds.join(', ') : 'Ні');
  const nv = Math.min(parseInt((String(painRaw).match(/\\d+/) || ['0'])[0]) || 0, 10);

  let y = H - 86;
  const S = s => String(s || '');

  function wrapText(text, font, size, maxW) {
    const words = S(text).split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      try {
        if (font.widthOfTextAtSize(t, size) > maxW && line) { lines.push(line); line = w; }
        else line = t;
      } catch(e) { line = t; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function dt(text, x, yy, font, size, color) {
    try { page.drawText(S(text), {x, y: yy, font, size, color}); }
    catch(e) { console.warn('[pdf] drawText error:', e.message, text); }
  }

  // ── HEADER ──
  page.drawRectangle({x:0, y:H-72, width:W, height:72, color:C.dark});
  page.drawRectangle({x:M, y:H-60, width:4, height:36, color:C.accent});
  dt('NEXUM', M+12, H-36, fb, 20, C.white);
  dt(L.subtitle, M+12, H-52, fr, 8, C.lgray);
  dt(L.title, W-M-170, H-28, fb, 9, C.accent);
  dt(L.dateLabel + dateStr, W-M-170, H-42, fr, 8, C.lgray);
  dt('RPT-' + Date.now().toString().slice(-6), W-M-170, H-55, fr, 7, C.lgray);

  // ── DOCTOR + PATIENT CARDS ──
  const cW = (IW - 10) / 2, cH = 56;
  page.drawRectangle({x:M, y:y-cH, width:cW, height:cH, color:rgb(.97,.97,.97)});
  page.drawRectangle({x:M, y:y-2, width:cW, height:2, color:C.accent});
  dt(L.doctor, M+10, y-14, fb, 7, C.accent);
  dt(S(doctorName).slice(0,40), M+10, y-26, fb, 9, C.dark);
  const px = M + cW + 10;
  page.drawRectangle({x:px, y:y-cH, width:cW, height:cH, color:rgb(.97,.97,.97)});
  page.drawRectangle({x:px, y:y-2, width:cW, height:2, color:C.accent});
  dt(L.patient, px+10, y-14, fb, 7, C.accent);
  dt(S(fullName).slice(0,40), px+10, y-26, fb, 9, C.dark);
  dt(L.dateLabel + dateStr.split(',')[0], px+10, y-38, fr, 8, C.gray);
  y -= cH + 14;

  function section(title) {
    y -= 6;
    page.drawRectangle({x:M, y:y-20, width:IW, height:22, color:C.dark});
    page.drawRectangle({x:M, y:y-20, width:3, height:22, color:C.accent});
    dt(title, M+10, y-13, fb, 8, C.accent);
    y -= 22;
  }

  function row(label, value) {
    const lW = 140, maxW = IW - lW - 16;
    const lines = wrapText(value || '—', fr, 9, maxW);
    const rH = Math.max(26, lines.length * 13 + 12);
    page.drawRectangle({x:M, y:y-rH, width:IW, height:rH, color:C.bgRow});
    page.drawLine({start:{x:M, y}, end:{x:M+IW, y}, thickness:.4, color:C.border});
    page.drawRectangle({x:M, y:y-rH, width:lW, height:rH, color:C.labBg});
    page.drawLine({start:{x:M+lW, y}, end:{x:M+lW, y:y-rH}, thickness:.4, color:C.border});
    dt(label, M+8, y-rH/2-3, fb, 7.5, rgb(.3,.3,.35));
    lines.forEach((l, i) => dt(l, M+lW+8, y-14-i*13, fr, 9, C.dark));
    y -= rH;
  }

  function emptyField(label, h) {
    const lW = 140;
    page.drawRectangle({x:M, y:y-h, width:IW, height:h, color:C.bgRow});
    page.drawLine({start:{x:M, y}, end:{x:M+IW, y}, thickness:.4, color:C.border});
    page.drawRectangle({x:M, y:y-h, width:lW, height:h, color:C.labBg});
    page.drawLine({start:{x:M+lW, y}, end:{x:M+lW, y:y-h}, thickness:.4, color:C.border});
    dt(label, M+8, y-h/2-3, fb, 7.5, rgb(.3,.3,.35));
    y -= h;
  }

  // ── SECTION 1: COMPLAINT ──
  section(L.sec1);
  row(L.fComplaint, complaint);
  row(L.fOnset,     onset);
  row(L.fDynamics,  dynamics);
  row(L.fSymptoms,  symptoms);

  // ── PAIN SCALE ──
  y -= 6;
  const scH = 50;
  page.drawRectangle({x:M, y:y-scH, width:IW, height:scH, color:C.bgRow});
  page.drawLine({start:{x:M, y}, end:{x:M+IW, y}, thickness:.4, color:C.border});
  dt(L.fPain, M+8, y-13, fb, 7.5, C.gray);
  const bc = nv >= 7 ? rgb(.85,.15,.15) : (nv >= 4 ? C.accent : rgb(.25,.70,.35));
  page.drawRectangle({x:M+8, y:y-32, width:34, height:16, color:bc});
  dt(nv + '/10', M+11, y-27, fb, 8, C.white);
  const cw = (IW - 54) / 10;
  for (let i = 1; i <= 10; i++) {
    const cx = M + 48 + (i-1) * (cw + 1.5), act = i <= nv;
    page.drawRectangle({x:cx, y:y-34, width:cw, height:20, color: act ? (nv >= 7 ? rgb(.85,.15,.15) : C.accent) : rgb(.91,.91,.91)});
    dt(String(i), cx + cw/2 - (i < 10 ? 3 : 5), y-28, fb, 7.5, act ? C.white : C.lgray);
  }
  dt(L.noPain,    M+48, y-46, fr, 6, C.lgray);
  dt(L.unbearable, M+48+9*(cw+1.5)+2, y-46, fr, 6, C.lgray);
  y -= scH + 14;

  // ── SECTION 2: HISTORY ──
  section(L.sec2);
  row(L.fChronic,   chronic_val);
  row(L.fAllergies, allergy_val);
  row(L.fMeds,      meds_val);
  y -= 6;

  // ── SECTION 3: FOR DOCTOR ──
  section(L.sec3);
  emptyField(L.fDiagnosis,    38);
  emptyField(L.fPrescription, 48);
  const hw = IW / 2;
  page.drawRectangle({x:M, y:y-28, width:IW, height:28, color:C.bgRow});
  page.drawLine({start:{x:M, y}, end:{x:M+IW, y}, thickness:.4, color:C.border});
  dt(L.fNext, M+8, y-14, fb, 7.5, C.gray);
  page.drawLine({start:{x:M+hw, y}, end:{x:M+hw, y:y-28}, thickness:.4, color:C.border});
  dt(L.fSickLeave, M+hw+8, y-14, fb, 7.5, C.gray);
  y -= 32;

  // ── SIGNATURES ──
  y -= 10;
  page.drawLine({start:{x:M, y}, end:{x:M+IW, y}, thickness:.6, color:C.border});
  y -= 20;
  const sw = IW / 2 - 10;
  dt(L.sigPat, M, y, fb, 8, C.gray);
  page.drawLine({start:{x:M, y:y-18}, end:{x:M+sw, y:y-18}, thickness:.5, color:C.border});
  dt(S(fullName), M, y-30, fr, 7.5, C.lgray);
  dt(L.dateLabel + dateStr.split(',')[0], M, y-41, fr, 7, C.lgray);
  const sx2 = M + IW / 2 + 10;
  dt(L.sigDoc, sx2, y, fb, 8, C.gray);
  page.drawLine({start:{x:sx2, y:y-18}, end:{x:M+IW, y:y-18}, thickness:.5, color:C.border});
  dt(S(doctorName), sx2, y-30, fr, 7.5, C.lgray);
  y -= 50;

  // ── CONSENT ──
  if (y > 32) {
    page.drawRectangle({x:M, y:y-20, width:IW, height:22, color:rgb(1,.97,.88)});
    page.drawRectangle({x:M, y:y-20, width:3, height:22, color:rgb(.85,.65,.10)});
    const cl = wrapText(L.consent, fr, 6.5, IW - 16);
    cl.forEach((l, i) => dt(l, M+9, y-13-i*9, fr, 6.5, rgb(.45,.35,.05)));
  }

  // ── FOOTER ──
  page.drawRectangle({x:0, y:0, width:W, height:26, color:C.dark});
  const fl = wrapText(L.footer, fr, 6.5, W - M*2 - 60);
  fl.forEach((l, i) => dt(l, M, 15 - i*8, fr, 6.5, rgb(.5,.5,.5)));
  dt('nexum.app', W-M-52, 9, fb, 7.5, C.accent);

  return await doc.save();
}
</script>`;

html = before + NEW_BLOCK + after;
fs.writeFileSync(FILE, html, 'utf8');
console.log('✅ Patched: ' + FILE);
console.log('   Noto Sans TTF + @pdf-lib/fontkit — full Ukrainian Cyrillic support');
console.log('   Text now renders natively without transliteration.');
