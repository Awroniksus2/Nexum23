const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Supabase config ────────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Supabase] Project_URL або Service_Role_Key не задано в env!');
}

// ── Supabase REST helper ───────────────────────────────────────
function supabaseFetch(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({
      hostname: urlObj.hostname,
      path: '/rest/v1/' + endpoint,
      method,
      headers,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Rate limiting для /api/login ───────────────────────────────
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 10) return false;
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of loginAttempts.entries()) {
    const fresh = times.filter(t => now - t < 15 * 60 * 1000);
    if (!fresh.length) loginAttempts.delete(ip);
    else loginAttempts.set(ip, fresh);
  }
}, 30 * 60 * 1000);

// ── Auth ───────────────────────────────────────────────────────
async function getDoctor(code) {
  const c = (code || '').trim().toUpperCase();
  try {
    const r = await supabaseFetch('GET',
      `registered_doctors?code=eq.${encodeURIComponent(c)}&limit=1`);
    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) return null;
    return r.body[0];
  } catch(e) { console.error('[getDoctor]', e.message); return null; }
}

// ── Patients ───────────────────────────────────────────────────
async function getPatientsByDoctorCode(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
   `patients?doctor_code=eq.${encodeURIComponent(dc)}&order=created_at.desc`);
  if (r.status !== 200) throw new Error('Failed to load patients: ' + r.status);

  return (Array.isArray(r.body) ? r.body : []).map(p => {
    // Парсимо name → lastName/firstName якщо окремих полів немає
   let lastName  = p.last_name  || p.lastName  || '';
let firstName = p.first_name || p.firstName || '';
    if (!lastName && !firstName && p.name) {
      const parts = p.name.trim().split(/\s+/);
      lastName  = parts[0] || '';
      firstName = parts[1] || '';
    }

    // Сесії чату (snake_case → camelCase)
    const chatSessions = Array.isArray(p.chat_sessions)
      ? p.chat_sessions.map(s => ({
          ...s,
          chatHistory: s.chatHistory || s.messages || [],
        }))
      : [];

    return {
      ...p,
      id:             'sb_' + p.id,
      lastName,
      firstName,
      middleName:     p.middle_name  || p.middleName  || '',
birthDate:      p.birth_date   || p.birthDate   || '',
      diag:           p.diag        || p.diagnosis     || '',
      notes:          p.notes       || '',
      phone:          p.phone       || '',
      telegram:       p.telegram    || '',
      gender:         p.gender      || '',
      allergy:        Array.isArray(p.allergy)   ? p.allergy   : [],
      chronic:        Array.isArray(p.chronic)   ? p.chronic   : [],
      meds:           Array.isArray(p.meds)      ? p.meds      : [],
      photos:         Array.isArray(p.photos)    ? p.photos    : [],
      dynamicAnswers: p.dynamic_answers || p.dynamicAnswers || {},
surveyKey:      p.survey_key     || p.surveyKey      || '',
operations:     p.operations     || '',
family:         p.family         || '',
smoking:        p.smoking        || '',
activity:       p.activity       || '',
      surveyResults:  Array.isArray(p.survey_results) ? p.survey_results : [],
      chatSessions,
      createdAt:      p.createdAt || p.created_at || '',
    };
  });
}

async function savePatientRecord(doctorCode, patientData) {
  const dc = doctorCode.toUpperCase();
  const now = new Date().toISOString();

  const rawId = patientData.id
    ? String(patientData.id).replace('sb_', '')
    : null;
 const isValidUuid = rawId && (/^[0-9a-f-]{36}$/i.test(rawId) || /^\d+$/.test(rawId));
  // ← camelCase → snake_case для Supabase
  const record = {
    doctor_code:     dc,
    last_name:       patientData.lastName    || '',
    first_name:      patientData.firstName   || '',
    middle_name:     patientData.middleName  || '',
    gender:          patientData.gender      || '',
    birth_date:      patientData.birthDate   || null,
    phone:           patientData.phone       || '',
    telegram:        patientData.telegram    || '',
    diag:            patientData.diag        || '',
    notes:           patientData.notes       || '',
    operations:      patientData.operations  || '',
    family:          patientData.family      || '',
    smoking:         patientData.smoking     || '',
    activity:        patientData.activity    || '',
    allergy:         Array.isArray(patientData.allergy)  ? patientData.allergy  : [],
    chronic:         Array.isArray(patientData.chronic)  ? patientData.chronic  : [],
    meds:            Array.isArray(patientData.meds)     ? patientData.meds     : [],
    dynamic_answers: patientData.dynamicAnswers || {},
    survey_key:      patientData.surveyKey   || '',
    updated_at:      now,
  };

  if (isValidUuid) {
    const r = await supabaseFetch('PATCH', `patients?id=eq.${rawId}`, record);
    if (r.status !== 200 && r.status !== 204) {
      throw new Error('Update failed: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
    }
    return 'sb_' + rawId;
  } else {
    record.created_at = now;
    const r = await supabaseFetch('POST', 'patients', record);
    if (r.status !== 201 && r.status !== 200) {
      throw new Error('Create failed: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
    }
    const created = Array.isArray(r.body) ? r.body[0] : r.body;
    return 'sb_' + created?.id;
  }
}
async function deletePatientRecord(patientId) {
  const rawId = String(patientId).replace('sb_', '');
  if (!/^[0-9a-f-]{36}$/i.test(rawId)) throw new Error('Invalid patient id: ' + patientId);
  const r = await supabaseFetch('DELETE', `patients?id=eq.${rawId}`);
  if (r.status !== 200 && r.status !== 204) throw new Error('Delete failed: ' + r.status);
}

// ── Surveys ────────────────────────────────────────────────────
async function getSurveys(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
    `surveys?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) {
    return { surveys: {}, fsId: null };
  }
  const row = r.body[0];
 return { surveys: row.surveys_data || {}, fsId: row.id };
}

async function saveSurveys(doctorCode, surveys, fsId) {
  const dc = doctorCode.toUpperCase();
  const now = new Date().toISOString();
const record = { doctor_code: dc, surveys_data: surveys, updated_at: now };

  if (fsId && /^[0-9a-f-]{36}$/i.test(fsId)) {
    const r = await supabaseFetch('PATCH', `surveys?id=eq.${fsId}`, record);
    if (r.status !== 200 && r.status !== 204) throw new Error('Surveys update failed: ' + r.status);
    return fsId;
  }

  const check = await supabaseFetch('GET',
    `surveys?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (check.status === 200 && Array.isArray(check.body) && check.body.length) {
    const existId = check.body[0].id;
    await supabaseFetch('PATCH', `surveys?id=eq.${existId}`, record);
    return existId;
  }

  const r = await supabaseFetch('POST', 'surveys', record);
  if (r.status !== 201 && r.status !== 200) throw new Error('Surveys create failed: ' + r.status);
  const created = Array.isArray(r.body) ? r.body[0] : r.body;
  return created?.id;
}

// ── Groq AI ────────────────────────────────────────────────────
async function callGroqAPI(payload) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in environment');
  const groqBody = {
    model: payload.model || 'llama-3.3-70b-versatile',
    max_tokens: payload.max_tokens || 1200,
    temperature: 0.3,
    messages: [
      { role: 'system', content: payload.system || '' },
      ...(payload.messages || []),
    ],
  };
  const body = JSON.stringify(groqBody);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST', timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.choices?.[0]?.message?.content) {
            resolve({ status: res.statusCode, body: { content: [{ type: 'text', text: parsed.choices[0].message.content }] } });
          } else { resolve({ status: res.statusCode, body: parsed }); }
        } catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Groq API timeout (30s)')); });
    req.on('error', e => reject(e));
    req.write(body); req.end();
  });
}

// ── Telegram bot ───────────────────────────────────────────────
function tgCall(method, data) {
  return new Promise((res, rej) => {
    if (!BOT_TOKEN) { rej(new Error('No BOT_TOKEN')); return; }
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d));}catch{res({ok:false});} }); });
    req.on('error', rej); req.write(body); req.end();
  });
}
const send = (chat_id, text) => tgCall('sendMessage', { chat_id, text, parse_mode: 'HTML' });
const isAdmin = id => String(id) === String(CHAT_ID);

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg?.text) return;
  const cid = String(msg.chat.id);
  const txt = msg.text.trim();
  if (!isAdmin(cid)) { if (txt.startsWith('/')) await send(cid, 'Доступ заборонено.'); return; }
  if (txt === '/start') { await send(cid, '<b>Nexum Site Bot</b>'); return; }
  if (txt.startsWith('/')) await send(cid, '/help');
}
let lastId = 0;
async function poll() {
  if (!BOT_TOKEN) return;
  try {
    const r = await tgCall('getUpdates', { offset: lastId + 1, timeout: 25, allowed_updates: ['message'] });
    if (r.ok && r.result?.length) {
      for (const u of r.result) { lastId = u.update_id; await handleUpdate(u).catch(e => console.error('bot:', e.message)); }
    }
  } catch(e) { console.error('poll:', e.message); }
  setTimeout(poll, 1000);
}

// ── Static file serving ────────────────────────────────────────
const mime = {
  '.html': 'text/html;charset=utf-8', '.css': 'text/css;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const cachePolicy = {
  '.html': 'no-cache', '.css': 'public, max-age=604800', '.js': 'public, max-age=604800',
  '.png': 'public, max-age=31536000', '.jpg': 'public, max-age=31536000',
  '.webp': 'public, max-age=31536000', '.svg': 'public, max-age=31536000',
  '.ico': 'public, max-age=31536000', '.woff': 'public, max-age=31536000', '.woff2': 'public, max-age=31536000',
};

function serveStatic(fp, res, req) {
  fs.stat(fp, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h2 style="padding:40px;color:#fff;background:#05070e">404 <a href="/" style="color:#3b82f6">Home</a></h2>');
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Cache-Control': cachePolicy[ext] || 'no-cache', 'ETag': etag });
      res.end(); return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': mime[ext] || 'text/plain',
        'Cache-Control': cachePolicy[ext] || 'no-cache',
        'ETag': etag,
      });
      res.end(data);
    });
  });
}

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
  });
}

// ── Routes ─────────────────────────────────────────────────────
const ROUTES = {
  '/': 'nexum.html', '/nexum.html': 'nexum.html',
  '/login': 'login.html', '/login.html': 'login.html',
  '/dashboard': 'dashboard.html', '/dashboard.html': 'dashboard.html',
  '/survey': 'survey.html', '/survey.html': 'survey.html',
};

// ── HTTP Server ────────────────────────────────────────────────
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pn = req.url.split('?')[0].split('#')[0];
  const qs = Object.fromEntries(new URL('http://x' + req.url).searchParams);

  // GET /health
  if (req.method === 'GET' && pn === '/health') {
    jsonRes(res, 200, { status: 'ok', project: 'Nexum', db: 'supabase' });
    return;
  }

  // GET /api/surveys
  if (req.method === 'GET' && pn === '/api/surveys') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      jsonRes(res, 200, await getSurveys(qs.doctorCode));
    } catch(e) { console.error('[GET /api/surveys]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/surveys
  if (req.method === 'POST' && pn === '/api/surveys') {
    try {
      const body = await readBody(req);
      const { doctorCode, surveys, fsId } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!surveys || typeof surveys !== 'object') return jsonRes(res, 400, { error: 'surveys required' });
      const newFsId = await saveSurveys(doctorCode, surveys, fsId || null);
      jsonRes(res, 200, { success: true, fsId: newFsId });
    } catch(e) { console.error('[POST /api/surveys]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/dashboard/patients
  if (req.method === 'GET' && pn === '/api/dashboard/patients') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      jsonRes(res, 200, await getPatientsByDoctorCode(qs.doctorCode));
    } catch(e) { console.error('[GET patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/dashboard/patients
  if (req.method === 'POST' && pn === '/api/dashboard/patients') {
    try {
      const body = await readBody(req);
      const { doctorCode, ...fields } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const patient = body.patient || fields;
      jsonRes(res, 200, { success: true, id: await savePatientRecord(doctorCode, patient) });
    } catch(e) { console.error('[POST patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // PUT /api/dashboard/patients/:id
  if (req.method === 'PUT' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      const patientId = decodeURIComponent(pn.replace('/api/dashboard/patients/', ''));
      const body = await readBody(req);
      const { doctorCode, ...patientData } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const id = await savePatientRecord(doctorCode, { id: patientId, ...patientData });
      jsonRes(res, 200, { success: true, id });
    } catch(e) { console.error('[PUT patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // DELETE /api/dashboard/patients/:id
  if (req.method === 'DELETE' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      const patientId = decodeURIComponent(pn.replace('/api/dashboard/patients/', ''));
      await deletePatientRecord(patientId);
      jsonRes(res, 200, { success: true });
    } catch(e) { console.error('[DELETE patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/dashboard/remind
  if (req.method === 'POST' && pn === '/api/dashboard/remind') {
    try { await readBody(req); jsonRes(res, 200, { success: true }); }
    catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/login
  if (req.method === 'POST' && pn === '/api/login') {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(ip)) {
        return jsonRes(res, 429, { ok: false, error: 'Забагато спроб. Спробуйте через 15 хвилин.' });
      }
      const { code, password } = await readBody(req);
      const doc = await getDoctor(code || '');
      if (doc && doc.password === password) {
        jsonRes(res, 200, {
          ok: true,
          name:      doc.name      || '',
          specialty: doc.specialty || '',
          clinic:    doc.hospital  || doc.clinic || '',
          code:      doc.code,
        });
      } else { jsonRes(res, 401, { ok: false }); }
    } catch(e) { jsonRes(res, 400, { error: 'bad json' }); }
    return;
  }

  // POST /api/notify
  if (req.method === 'POST' && pn === '/api/notify') {
    try {
      const { message } = await readBody(req);
      if (!BOT_TOKEN || !CHAT_ID) return jsonRes(res, 500, { error: 'bot not configured' });
      await send(CHAT_ID, message);
      jsonRes(res, 200, { ok: true });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/patient/chatlog
  if (req.method === 'GET' && pn === '/api/patient/chatlog') {
    try {
      const { doctorCode, phone, email, name } = qs;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!phone && !email && !name) return jsonRes(res, 400, { error: 'phone, email or name required' });

      const dc = doctorCode.toUpperCase();
      let endpoint = `patients?doctor_code=eq.${encodeURIComponent(dc)}`;
      if (phone) endpoint += `&phone=eq.${encodeURIComponent(phone)}`;
      else if (email) endpoint += `&email=eq.${encodeURIComponent(email)}`;

      const r = await supabaseFetch('GET', endpoint);
      if (r.status !== 200) throw new Error('chatlog query failed: ' + r.status);

      let pts = Array.isArray(r.body) ? r.body : [];

      if (name && !phone && !email) {
        const normName = name.toLowerCase().trim().replace(/\s+/g, ' ');
        pts = pts.filter(p => {
          const dn = [p.lastName, p.firstName].filter(Boolean).join(' ').toLowerCase();
          return dn.includes(normName) || normName.includes(dn.split(' ')[0]);
        });
      }

      const result = pts.flatMap(p => {
        const sessions = Array.isArray(p.chatSessions) ? p.chatSessions : [];
        return sessions.map(s => ({
          id:          s.id || '',
          createdAt:   s.createdAt || '',
          summary:     s.summary || '',
          chatHistory: (Array.isArray(s.chatHistory) ? s.chatHistory : []).filter(m =>
            m.content !== 'Почни опитування' && m.content !== 'Start the survey'
          ),
        }));
      });

      jsonRes(res, 200, result);
    } catch(e) { console.error('[chatlog]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // Static files
  const file = ROUTES[pn] || pn.replace(/^\//, '');
  const fp = path.join(__dirname, file);
  fs.stat(fp, (err, stat) => {
    if (!err && stat.isFile()) serveStatic(fp, res, req);
    else serveStatic(fp + '.html', res, req);
  });

}).listen(PORT, () => {
  console.log(`Nexum site :${PORT}`);
  console.log(`Supabase: ${SUPABASE_URL || 'NOT SET'}`);
  if (GROQ_API_KEY) console.log('Groq AI ready');
  else console.warn('GROQ_API_KEY not set');
});

if (BOT_TOKEN && CHAT_ID) { poll(); console.log('Bot polling started'); }
else console.warn('Bot disabled');
