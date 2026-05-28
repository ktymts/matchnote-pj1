// functions/api/players/index.js
// GET  /api/players?teamId=xxx — 選手一覧
// POST /api/players             — 選手登録

export async function onRequestGet({ request, env }) {
  const teamId = new URL(request.url).searchParams.get('teamId');
  if (!teamId) return json({ error: 'teamId が必要です' }, 400);

  const { results } = await env.DB
    .prepare('SELECT * FROM players WHERE team_id = ? ORDER BY jersey_number ASC')
    .bind(teamId)
    .all();
  return json({ players: results });
}

export async function onRequestPost({ request, env }) {
  const { teamId, jerseyNumber, displayName, preferredPosition } = await request.json().catch(() => ({}));

  if (!teamId || !jerseyNumber || !displayName)
    return json({ error: 'teamId / jerseyNumber / displayName が必要です' }, 400);

  const playerId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO players (player_id, team_id, jersey_number, display_name, preferred_position, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).bind(playerId, teamId, jerseyNumber, displayName, preferredPosition ?? null, now).run();

  return json({ playerId }, 201);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
