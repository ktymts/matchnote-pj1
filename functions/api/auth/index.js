// functions/api/auth/index.js
// POST  /api/auth  — PIN ログイン（セッション生成）
// DELETE /api/auth — ログアウト（セッション削除）

const SESSION_TTL = 60 * 60 * 24;  // 24 時間

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin + salt)
  );
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  const { teamId, pin } = await request.json().catch(() => ({}));

  if (!teamId || !pin) return json({ error: 'teamId と pin が必要です' }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN は 4 桁の数字です' }, 400);

  const team = await env.DB
    .prepare('SELECT edit_pin_hash FROM teams WHERE team_id = ?')
    .bind(teamId)
    .first();

  if (!team) return json({ error: 'チームが見つかりません' }, 404);

  const salt = env.PIN_HASH_SALT ?? 'matchnote-default-salt';
  const hash = await hashPin(pin, salt);

  if (hash !== team.edit_pin_hash) return json({ error: 'PIN が正しくありません' }, 401);

  const token = crypto.randomUUID();
  await env.SESSIONS.put(`session:${token}`, teamId, { expirationTtl: SESSION_TTL });

  return json({ token, teamId });
}

export async function onRequestDelete({ request, env }) {
  const token = request.headers.get('X-Session-Token');
  if (token) await env.SESSIONS.delete(`session:${token}`).catch(() => {});
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
