// functions/api/teams/index.js
// GET  /api/teams  — チーム一覧
// POST /api/teams  — チーム作成

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(pin + salt)
  );
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// GET: チーム一覧を返す（PIN ハッシュは除外）
export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT team_id, team_name, season, match_format, default_half_minutes, created_at FROM teams ORDER BY created_at DESC')
    .all();
  return json({ teams: results });
}

// POST: チームを作成してセッショントークンを返す
export async function onRequestPost({ request, env }) {
  const { name, season, halfMinutes, pin } = await request.json().catch(() => ({}));

  if (!name)             return json({ error: 'チーム名が必要です' }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN は 4 桁の数字です' }, 400);

  const salt = env.PIN_HASH_SALT ?? 'matchnote-default-salt';
  const pinHash = await hashPin(pin, salt);
  const teamId = crypto.randomUUID();
  const now    = Date.now();

  await env.DB.prepare(`
    INSERT INTO teams (team_id, team_name, season, default_half_minutes, edit_pin_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(teamId, name, season ?? String(new Date().getFullYear()), halfMinutes ?? 15, pinHash, now).run();

  // チーム作成者をそのままログイン状態にする
  const token = crypto.randomUUID();
  await env.SESSIONS.put(`session:${token}`, teamId, { expirationTtl: 60 * 60 * 24 });

  return json({ teamId, token }, 201);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
