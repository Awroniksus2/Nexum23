// ══════════════════════════════════════════════════════════════════════
// ДОДАЙ ЦЕ В server.js або app.js
// Дозволяє лікарю вмикати/вимикати AI-режим для бота
// ══════════════════════════════════════════════════════════════════════

// Зберігаємо налаштування в пам'яті (або замінити на Firebase/DB)
const doctorSettings = {};  // { doctorCode: { aiMode: true/false, activeSurvey: 'cardio' } }

// GET /api/settings?doctorCode=XXX
app.get('/api/settings', (req, res) => {
  const { doctorCode } = req.query;
  if (!doctorCode) return res.status(400).json({ error: 'doctorCode required' });
  const settings = doctorSettings[doctorCode] || { aiMode: true };
  res.json(settings);
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const { doctorCode, aiMode, activeSurvey } = req.body;
  if (!doctorCode) return res.status(400).json({ error: 'doctorCode required' });
  doctorSettings[doctorCode] = {
    ...doctorSettings[doctorCode],
    ...(aiMode !== undefined && { aiMode }),
    ...(activeSurvey !== undefined && { activeSurvey }),
    updatedAt: new Date().toISOString()
  };
  res.json({ ok: true, settings: doctorSettings[doctorCode] });
});

// ══════════════════════════════════════════════════════════════════════
// У МІНІ-АПП (index.js / bot handler) — читай налаштування лікаря
// перед початком опитування:
// ══════════════════════════════════════════════════════════════════════

/*
async function getDoctorSettings(doctorCode) {
  try {
    const response = await fetch(`${SERVER_URL}/api/settings?doctorCode=${doctorCode}`);
    return await response.json();
  } catch {
    return { aiMode: true };
  }
}

// При старті сесії:
const settings = await getDoctorSettings(patient.doctorCode);

if (!settings.aiMode) {
  // ── РЕЖИМ КОНСТРУКТОРА (без AI) ──────────────────────────────
  // Завантажуємо питання лікаря
  const surveysResp = await fetch(`${SERVER_URL}/api/surveys?doctorCode=${patient.doctorCode}`);
  const surveys = await surveysResp.json();
  
  // Беремо перший активний сурвей (або той що вибраний)
  const surveyKey = settings.activeSurvey || Object.keys(surveys)[0];
  const survey = surveys[surveyKey];
  const questions = survey?.questions || [];
  
  // Задаємо питання по черзі (без AI)
  for (const q of questions) {
    await bot.sendMessage(chatId, q.text);
    // ... чекаємо відповідь
  }
} else {
  // ── РЕЖИМ AI (звичайний) ──────────────────────────────────────
  // Передаємо питання конструктора як контекст для AI
  const surveysResp = await fetch(`${SERVER_URL}/api/surveys?doctorCode=${patient.doctorCode}`);
  const surveys = await surveysResp.json();
  const allQuestions = Object.values(surveys)
    .flatMap(s => s.questions || [])
    .map(q => q.text)
    .join('\n');
    
  const systemPrompt = `Ти медичний асистент...
  
Питання від лікаря для цього пацієнта:
${allQuestions}

Адаптивно використовуй ці питання, але можеш задавати й додаткові.`;
  
  // ... запускаємо AI з цим промптом
}
*/
