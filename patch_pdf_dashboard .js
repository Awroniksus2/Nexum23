#!/usr/bin/env node
// patch_pdf_dashboard.js
// Usage: node patch_pdf_dashboard.js dashboard.html
const fs = require('fs');
const FILE = process.argv[2] || 'dashboard.html';
if (!fs.existsSync(FILE)) { console.error('File not found: '+FILE); process.exit(1); }

let html = fs.readFileSync(FILE, 'utf8');

// Find old PDF block
let start = html.indexOf('<!-- ── NEXUM PDF GENERATOR');
if (start === -1) {
  const idx = html.indexOf('unpkg.com/pdf-lib');
  if (idx === -1) { console.error('Cannot find pdf-lib script'); process.exit(1); }
  start = html.lastIndexOf('<script', idx);
  const cm = html.lastIndexOf('<!--', start);
  if (cm !== -1 && cm > start - 100) start = cm;
}
const bodyIdx = html.lastIndexOf('</body>');
const scriptEnd = html.lastIndexOf('</script>', bodyIdx) + '</script>'.length;

const before = html.slice(0, start);
const after  = html.slice(scriptEnd);

const NEW_BLOCK = `<!-- ── NEXUM PDF GENERATOR (Unicode / Cyrillic 2-page) ── -->
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>
<script>
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
  const p = patients.find(x => x.id === patId); if (!p) return;
  let pdfBtn = null;
  document.querySelectorAll('#pdActionBar button').forEach(b => { if (b.textContent.includes('PDF')) pdfBtn = b; });
  if (pdfBtn) { pdfBtn.textContent = '⏳'; pdfBtn.disabled = true; }
  try {
    const bytes = await _buildPDF(p);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = [p.lastName, p.firstName].filter(Boolean).join('_') || 'patient';
    const date = new Date().toLocaleDateString('uk-UA').replace(/\\./g, '-');
    a.href = url; a.download = 'Nexum_' + name + '_' + date + '.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('PDF завантажено ✓');
  } catch(e) { console.error('[nexum-pdf]', e); showToast('Помилка PDF: ' + e.message, 'error'); }
  finally { if (pdfBtn) { pdfBtn.textContent = '📄 PDF'; pdfBtn.disabled = false; } }
}
async function _buildPDF(p) {
  const {PDFDocument,rgb} = PDFLib;
  const [regBuf,boldBuf] = await Promise.all([_fetchFont(_FONT_REG),_fetchFont(_FONT_BOLD)]);
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const fr = await doc.embedFont(regBuf); const fb = await doc.embedFont(boldBuf);
  const W=595,H=842,M=28,IW=W-M*2;
  const C={dark:rgb(.05,.07,.10),accent:rgb(.12,.64,.85),white:rgb(1,1,1),gray:rgb(.4,.4,.4),lgray:rgb(.65,.65,.65),border:rgb(.88,.88,.88),bgRow:rgb(.99,.99,.99),labBg:rgb(.93,.94,.96),labBg2:rgb(.90,.93,.97),labBg3:rgb(.90,.94,.90)};
  const isEn=typeof currentLang!=='undefined'&&currentLang==='en';
  const fullName=[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ');
  const doctorName=sessionStorage.getItem('nexum_name')||sessionStorage.getItem('nexum_auth')||'';
  const now=new Date();
  const dateStr=now.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric'})+', '+now.toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
  const L=isEn?{subtitle:'Medical assistant',title:'PATIENT ANAMNESIS',dateLabel:'Date: ',doctor:'DOCTOR',patient:'PATIENT',pageOf:'Page',sec1:'MAIN COMPLAINT',fComplaint:'Chief complaint',fLocation:'Location',fCharacter:'Pain character',fPain:'Pain intensity',noPain:'No pain',unbearable:'Unbearable',fRadiation:'Radiation',fDuration:'Episode duration',fFrequency:'Frequency',sec2:'HISTORY OF PRESENT ILLNESS',fOnset:'Onset',fTrigger:'Possible trigger',fDynamics:'Dynamics',fRelieved:'Relieved by',fWorsened:'Worsened by',fSymptoms:'Associated symptoms',fPrevEp:'Previous similar episodes',sec3:'PAST MEDICAL HISTORY',fChronic:'Chronic conditions',fOps:'Surgeries / hospitalizations',fMeds:'Current medications',fAllergies:'Allergies & intolerances',fFamily:'Family history',fSmoking:'Smoking / alcohol',fActivity:'Physical activity',sec4:'FOR DOCTOR  (filled by doctor)',fDiagnosis:'Preliminary diagnosis',fPrescription:'Prescriptions & recommendations',fNext:'Next appointment',fSickLeave:'Sick leave',sigPat:'Patient signature:',sigDoc:'Doctor signature:',consent:'CONSENT: Patient confirms accuracy of information and consents to its processing.',footer:'Document generated automatically by Nexum AI. Doctor may make corrections before signing.'}:{subtitle:'Медичний асистент',title:'АНАМНЕЗ ПАЦІЄНТА',dateLabel:'Дата: ',doctor:'ЛІКАР',patient:'ПАЦІЄНТ',pageOf:'Стор.',sec1:'СКАРГИ',fComplaint:'Основна скарга',fLocation:'Локалізація',fCharacter:'Характер болю/відчуття',fPain:'Інтенсивність болю',noPain:'Немає болю',unbearable:'Нестерпно',fRadiation:'Іррадіація',fDuration:'Тривалість епізоду',fFrequency:'Частота',sec2:'АНАМНЕЗ ЗАХВОРЮВАННЯ',fOnset:'Початок',fTrigger:'Можливий тригер',fDynamics:'Динаміка',fRelieved:'Що полегшує',fWorsened:'Що посилює',fSymptoms:'Супутні симптоми',fPrevEp:'Попередні схожі епізоди',sec3:'АНАМНЕЗ ЖИТТЯ',fChronic:'Хронічні захворювання',fOps:'Операції / госпіталізації',fMeds:'Постійні медикаменти',fAllergies:'Алергії та непереносимість',fFamily:'Спадковість',fSmoking:'Куріння / алкоголь',fActivity:'Фізична активність',sec4:'ДЛЯ ЛІКАРЯ  (заповнює лікар)',fDiagnosis:'Попередній діагноз',fPrescription:'Призначення та рекомендації',fNext:'Наступний прийом',fSickLeave:'Лікарняний лист',sigPat:'Підпис пацієнта:',sigDoc:'Підпис лікаря:',consent:'ЗГОДА: Підписуючи документ, пацієнт підтверджує достовірність наданої інформації та надає згоду на її обробку.',footer:'Документ сформовано автоматично системою Nexum AI. Лікар може внести корективи перед підписанням.'};
  let parsed={};
  const sessions=Array.isArray(p.chatSessions)?p.chatSessions:[];
  if(sessions.length){const last=[...sessions].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];(last.summary||'').replace(/---[^-\\n]*---/g,'\\n').split('\\n').forEach(line=>{const m=line.match(/^([^:]+):\\s*(.+)$/);if(m)parsed[m[1].trim().toLowerCase()]=m[2].trim();});}
  const g=(uk,en)=>{const keys=Array.isArray(uk)?uk:[uk];if(isEn&&en&&parsed[en.toLowerCase()])return parsed[en.toLowerCase()];for(const k of keys){if(parsed[k.toLowerCase()])return parsed[k.toLowerCase()];}return '';};
  const complaint=g(['основна скарга','скарга'],'complaint')||p.diag||'—';
  const location=g('локалізація','location')||'—';
  const character=g(['характер болю/відчуття','характер болю','характер'],'character')||'—';
  const radiation=g('іррадіація','radiation')||'—';
  const duration=g(['тривалість епізоду','тривалість'],'duration')||'—';
  const frequency=g('частота','frequency')||'—';
  const onset=g('початок','onset')||'—';
  const trigger=g(['можливий тригер','тригер'],'trigger')||'—';
  const dynamics=g('динаміка','dynamics')||'—';
  const relieved=g('що полегшує','relieved by')||'—';
  const worsened=g('що посилює','worsened by')||'—';
  const symptoms=g(['супутні симптоми','симптоми'],'associated symptoms')||'—';
  const prevEpisodes=g(['попередні схожі епізоди','попередні епізоди'],'previous episodes')||'—';
  const chronic_val=g(['хронічні захворювання','хронічні хвороби'],'chronic conditions')||(p.chronic&&p.chronic.length?p.chronic.join(', '):'Ні');
  const ops_val=g(['перенесені операції/госпіталізації','операції/госпіталізації'],'surgeries')||'—';
  const meds_val=g(['постійні медикаменти','медикаменти'],'medications')||(p.meds&&p.meds.length?p.meds.join(', '):'Ні');
  const allergy_val=g('алергії','allergies')||(p.allergy&&p.allergy.length?p.allergy.join(', '):'Ні');
  const family_val=g(['спадковість','сімейний анамнез'],'family history')||'—';
  const smoking_val=g('шкідливі звички','smoking')||'—';
  const activity_val=g('фізична активність','physical activity')||'—';
  const painRaw=g(['інтенсивність','інтенсивність болю'],'intensity')||'0';
  const nv=Math.min(parseInt((String(painRaw).match(/\\d+/)||['0'])[0])||0,10);
  const LABEL_W=158;
  const S=s=>String(s||'');
  function wt(text,font,size,maxW){const words=S(text).split(' ');const lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;try{if(font.widthOfTextAtSize(t,size)>maxW&&line){lines.push(line);line=w;}else line=t;}catch(e){line=t;}}if(line)lines.push(line);return lines.length?lines:[''];}
  function mkPage(page){
    const y={val:H-86};
    function dt(text,x,yy,font,size,color){try{page.drawText(S(text),{x,y:yy,font,size,color});}catch(e){}}
    function hdr(n){page.drawRectangle({x:0,y:H-72,width:W,height:72,color:C.dark});page.drawRectangle({x:M,y:H-60,width:4,height:36,color:C.accent});dt('NEXUM',M+12,H-36,fb,20,C.white);dt(L.subtitle,M+12,H-52,fr,8,C.lgray);dt(L.title,W-M-170,H-28,fb,9,C.accent);dt(L.dateLabel+dateStr,W-M-170,H-42,fr,8,C.lgray);dt('RPT-'+Date.now().toString().slice(-6),W-M-170,H-55,fr,7,C.lgray);dt(L.pageOf+' '+n,W/2-10,H-48,fr,7,C.lgray);}
    function ftr(){page.drawRectangle({x:0,y:0,width:W,height:26,color:C.dark});const fl=wt(L.footer,fr,6.5,W-M*2-64);fl.forEach((l,i)=>dt(l,M,15-i*8,fr,6.5,rgb(.5,.5,.5)));dt('nexum.app',W-M-52,9,fb,7.5,C.accent);}
    function sec(title,bg){y.val-=6;page.drawRectangle({x:M,y:y.val-20,width:IW,height:22,color:bg||C.dark});page.drawRectangle({x:M,y:y.val-20,width:3,height:22,color:C.accent});dt(title,M+10,y.val-13,fb,8,C.accent);y.val-=22;}
    function row(lbl,val,lBg){const maxW=IW-LABEL_W-16;const lines=wt(val||'—',fr,9,maxW);const rH=Math.max(26,lines.length*13+12);page.drawRectangle({x:M,y:y.val-rH,width:IW,height:rH,color:C.bgRow});page.drawLine({start:{x:M,y:y.val},end:{x:M+IW,y:y.val},thickness:.4,color:C.border});page.drawRectangle({x:M,y:y.val-rH,width:LABEL_W,height:rH,color:lBg||C.labBg});page.drawLine({start:{x:M+LABEL_W,y:y.val},end:{x:M+LABEL_W,y:y.val-rH},thickness:.4,color:C.border});dt(lbl,M+8,y.val-rH/2-3,fb,7.5,rgb(.3,.3,.35));lines.forEach((l,i)=>dt(l,M+LABEL_W+8,y.val-14-i*13,fr,9,C.dark));y.val-=rH;}
    function emf(lbl,h){page.drawRectangle({x:M,y:y.val-h,width:IW,height:h,color:C.bgRow});page.drawLine({start:{x:M,y:y.val},end:{x:M+IW,y:y.val},thickness:.4,color:C.border});page.drawRectangle({x:M,y:y.val-h,width:LABEL_W,height:h,color:C.labBg});page.drawLine({start:{x:M+LABEL_W,y:y.val},end:{x:M+LABEL_W,y:y.val-h},thickness:.4,color:C.border});dt(lbl,M+8,y.val-h/2-3,fb,7.5,rgb(.3,.3,.35));y.val-=h;}
    function scale(){y.val-=6;const scH=52;page.drawRectangle({x:M,y:y.val-scH,width:IW,height:scH,color:C.bgRow});page.drawLine({start:{x:M,y:y.val},end:{x:M+IW,y:y.val},thickness:.4,color:C.border});dt(L.fPain,M+8,y.val-13,fb,7.5,C.gray);const bc=nv>=7?rgb(.85,.15,.15):(nv>=4?C.accent:rgb(.25,.70,.35));page.drawRectangle({x:M+8,y:y.val-33,width:34,height:16,color:bc});dt(nv+'/10',M+11,y.val-27,fb,8,C.white);const cw=(IW-54)/10;for(let i=1;i<=10;i++){const cx=M+48+(i-1)*(cw+1.5),act=i<=nv;page.drawRectangle({x:cx,y:y.val-35,width:cw,height:20,color:act?(nv>=7?rgb(.85,.15,.15):C.accent):rgb(.91,.91,.91)});dt(String(i),cx+cw/2-(i<10?3:5),y.val-29,fb,7.5,act?C.white:C.lgray);}dt(L.noPain,M+48,y.val-47,fr,6,C.lgray);dt(L.unbearable,M+48+9*(cw+1.5)+2,y.val-47,fr,6,C.lgray);y.val-=scH+8;}
    return {dt,hdr,ftr,sec,row,emf,scale,y};
  }
  // PAGE 1
  const pg1=doc.addPage([W,H]); const h1=mkPage(pg1); h1.hdr('1 / 2');
  const cW=(IW-10)/2,cH=56,yC=h1.y.val;
  pg1.drawRectangle({x:M,y:yC-cH,width:cW,height:cH,color:rgb(.97,.97,.97)});pg1.drawRectangle({x:M,y:yC-2,width:cW,height:2,color:C.accent});
  h1.dt(L.doctor,M+10,yC-14,fb,7,C.accent);h1.dt(S(doctorName).slice(0,40),M+10,yC-26,fb,9,C.dark);
  const px=M+cW+10;
  pg1.drawRectangle({x:px,y:yC-cH,width:cW,height:cH,color:rgb(.97,.97,.97)});pg1.drawRectangle({x:px,y:yC-2,width:cW,height:2,color:C.accent});
  h1.dt(L.patient,px+10,yC-14,fb,7,C.accent);h1.dt(S(fullName).slice(0,40),px+10,yC-26,fb,9,C.dark);h1.dt(L.dateLabel+dateStr.split(',')[0],px+10,yC-38,fr,8,C.gray);
  h1.y.val=yC-cH-12;
  h1.sec(L.sec1);h1.row(L.fComplaint,complaint);h1.row(L.fLocation,location,C.labBg);h1.row(L.fCharacter,character,C.labBg);h1.row(L.fRadiation,radiation,C.labBg);h1.row(L.fDuration,duration,C.labBg);h1.row(L.fFrequency,frequency,C.labBg);h1.scale();
  h1.sec(L.sec2,rgb(.08,.12,.22));h1.row(L.fOnset,onset,C.labBg2);h1.row(L.fTrigger,trigger,C.labBg2);h1.row(L.fDynamics,dynamics,C.labBg2);h1.row(L.fRelieved,relieved,C.labBg2);h1.row(L.fWorsened,worsened,C.labBg2);h1.row(L.fSymptoms,symptoms,C.labBg2);h1.row(L.fPrevEp,prevEpisodes,C.labBg2);
  h1.ftr();
  // PAGE 2
  const pg2=doc.addPage([W,H]); const h2=mkPage(pg2); h2.hdr('2 / 2');
  pg2.drawRectangle({x:M,y:h2.y.val-22,width:IW,height:22,color:rgb(.96,.96,.98)});h2.dt(S(fullName)+'   ·   '+dateStr.split(',')[0],M+10,h2.y.val-14,fb,8,C.gray);h2.y.val-=28;
  h2.sec(L.sec3,rgb(.06,.14,.06));h2.row(L.fChronic,chronic_val,C.labBg3);h2.row(L.fOps,ops_val,C.labBg3);h2.row(L.fMeds,meds_val,C.labBg3);h2.row(L.fAllergies,allergy_val,C.labBg3);h2.row(L.fFamily,family_val,C.labBg3);h2.row(L.fSmoking,smoking_val,C.labBg3);h2.row(L.fActivity,activity_val,C.labBg3);h2.y.val-=6;
  h2.sec(L.sec4);h2.emf(L.fDiagnosis,38);h2.emf(L.fPrescription,52);
  const hw=IW/2;pg2.drawRectangle({x:M,y:h2.y.val-28,width:IW,height:28,color:C.bgRow});pg2.drawLine({start:{x:M,y:h2.y.val},end:{x:M+IW,y:h2.y.val},thickness:.4,color:C.border});h2.dt(L.fNext,M+8,h2.y.val-14,fb,7.5,C.gray);pg2.drawLine({start:{x:M+hw,y:h2.y.val},end:{x:M+hw,y:h2.y.val-28},thickness:.4,color:C.border});h2.dt(L.fSickLeave,M+hw+8,h2.y.val-14,fb,7.5,C.gray);h2.y.val-=32;
  h2.y.val-=10;pg2.drawLine({start:{x:M,y:h2.y.val},end:{x:M+IW,y:h2.y.val},thickness:.6,color:C.border});h2.y.val-=20;
  const sw=IW/2-10;h2.dt(L.sigPat,M,h2.y.val,fb,8,C.gray);pg2.drawLine({start:{x:M,y:h2.y.val-18},end:{x:M+sw,y:h2.y.val-18},thickness:.5,color:C.border});h2.dt(S(fullName),M,h2.y.val-30,fr,7.5,C.lgray);h2.dt(L.dateLabel+dateStr.split(',')[0],M,h2.y.val-41,fr,7,C.lgray);
  const sx2=M+IW/2+10;h2.dt(L.sigDoc,sx2,h2.y.val,fb,8,C.gray);pg2.drawLine({start:{x:sx2,y:h2.y.val-18},end:{x:M+IW,y:h2.y.val-18},thickness:.5,color:C.border});h2.dt(S(doctorName),sx2,h2.y.val-30,fr,7.5,C.lgray);h2.y.val-=50;
  if(h2.y.val>32){pg2.drawRectangle({x:M,y:h2.y.val-22,width:IW,height:24,color:rgb(1,.97,.88)});pg2.drawRectangle({x:M,y:h2.y.val-22,width:3,height:24,color:rgb(.85,.65,.10)});const cl=wt(L.consent,fr,6.5,IW-20);cl.forEach((l,i)=>h2.dt(l,M+9,h2.y.val-13-i*9,fr,6.5,rgb(.45,.35,.05)));}
  h2.ftr();
  return await doc.save();
}
</script>`;

fs.writeFileSync(FILE, before + NEW_BLOCK + after, 'utf8');
console.log('✅ Patched: ' + FILE);
console.log('   2-page PDF with all anamnesis fields');
