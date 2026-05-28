// functions/api/teams/[teamId].js
// GET /api/teams/:teamId — チーム詳細
// PUT /api/teams/:teamId — チーム更新

export async function onRequestGet({ env, params }) {
  const team = await env.DB
    .prepare('SELECT team_id, team_name, season, match_format, default_half_minutes, created_at FROM teams WHERE team_id = ?')
    .bind(params.teamId)
    .first();
  if (!team) return json({ error: 'Not found' }, 404);
  return json({ team });
}

export async function onRequestPut({ request, env, params }) {
  const body = await request.json().catch(() => ({}));
  const allowed = ['team_name', 'season', 'default_half_minutes'];
  const fields  = Object.keys(body).filter(k => allowed.includes(k));

  if (!fields.length) return json({ error: '更新フィールドがありません' }, 400);

  const sets  = fields.map(f => `${f} = ?`).join(', ');
  const vals  = fields.map(f => body[f]);
  vals.push(params.teamId);

  await env.DB.prepare(`UPDATE teams SET ${sets} WHERE team_id = ?`).bind(...vals).run();
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
