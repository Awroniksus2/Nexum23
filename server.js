const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

let _sa = null;
function getServiceAccount() {
  if (_sa) return _sa;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  _sa = JSON.parse(raw.trim());
  return _sa;
}
const mime = {
  '.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
  '.js':'application/javascript;charset=utf-8','.png':'image/png',
  '.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.json':'application/json',
  '.woff':'font/woff','.woff2':'font/woff2',
};
const cachePolicy = {
  '.html':'no-cache','.css':'public, max-age=604800','.js':'public, max-age=604800',
  '.png':'public, max-age=31536000','.jpg':'public, max-age=31536000',
  '.webp':'public, max-age=31536000','.svg':'public, max-age=31536000',
  '.ico':'public, max-age=31536000','.woff':'public, max-age=31536000','.woff2':'public, max-age=31536000',
};
let accessToken = null;
let tokenExpiry = 0;
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
  const sa = getServiceAccount();
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  })).toString('base64url');
  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${sign.sign(privateKey, 'base64url')}`;
  const tokenData = await httpsPost('oauth2.googleapis.com', '/token',
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    { 'Content-Type': 'application/x-www-form-urlencoded' });
  accessToken = tokenData.access_token;
  tokenExpiry = Date.now() + (tokenData.expires_in || 3600) * 1000;
  return accessToken;
}
function httpsPost(hostname, path_, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ hostname, path: path_, method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch{resolve(d);} }); });
    req.on('error', reject); req.write(data); req.end();
  });
}
function httpsReq(method, hostname, path_, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ hostname, path: path_, method,
      headers: { ...(data?{'Content-Length':Buffer.byteLength(data)}:{}), ...headers }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)});}catch{resolve({status:res.statusCode,body:d});} }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
function fromFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const obj = { _fsId: doc.name?.split('/').pop() };
  for (const [key, val] of Object.entries(doc.fields)) {
    if      (val.stringValue    !== undefined) obj[key] = val.stringValue;
    else if (val.timestampValue !== undefined) obj[key] = val.timestampValue;
    else if (val.booleanValue   !== undefined) obj[key] = val.booleanValue;
    else if (val.integerValue   !== undefined) obj[key] = parseInt(val.integerValue);
    else if (val.arrayValue     !== undefined) obj[key] = (val.arrayValue.values || []).map(v => v.stringValue ?? v.integerValue ?? '');
    else if (val.mapValue       !== undefined) obj[key] = fromFirestoreMap(val.mapValue.fields || {});
  }
  return obj;
}
function fromFirestoreMap(fields) {
  const obj = {};
  for (const [key, val] of Object.entries(fields)) {
    if      (val.stringValue    !== undefined) obj[key] = val.stringValue;
    else if (val.booleanValue   !== undefined) obj[key] = val.booleanValue;
    else if (val.integerValue   !== undefined) obj[key] = parseInt(val.integerValue);
    else if (val.arrayValue     !== undefined) obj[key] = (val.arrayValue.values || []).map(v => v.stringValue ?? '');
  }
  return obj;
}
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string')   return { stringValue: val };
  if (typeof val === 'boolean')  return { booleanValue: val };
  if (typeof val === 'number')   return { integerValue: String(val) };
  if (Array.isArray(val))        return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object')   return { mapValue: { fields: toFirestoreFields(val) } };
  return { stringValue: String(val) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'id' || key === '_fsId') continue;
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}
async function getDoctor(code) {
  const c = (code || '').trim().toUpperCase();
  try {
    const sa = getServiceAccount();
    const token = await getAccessToken();
    const r = await httpsReq('POST', 'firestore.googleapis.com',
      `/v1/projects/${sa.project_id}/databases/(default)/documents:runQuery`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { structuredQuery: { from:[{collectionId:'registered_doctors'}], where:{fieldFilter:{field:{fieldPath:'code'},op:'EQUAL',value:{stringValue:c}}}, limit:1 } });
    if (r.status !== 200) return null;
    const results = Array.isArray(r.body) ? r.body : [];
    const hit = results.find(item => item.document);
    if (!hit) return null;
    return fromFirestore(hit.document);
  } catch(e) { console.error('[getDoctor]', e.message); return null; }
}

async function getPatientsByDoctorCode(doctorCode) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const dc = doctorCode.toUpperCase();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;

  let allDocs = [];
  let pageToken = null;

  do {
    let url = `/v1/${base}/doctors/${dc}/patients?pageSize=100`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await httpsReq('GET', 'firestore.googleapis.com', url,
      { 'Authorization': `Bearer ${token}` });
    if (r.status !== 200) break;
    allDocs = allDocs.concat(r.body.documents || []);
    pageToken = r.body.nextPageToken || null;
  } while (pageToken);

  function parseMsgArr(fieldObj) {
    if (!fieldObj || !fieldObj.arrayValue || !fieldObj.arrayValue.values) return [];
    return fieldObj.arrayValue.values.map(cv => {
      const cf = cv.mapValue && cv.mapValue.fields;
      if (!cf) return null;
      return {
        role:    (cf.role    && cf.role.stringValue)    || '',
        content: (cf.content && cf.content.stringValue) || ''
      };
    }).filter(m => m && m.role && m.content);
  }

  function parseChatSessions(fields) {
    if (!fields || !fields.chatSessions) return [];
    const arr = fields.chatSessions.arrayValue;
    if (!arr || !arr.values) return [];
    return arr.values.map(v => {
      const f = v.mapValue && v.mapValue.fields;
      if (!f) return null;
      const msgs = parseMsgArr(f.messages);
      const hist = parseMsgArr(f.chatHistory);
      const resolved = msgs.length > 0 ? msgs : hist;
      return {
        id:          (f.id          && f.id.stringValue)          || '',
        createdAt:   (f.createdAt   && f.createdAt.stringValue)   || '',
        summary:     (f.summary     && f.summary.stringValue)     || '',
        messages:    resolved,
        chatHistory: resolved,
      };
    }).filter(Boolean);
  }

  return allDocs.map(doc => {
    const base2 = fromFirestore(doc);
    base2.chatSessions = parseChatSessions(doc.fields);
    return { id: 'fb_' + doc.name.split('/').pop(), ...base2 };
  }).sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
}

async function savePatientRecord(doctorCode, patientData) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const dc = doctorCode.toUpperCase();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;
  const colPath = `doctors/${dc}/patients`;
  const now = new Date().toISOString();

  if (patientData.id && String(patientData.id).startsWith('fb_')) {
    const docId = String(patientData.id).replace('fb_', '');
    const { id, _fsId, ...data } = patientData;
    const fields = toFirestoreFields({ ...data, doctorCode: dc, updatedAt: now });
    const r = await httpsReq('PATCH', 'firestore.googleapis.com',
      `/v1/${base}/${colPath}/${docId}`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { fields });
    if (r.status !== 200) throw new Error('Update failed: ' + JSON.stringify(r.body).slice(0, 200));
    return 'fb_' + docId;
  } else {
    const { id, _fsId, ...data } = patientData;
    const fields = toFirestoreFields({ ...data, doctorCode: dc, createdAt: now, updatedAt: now });
    const r = await httpsReq('POST', 'firestore.googleapis.com',
      `/v1/${base}/${colPath}`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { fields });
    if (r.status !== 200) throw new Error('Create failed: ' + JSON.stringify(r.body).slice(0, 200));
    const newId = r.body.name?.split('/').pop();
    return 'fb_' + newId;
  }
}

async function deletePatientRecord(patientId) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;

  const parts = String(patientId).split('|');
  const docId = parts[0].replace('fb_', '');
  const dc = parts[1] ? parts[1].toUpperCase() : null;

  if (dc) {
    const r = await httpsReq('DELETE', 'firestore.googleapis.com',
      `/v1/${base}/doctors/${dc}/patients/${docId}`,
      { 'Authorization': `Bearer ${token}` });
    if (r.status !== 200 && r.status !== 204) throw new Error('Delete failed: ' + r.status);
    return;
  }

  const doctorsR = await httpsReq('GET', 'firestore.googleapis.com',
    `/v1/${base}/doctors`, { 'Authorization': `Bearer ${token}` });

  if (doctorsR.status === 200 && doctorsR.body.documents) {
    for (const dDoc of doctorsR.body.documents) {
      const dCode = dDoc.name.split('/').pop();
      const r = await httpsReq('DELETE', 'firestore.googleapis.com',
        `/v1/${base}/doctors/${dCode}/patients/${docId}`,
        { 'Authorization': `Bearer ${token}` });
      if (r.status === 200 || r.status === 204) return;
    }
  }
  throw new Error('Patient not found: ' + patientId);
}

// ── SURVEYS: get/save в doctors/{dc}/surveys ───────────────────
async function getSurveys(doctorCode) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const dc = doctorCode.toUpperCase();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;

  const r = await httpsReq('GET', 'firestore.googleapis.com',
    `/v1/${base}/doctors/${dc}/surveys?pageSize=1`,
    { 'Authorization': `Bearer ${token}` });

  if (r.status !== 200 || !r.body.documents || !r.body.documents.length) {
    return { surveys: {}, fsId: null };
  }

  const doc = r.body.documents[0];
  const fsId = doc.name.split('/').pop();
  const fields = doc.fields || {};

  let surveys = {};
  if (fields.data && fields.data.stringValue) {
    try { surveys = JSON.parse(fields.data.stringValue); } catch(_) {}
  }

  return { surveys, fsId };
}

async function saveSurveys(doctorCode, surveys, fsId) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const dc = doctorCode.toUpperCase();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;
  const colPath = `doctors/${dc}/surveys`;
  const now = new Date().toISOString();

  const fields = {
    data:      { stringValue: JSON.stringify(surveys) },
    updatedAt: { stringValue: now },
  };

  // Якщо є fsId — оновлюємо існуючий документ
  if (fsId) {
    const r = await httpsReq('PATCH', 'firestore.googleapis.com',
      `/v1/${base}/${colPath}/${fsId}`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { fields });
    if (r.status !== 200) throw new Error('Surveys update failed: ' + r.status);
    return fsId;
  }

  // Шукаємо існуючий документ
  const existing = await httpsReq('GET', 'firestore.googleapis.com',
    `/v1/${base}/${colPath}?pageSize=1`,
    { 'Authorization': `Bearer ${token}` });

  if (existing.status === 200 && existing.body.documents && existing.body.documents.length) {
    const existId = existing.body.documents[0].name.split('/').pop();
    const r = await httpsReq('PATCH', 'firestore.googleapis.com',
      `/v1/${base}/${colPath}/${existId}`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { fields });
    if (r.status !== 200) throw new Error('Surveys patch failed: ' + r.status);
    return existId;
  }

  // Створюємо новий документ
  const r = await httpsReq('POST', 'firestore.googleapis.com',
    `/v1/${base}/${colPath}`,
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    { fields });
  if (r.status !== 200) throw new Error('Surveys create failed: ' + r.status);
  return r.body.name?.split('/').pop();
}

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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': `Bearer ${GROQ_API_KEY}` }
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
    req.on('error', (e) => { reject(e); });
    req.write(body); req.end();
  });
}
function tgCall(method, data) {
  return new Promise((res, rej) => {
    if (!BOT_TOKEN) { rej(new Error('No BOT_TOKEN')); return; }
    const body = JSON.stringify(data);
    const req = https.request({ hostname:'api.telegram.org', path:`/bot${BOT_TOKEN}/${method}`, method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d));}catch{res({ok:false});} }); });
    req.on('error', rej); req.write(body); req.end();
  });
}
const send = (chat_id, text) => tgCall('sendMessage', { chat_id, text, parse_mode:'HTML' });
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
    const r = await tgCall('getUpdates', { offset:lastId+1, timeout:25, allowed_updates:['message'] });
    if (r.ok && r.result?.length) {
      for (const u of r.result) { lastId = u.update_id; await handleUpdate(u).catch(e => console.error('bot:', e.message)); }
    }
  } catch(e) { console.error('poll:', e.message); }
  setTimeout(poll, 1000);
}
const ROUTES = {
  '/':'nexum.html','/nexum.html':'nexum.html',
  '/login':'login.html','/login.html':'login.html',
  '/dashboard':'dashboard.html','/dashboard.html':'dashboard.html',
  '/survey':'survey.html','/survey.html':'survey.html',
};
function serveStatic(fp, res, req) {
  fs.stat(fp, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, {'Content-Type':'text/html'});
      res.end('<h2 style="padding:40px;color:#fff;background:#05070e">404 <a href="/" style="color:#3b82f6">Home</a></h2>');
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Cache-Control': cachePolicy[ext]||'no-cache', 'ETag': etag });
      res.end(); return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[ext]||'text/plain', 'Cache-Control': cachePolicy[ext]||'no-cache', 'ETag': etag });
      res.end(data);
    });
  });
}
function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const pn = req.url.split('?')[0].split('#')[0];
  const qs = Object.fromEntries(new URL('http://x' + req.url).searchParams);

  // ── GET /health ───────────────────────────────────────────────
  if (req.method === 'GET' && pn === '/health') {
    jsonRes(res, 200, { status: 'ok', project: 'Nexum' });
    return;
  }

  // ── GET /api/surveys ─────────────────────────────────────────
  if (req.method === 'GET' && pn === '/api/surveys') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const result = await getSurveys(qs.doctorCode);
      jsonRes(res, 200, result);
    } catch(e) {
      console.error('[GET /api/surveys]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // ── POST /api/surveys ────────────────────────────────────────
  if (req.method === 'POST' && pn === '/api/surveys') {
    try {
      const body = await readBody(req);
      const { doctorCode, surveys, fsId } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!surveys || typeof surveys !== 'object') return jsonRes(res, 400, { error: 'surveys required' });
      const newFsId = await saveSurveys(doctorCode, surveys, fsId || null);
      jsonRes(res, 200, { success: true, fsId: newFsId });
    } catch(e) {
      console.error('[POST /api/surveys]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // ── GET /api/dashboard/patients ──────────────────────────────
  if (req.method === 'GET' && pn === '/api/dashboard/patients') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      jsonRes(res, 200, await getPatientsByDoctorCode(qs.doctorCode));
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/dashboard/patients ─────────────────────────────
  if (req.method === 'POST' && pn === '/api/dashboard/patients') {
    try {
      const body = await readBody(req);
      const { doctorCode, ...fields } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const patient = body.patient || fields;
      jsonRes(res, 200, { success: true, id: await savePatientRecord(doctorCode, patient) });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // ── PUT /api/dashboard/patients/:id ──────────────────────────
  if (req.method === 'PUT' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      const patientId = decodeURIComponent(pn.replace('/api/dashboard/patients/', ''));
      const body = await readBody(req);
      const { doctorCode, ...patientData } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const id = await savePatientRecord(doctorCode, { id: patientId, ...patientData });
      jsonRes(res, 200, { success: true, id });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // ── DELETE /api/dashboard/patients/:id ───────────────────────
  if (req.method === 'DELETE' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      await deletePatientRecord(decodeURIComponent(pn.replace('/api/dashboard/patients/', '')));
      jsonRes(res, 200, { success: true });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  if (req.method === 'POST' && pn === '/api/dashboard/remind') {
    try {
      const body = await readBody(req);
      jsonRes(res, 200, { success: true });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/login (з rate limiting) ────────────────────────
  if (req.method === 'POST' && pn === '/api/login') {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress
               || 'unknown';
      if (!checkRateLimit(ip)) {
        return jsonRes(res, 429, { ok: false, error: 'Забагато спроб. Спробуйте через 15 хвилин.' });
      }
      const { code, password } = await readBody(req);
      const doc = await getDoctor(code || '');
      if (doc && doc.password === password) {
        jsonRes(res, 200, { ok:true, name:doc.name||'', specialty:doc.specialty||'', clinic:doc.hospital||doc.clinic||'', code:doc.code });
      } else { jsonRes(res, 401, { ok: false }); }
    } catch(e) { jsonRes(res, 400, { error: 'bad json' }); }
    return;
  }

  if (req.method === 'POST' && pn === '/api/notify') {
    try {
      const { message } = await readBody(req);
      if (!BOT_TOKEN || !CHAT_ID) return jsonRes(res, 500, { error: 'bot not configured' });
      await send(CHAT_ID, message);
      jsonRes(res, 200, { ok: true });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  if (req.method === 'GET' && pn === '/api/patient/chatlog') {
    try {
      const { doctorCode, phone, email, name } = qs;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!phone && !email && !name) return jsonRes(res, 400, { error: 'phone, email or name required' });
      const sa = getServiceAccount();
      const token = await getAccessToken();
      const dc = doctorCode.toUpperCase();
      const base = `projects/${sa.project_id}/databases/(default)/documents`;
      let allDocs = [], pt = null;
      do {
        let url = `/v1/${base}/doctors/${dc}/sessions?pageSize=50`;
        if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
        const r = await httpsReq('GET', 'firestore.googleapis.com', url, { 'Authorization': `Bearer ${token}` });
        if (r.status !== 200) break;
        allDocs = allDocs.concat(r.body.documents || []);
        pt = r.body.nextPageToken || null;
      } while (pt);
      function parseChatHistory(fields) {
        if (!fields || !fields.chatHistory) return [];
        const arr = fields.chatHistory.arrayValue;
        if (!arr || !arr.values) return [];
        return arr.values.map(v => {
          const f = v.mapValue && v.mapValue.fields;
          if (!f) return null;
          return {
            role:    (f.role    && f.role.stringValue)    || '',
            content: (f.content && f.content.stringValue) || ''
          };
        }).filter(m => m && m.role && m.content);
      }
      const docs = allDocs.map(x => {
        const d = fromFirestore(x);
        d.chatHistory = parseChatHistory(x.fields);
        return d;
      });
      const normPhone = (phone || '').replace(/\D/g, '');
      const normName  = (name  || '').toLowerCase().trim().replace(/\s+/g, ' ');
      const matched = docs.filter(doc => {
        if (phone && normPhone) { const dp=(doc.phone||'').replace(/\D/g,''); if(dp&&dp===normPhone) return true; }
        if (email && doc.email && doc.email.toLowerCase()===email.toLowerCase()) return true;
        if (name && normName) {
          const dn=(doc.name||'').toLowerCase().trim().replace(/\s+/g,' ');
          if(normName.split(' ')[0]&&dn.split(' ')[0]&&normName.split(' ')[0]===dn.split(' ')[0]) return true;
          if(dn===normName) return true;
        }
        return false;
      });
      jsonRes(res, 200, matched.map(doc => ({
        id: doc._fsId, createdAt: doc.createdAt, summary: doc.summary||'',
        chatHistory: doc.chatHistory.filter(m =>
          m.content !== 'Почни опитування' && m.content !== 'Start the survey'
        )
      })));
    } catch(e) { console.error('[chatlog]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  const file = ROUTES[pn] || pn.replace(/^\//, '');
  const fp = path.join(__dirname, file);
  fs.stat(fp, (err, stat) => {
    if (!err && stat.isFile()) serveStatic(fp, res, req);
    else serveStatic(fp + '.html', res, req);
  });
}).listen(PORT, () => {
  console.log(`Nexum site :${PORT}`);
  try { const sa = getServiceAccount(); console.log(`Firebase: ${sa.project_id}`); }
  catch(e) { console.warn(`Firebase error: ${e.message}`); }
  if (GROQ_API_KEY) console.log('Groq AI ready');
  else console.warn('GROQ_API_KEY not set');
});
if (BOT_TOKEN && CHAT_ID) { poll(); console.log('Bot polling started'); }
else console.warn('Bot disabled');
