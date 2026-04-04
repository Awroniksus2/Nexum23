/**
 * ПАТЧ для server.js (nexum-site, чистий Node http)
 * ─────────────────────────────────────────────────
 * Змінюється тільки обробка /api/surveys (GET і POST).
 * Замість прямих запитів до Firestore REST API —
 * читаємо/пишемо з підколекції doctors/{code}/surveys/
 *
 * Решта файлу — БЕЗ ЗМІН.
 */

// ════════════════════════════════════════════════════════════════
// ЗМІНА 1: замінити блок GET /api/surveys
// ════════════════════════════════════════════════════════════════

// БУЛО:
if (req.method === 'GET' && pn === '/api/surveys') {
  try {
    if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
    const sa = getServiceAccount(); const token = await getAccessToken(); const dc = qs.doctorCode.toUpperCase();
    const r = await httpsReq('POST', 'firestore.googleapis.com',
      `/v1/projects/${sa.project_id}/databases/(default)/documents:runQuery`,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      { structuredQuery: { from:[{collectionId:'doctor_surveys'}], where:{fieldFilter:{field:{fieldPath:'doctorCode'},op:'EQUAL',value:{stringValue:dc}}}, limit:1 } });
    if (r.status !== 200 || !Array.isArray(r.body)) return jsonRes(res, 200, null);
    const hit = r.body.find(x => x.document);
    if (!hit) return jsonRes(res, 200, null);
    const doc = fromFirestore(hit.document);
    jsonRes(res, 200, { fsId: doc._fsId, surveys: doc.data ? JSON.parse(doc.data) : null });
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}

// СТАЛО:
if (req.method === 'GET' && pn === '/api/surveys') {
  try {
    if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
    const sa = getServiceAccount();
    const token = await getAccessToken();
    const dc = qs.doctorCode.toUpperCase();

    // Читаємо з підколекції doctors/{dc}/surveys — беремо перший документ
    const r = await httpsReq('GET', 'firestore.googleapis.com',
      `/v1/projects/${sa.project_id}/databases/(default)/documents/doctors/${dc}/surveys?pageSize=1`,
      { 'Authorization': `Bearer ${token}` });

    if (r.status !== 200 || !r.body.documents || !r.body.documents.length) {
      return jsonRes(res, 200, { surveys: null, fsId: null });
    }

    const doc = fromFirestore(r.body.documents[0]);
    let surveys = doc.surveys || doc.data || null;
    if (typeof surveys === 'string') {
      try { surveys = JSON.parse(surveys); } catch(_) {}
    }
    jsonRes(res, 200, { fsId: doc._fsId, surveys });
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}


// ════════════════════════════════════════════════════════════════
// ЗМІНА 2: замінити блок POST /api/surveys
// ════════════════════════════════════════════════════════════════

// БУЛО:
if (req.method === 'POST' && pn === '/api/surveys') {
  try {
    const body = await readBody(req);
    const { doctorCode, surveys: surveysData, fsId } = body;
    if (!doctorCode || !surveysData) return jsonRes(res, 400, { error: 'doctorCode and surveys required' });
    const sa = getServiceAccount(); const token = await getAccessToken();
    const dc = doctorCode.toUpperCase();
    const base = `projects/${sa.project_id}/databases/(default)/documents`;
    const now = new Date().toISOString();
    const fields = toFirestoreFields({ doctorCode: dc, data: JSON.stringify(surveysData), updatedAt: now });
    if (fsId) {
      const r = await httpsReq('PATCH', 'firestore.googleapis.com', `/v1/${base}/doctor_surveys/${fsId}`,
        { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, { fields });
      if (r.status !== 200) throw new Error('Update failed');
      jsonRes(res, 200, { success: true, fsId });
    } else {
      const r = await httpsReq('POST', 'firestore.googleapis.com', `/v1/${base}/doctor_surveys`,
        { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, { fields });
      if (r.status !== 200) throw new Error('Create failed');
      jsonRes(res, 200, { success: true, fsId: r.body.name?.split('/').pop() });
    }
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}

// СТАЛО:
if (req.method === 'POST' && pn === '/api/surveys') {
  try {
    const body = await readBody(req);
    const { doctorCode, surveys: surveysData, fsId } = body;
    if (!doctorCode || !surveysData) return jsonRes(res, 400, { error: 'doctorCode and surveys required' });
    const sa = getServiceAccount();
    const token = await getAccessToken();
    const dc = doctorCode.toUpperCase();
    const now = new Date().toISOString();

    // Зберігаємо в doctors/{dc}/surveys/
    const base = `projects/${sa.project_id}/databases/(default)/documents`;
    const surveysPath = `doctors/${dc}/surveys`;

    const fields = toFirestoreFields({
      doctorCode: dc,
      surveys: JSON.stringify(surveysData),  // зберігаємо як рядок (сумісність з fromFirestore)
      updatedAt: now
    });

    if (fsId) {
      // Оновлюємо існуючий документ
      const r = await httpsReq('PATCH', 'firestore.googleapis.com',
        `/v1/${base}/${surveysPath}/${fsId}`,
        { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        { fields });
      if (r.status !== 200) throw new Error('Survey update failed: ' + r.status);
      jsonRes(res, 200, { success: true, fsId });
    } else {
      // Перевіряємо чи є вже документ для цього лікаря
      const existing = await httpsReq('GET', 'firestore.googleapis.com',
        `/v1/${base}/${surveysPath}?pageSize=1`,
        { 'Authorization': `Bearer ${token}` });

      if (existing.status === 200 && existing.body.documents && existing.body.documents.length) {
        const existId = existing.body.documents[0].name.split('/').pop();
        const r = await httpsReq('PATCH', 'firestore.googleapis.com',
          `/v1/${base}/${surveysPath}/${existId}`,
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          { fields });
        if (r.status !== 200) throw new Error('Survey patch failed: ' + r.status);
        jsonRes(res, 200, { success: true, fsId: existId });
      } else {
        // Створюємо новий
        const r = await httpsReq('POST', 'firestore.googleapis.com',
          `/v1/${base}/${surveysPath}`,
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          { fields });
        if (r.status !== 200) throw new Error('Survey create failed: ' + r.status);
        jsonRes(res, 200, { success: true, fsId: r.body.name?.split('/').pop() });
      }
    }
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}


// ════════════════════════════════════════════════════════════════
// ЗМІНА 3: замінити блок GET /api/dashboard/patients
// ════════════════════════════════════════════════════════════════

// БУЛО:
if (req.method === 'GET' && pn === '/api/dashboard/patients') {
  try {
    if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
    jsonRes(res, 200, await getPatientsByDoctorCode(qs.doctorCode));
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}

// СТАЛО — функція getPatientsByDoctorCode вже оновлена нижче,
// роут залишається ІДЕНТИЧНИМ (нічого міняти не треба в роуті).
// Але треба оновити саму функцію getPatientsByDoctorCode:


// ════════════════════════════════════════════════════════════════
// ЗМІНА 4: замінити функцію getPatientsByDoctorCode
// ════════════════════════════════════════════════════════════════

// СТАЛА — читати з doctors/{dc}/patients замість dashboard_patients:
async function getPatientsByDoctorCode(doctorCode) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const dc = doctorCode.toUpperCase();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;

  // GET список документів з підколекції (без складних queries)
  let allDocs = [];
  let pageToken = null;

  do {
    let url = `/v1/${base}/doctors/${dc}/patients?pageSize=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const r = await httpsReq('GET', 'firestore.googleapis.com', url,
      { 'Authorization': `Bearer ${token}` });

    if (r.status !== 200) break;
    const docs = r.body.documents || [];
    allDocs = allDocs.concat(docs);
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
    const base = fromFirestore(doc);
    base.chatSessions = parseChatSessions(doc.fields);
    return { id: 'fb_' + doc.name.split('/').pop(), ...base };
  }).sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
}


// ════════════════════════════════════════════════════════════════
// ЗМІНА 5: замінити функцію savePatientRecord
// ════════════════════════════════════════════════════════════════

// Записуємо в doctors/{dc}/patients замість dashboard_patients:
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


// ════════════════════════════════════════════════════════════════
// ЗМІНА 6: замінити функцію deletePatientRecord
// ════════════════════════════════════════════════════════════════

async function deletePatientRecord(patientId) {
  const sa = getServiceAccount();
  const token = await getAccessToken();
  const base = `projects/${sa.project_id}/databases/(default)/documents`;

  // patientId може бути "fb_XXXX" або "fb_XXXX|DOC-1234"
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

  // Fallback: шукаємо серед усіх лікарів
  const doctorsR = await httpsReq('GET', 'firestore.googleapis.com',
    `/v1/${base}/doctors`,
    { 'Authorization': `Bearer ${token}` });

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
