// functions/api/players/[playerId].js
// PUT    /api/players/:playerId — 選手更新（active フラグ等）
// DELETE /api/players/:playerId — 選手削除

export async function onRequestPut({ request, env, params }) {
  const body = await request.json().catch(() => ({}));
  const allowed = ['jersey_number', 'display_name', 'preferred_position', 'active'];
  const fields  = Object.keys(body).filter(k => allowed.includes(k));

  if (!fields.length) return json({ error: '更新フィールドがありません' }, 400);

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => body[f]);
  vals.push(params.playerId);

  await env.DB.prepare(`UPDATE players SET ${sets} WHERE player_id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare('DELETE FROM players WHERE player_id = ?').bind(params.playerId).run();
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
