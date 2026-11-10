// Gemini 연결 점검: 키가 통하는지, 어떤 모델을 쓸 수 있는지 로그로 보여준다. (키는 출력하지 않는다)
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

(async () => {
  if (!KEY) { console.log('GEMINI_API_KEY 없음'); return; }
  try {
    const r = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': KEY }, signal: AbortSignal.timeout(30000) });
    console.log('모델 목록 HTTP', r.status);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.log(JSON.stringify(j).slice(0, 300)); return; }
    const names = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
      .filter((n) => /flash/.test(n));
    console.log('쓸 수 있는 flash 모델:', names.join(', ') || '(없음)');
    const t = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ok 라고만 답해' }] }] }),
      signal: AbortSignal.timeout(30000),
    });
    console.log(`${MODEL} 텍스트 호출 HTTP`, t.status);
  } catch (e) {
    console.log('연결 실패:', e.cause?.code || e.name);
  }
})();
