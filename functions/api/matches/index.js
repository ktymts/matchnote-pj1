// functions/api/matches/index.js
// GET  /api/matches?teamId=xxx — 試合一覧
// POST /api/matches             — 試合登録

export async function onRequestGet({ request, env }) {
  const teamId = new URL(request.url).searchParams.get('teamId');
  if (!teamId) return json({ error: 'teamId が必要です' }, 400);

  const { results } = await env.DB
    .prepare(`SELECT * FROM matches WHERE team_id = ? ORDER BY date DESC, created_at DESC`)
    .bind(teamId)
    .all();
  return json({ matches: results });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { teamId, date, opponent, venue, competition, halfMinutes } = body;

  if (!teamId || !date || !opponent)
    return json({ error: 'teamId / date / opponent が必要です' }, 400);

  const matchId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO matches
      (match_id, team_id, date, opponent, venue, competition, half_minutes, status,
       first_half_home, first_half_away, second_half_home, second_half_away, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, 0, 0, 0, ?)
  `).bind(matchId, teamId, date, opponent, venue ?? null, competition ?? null, halfMinutes ?? 15, now).run();

  return json({ matchId }, 201);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
