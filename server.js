const express = require('express');
const Database = require('better-sqlite3');
const UAParser = require('ua-parser-js');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

const db = new Database(process.env.DB_PATH || 'poll.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    admin_token TEXT UNIQUE NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    closes_at INTEGER NOT NULL,
    is_closed INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id TEXT NOT NULL,
    respondent_name TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    submitted_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    os_name TEXT,
    os_version TEXT,
    browser_name TEXT,
    browser_version TEXT,
    screen_width INTEGER,
    screen_height INTEGER
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function generateId(len) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function checkAndClose(poll) {
  if (!poll.is_closed && Date.now() > poll.closes_at) {
    db.prepare('UPDATE polls SET is_closed = 1 WHERE id = ?').run(poll.id);
    return { ...poll, is_closed: 1 };
  }
  return poll;
}

function isClosed(poll) {
  return poll.is_closed === 1 || Date.now() > poll.closes_at;
}

// Serve HTML shells for client-side routes
app.get('/p/:pollId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vote.html')));
app.get('/admin/:adminToken', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Create poll
app.post('/api/poll', (req, res) => {
  const { password, question, options, duration_minutes } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password' });
  if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });
  if (!Array.isArray(options) || options.filter(o => o?.trim()).length < 2)
    return res.status(400).json({ error: 'At least 2 options are required' });

  const id = generateId(6);
  const admin_token = generateId(40);
  const now = Date.now();
  const closes_at = now + Number(duration_minutes) * 60 * 1000;

  db.prepare(`INSERT INTO polls (id, admin_token, question, options, duration_minutes, created_at, closes_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, admin_token, question.trim(), JSON.stringify(options.filter(o => o?.trim())), Number(duration_minutes), now, closes_at);

  res.json({ poll_id: id, admin_token });
});

// Get poll info — for student view
app.get('/api/poll/:id', (req, res) => {
  let poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  poll = checkAndClose(poll);

  const closed = isClosed(poll);
  const options = JSON.parse(poll.options);
  const data = { question: poll.question, options, closes_at: poll.closes_at, is_closed: closed };

  if (closed) {
    const rows = db.prepare('SELECT option_index FROM responses WHERE poll_id = ?').all(poll.id);
    data.results = options.map((_, i) => rows.filter(r => r.option_index === i).length);
    data.total = rows.length;
  }

  res.json(data);
});

// Submit vote
app.post('/api/poll/:id/vote', (req, res) => {
  let poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  poll = checkAndClose(poll);
  if (isClosed(poll)) return res.status(400).json({ error: 'This poll has already closed.' });

  const { name, option_index, screen_width, screen_height } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Please enter your name' });
  if (option_index === undefined || option_index === null)
    return res.status(400).json({ error: 'Please select an option' });
  const options = JSON.parse(poll.options);
  if (option_index < 0 || option_index >= options.length)
    return res.status(400).json({ error: 'Invalid option' });

  const dup = db.prepare('SELECT id FROM responses WHERE poll_id = ? AND LOWER(respondent_name) = LOWER(?)').get(poll.id, name.trim());
  if (dup) return res.status(400).json({ error: 'A response has already been submitted with this name.' });

  const ua = req.headers['user-agent'] || '';
  const p = new UAParser(ua).getResult();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

  db.prepare(`INSERT INTO responses
    (poll_id, respondent_name, option_index, submitted_at, ip_address, user_agent, os_name, os_version, browser_name, browser_version, screen_width, screen_height)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(poll.id, name.trim(), option_index, Date.now(), ip, ua,
      p.os?.name || null, p.os?.version || null,
      p.browser?.name || null, p.browser?.version || null,
      screen_width || null, screen_height || null);

  res.json({ success: true });
});

// Admin — get full poll details
app.get('/api/admin/:token', (req, res) => {
  let poll = db.prepare('SELECT * FROM polls WHERE admin_token = ?').get(req.params.token);
  if (!poll) return res.status(404).json({ error: 'Not found' });
  poll = checkAndClose(poll);

  const options = JSON.parse(poll.options);
  const rows = db.prepare('SELECT * FROM responses WHERE poll_id = ? ORDER BY submitted_at').all(poll.id);

  res.json({
    id: poll.id,
    question: poll.question,
    options,
    closes_at: poll.closes_at,
    is_closed: isClosed(poll),
    total: rows.length,
    results: options.map((_, i) => rows.filter(r => r.option_index === i).length),
    responses: rows.map((r, i) => ({
      num: i + 1,
      name: r.respondent_name,
      option: options[r.option_index],
      option_index: r.option_index,
      submitted_at: r.submitted_at,
      os: [r.os_name, r.os_version].filter(Boolean).join(' ') || 'Unknown',
      browser: [r.browser_name, r.browser_version].filter(Boolean).join(' ') || 'Unknown',
      screen: r.screen_width ? `${r.screen_width}×${r.screen_height}` : '—',
      ip: r.ip_address || '—',
    })),
  });
});

// Admin — close poll
app.post('/api/admin/:token/close', (req, res) => {
  const result = db.prepare('UPDATE polls SET is_closed = 1 WHERE admin_token = ?').run(req.params.token);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`ClassPoll running on port ${PORT}`));
