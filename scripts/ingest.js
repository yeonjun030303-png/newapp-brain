// inbox/ 의 스크린샷(png/jpg/webp)과 메모(md/txt)를 읽어
// ideas/pool.json, requests/LOG.md, RESUME.md 를 갱신한다.
const fs = require('fs');
const path = require('path');

const KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(Boolean);
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const POOL = 'ideas/pool.json';
const LOG = 'requests/LOG.md';
const RESUME = 'RESUME.md';

const PROMPT = `너는 새 앱 아이템 발굴 보조야. 입력(스크린샷 또는 메모)에서 사업/서비스 아이디어를 뽑아줘.
기준: 고령화 시대 사람들을 위한 앱, 독점되지 않은 시장, 시장 규모가 큼, 구인자-구직자 같은 매칭 플랫폼 모델, 기기 연동이나 큰 자본이 필요 없음, 무료 도구로 개발 가능.
규칙: 원문 문장을 그대로 베끼지 말고 한국어로 짧게 요약해. 점수는 추정치다.
아이디어가 없으면 items를 빈 배열로 둬.
JSON만 출력:
{"items":[{"title":"짧은 이름","summary":"한 줄 요약","category":"분류","aging_fit":0-5,"platform_model":true|false,"needs_hardware_or_capital":true|false,"market_size_guess":0-5,"competition_guess":0-5,"risks":"법적/신뢰/운영 위험 한 줄"}]}
competition_guess는 5가 경쟁이 거의 없음, 0이 포화.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

async function callGemini(parts) {
  if (!KEYS.length) throw new Error('GEMINI_API_KEY 시크릿이 없습니다');
  let last = '';
  for (let i = 0; i < 6; i++) {
    const key = KEYS[i % KEYS.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (res.ok) {
      const j = await res.json();
      const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return JSON.parse(t.replace(/```json|```/g, '').trim());
    }
    last = String(res.status);
    if ([429, 500, 503].includes(res.status)) { await sleep(15000); continue; }
    throw new Error('Gemini ' + res.status + ' ' + (await res.text()).slice(0, 200));
  }
  throw new Error('Gemini 재시도 실패 ' + last);
}

const score = (x) =>
  (x.aging_fit || 0) * 2 + (x.platform_model ? 3 : 0) + (x.market_size_guess || 0) + (x.competition_guess || 0) - (x.needs_hardware_or_capital ? 5 : 0);

function renderTop(pool) {
  const top = [...pool.ideas].sort((a, b) => b.score - a.score).slice(0, 10);
  if (!top.length) return '(아직 없음. inbox에 스크린샷을 올리면 채워집니다)';
  return top.map((x, i) => `${i + 1}. **${x.title}** (점수 ${x.score}, ${x.verified ? '검증됨' : '미검증'}) - ${x.summary} / 위험: ${x.risks || '-'}`).join('\n');
}

(async () => {
  const pool = JSON.parse(fs.readFileSync(POOL, 'utf8'));
  const files = fs.readdirSync('inbox').filter((f) => /\.(png|jpe?g|webp|md|txt)$/i.test(f));
  if (!files.length) { console.log('inbox 비어 있음'); return; }
  const logLines = [];
  let added = 0;

  for (const f of files) {
    const p = path.join('inbox', f);
    const ext = path.extname(f).toLowerCase();
    let parts;
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      parts = [{ text: PROMPT }, { inlineData: { mimeType: mime, data: fs.readFileSync(p).toString('base64') } }];
    } else {
      const text = fs.readFileSync(p, 'utf8');
      logLines.push(`- ${today()} | 메모(${f}): ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
      parts = [{ text: PROMPT + '\n\n[메모]\n' + text }];
    }
    const out = await callGemini(parts);
    let n = 0;
    for (const it of out.items || []) {
      const key = norm(it.title);
      const found = pool.ideas.find((x) => norm(x.title) === key);
      if (found) { found.sources = [...new Set([...found.sources, f])]; continue; }
      pool.ideas.push({
        id: 'idea-' + (pool.ideas.length + 1), ...it, score: score(it),
        status: 'new', verified: false, sources: [f], added: today(),
      });
      n++;
    }
    added += n;
    logLines.push(`- ${today()} | inbox ${f} -> 새 아이디어 ${n}개`);
    fs.unlinkSync(p); // 원본은 저장소에 남기지 않는다(개인정보 보호)
  }

  pool.updated = today();
  fs.writeFileSync(POOL, JSON.stringify(pool, null, 2));
  if (logLines.length) fs.appendFileSync(LOG, logLines.join('\n') + '\n');

  let r = fs.readFileSync(RESUME, 'utf8');
  r = r.replace(/<!-- IDEAS:START -->[\s\S]*<!-- IDEAS:END -->/, `<!-- IDEAS:START -->\n${renderTop(pool)}\n<!-- IDEAS:END -->`);
  r = r.replace(/마지막 갱신:.*/, `마지막 갱신: ${today()} (봇 자동, 이번 새 아이디어 ${added}개)`);
  fs.writeFileSync(RESUME, r);
  console.log('처리한 파일', files.length, '새 아이디어', added);
})().catch((e) => { console.error(e); process.exit(1); });
