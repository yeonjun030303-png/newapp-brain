// Gemini 연결 점검: 키가 통하는지, 후보 모델이 각각 지금 응답하는지 로그로 보여준다. (키는 출력하지 않는다)
const KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CANDIDATES = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'].filter(Boolean))];

(async () => {
  if (!KEY) { console.log('GEMINI_API_KEY 없음'); return; }
  try {
    const r = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': KEY }, signal: AbortSignal.timeout(30000) });
    console.log('모델 목록 HTTP', r.status);
  } catch (e) {
    console.log('연결 실패:', e.cause?.code || e.name);
    return;
  }
  for (const m of CANDIDATES) {
    try {
      const t = await fetch(`${BASE}/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ok 라고만 답해' }] }] }),
        signal: AbortSignal.timeout(20000),
      });
      console.log(`${m} 텍스트 호출 HTTP`, t.status);
    } catch (e) {
      console.log(`${m} 연결 실패:`, e.cause?.code || e.name);
    }
  }
})();
