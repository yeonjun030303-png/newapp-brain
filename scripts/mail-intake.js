// 지메일 받은편지함에서 "앱 전용 주소(+app)"로 온 메일을 가져와 inbox/ 에 넣는다.
// 본문은 메모(md)로, 이미지 첨부는 그대로 저장한다. 이미 가져온 메일은 Message-ID로 건너뛴다.
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const USER = process.env.MAIL_USER;
const PASS = process.env.MAIL_PASS;
const TO = process.env.INTAKE_TO || '+app@';
const SEEN = 'requests/processed-mail.json';

(async () => {
  if (!USER || !PASS) { console.log('MAIL_USER/MAIL_PASS 없음: 메일 수집 건너뜀'); return; }
  const seen = fs.existsSync(SEEN) ? JSON.parse(fs.readFileSync(SEEN, 'utf8')) : [];
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let n = 0;
  try {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const uids = await client.search({ since, to: TO });
    for (const uid of uids || []) {
      const msg = await client.fetchOne(uid, { source: true });
      const mail = await simpleParser(msg.source);
      const id = mail.messageId || `uid-${uid}`;
      if (seen.includes(id)) continue;
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const body = (mail.text || '').trim();
      if (body || mail.subject) {
        fs.writeFileSync(path.join('inbox', `mail-${stamp}-${uid}.md`), `제목: ${mail.subject || ''}\n\n${body}\n`);
      }
      let k = 0;
      for (const a of mail.attachments || []) {
        if (/^image\/(png|jpe?g|webp)$/i.test(a.contentType)) {
          const ext = a.contentType.includes('png') ? 'png' : a.contentType.includes('webp') ? 'webp' : 'jpg';
          fs.writeFileSync(path.join('inbox', `mail-${stamp}-${uid}-${++k}.${ext}`), a.content);
        }
      }
      seen.push(id);
      n++;
    }
  } finally {
    lock.release();
    await client.logout();
  }
  fs.writeFileSync(SEEN, JSON.stringify(seen.slice(-500), null, 2));
  console.log('새 메일', n);
})().catch((e) => { console.error(e); process.exit(1); });
