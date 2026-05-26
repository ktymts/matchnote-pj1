// functions/api/matches.js
export async function onRequestGet({ env, params }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM matches WHERE team_id = ? ORDER BY date DESC'
  ).bind(params.teamId).all();

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const matchId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO matches (match_id, team_id, date, opponent, venue, competition,
      half_minutes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `).bind(
    matchId, body.teamId, body.date, body.opponent,
    body.venue ?? null, body.competition ?? null,
    body.halfMinutes ?? 15, now
  ).run();

  return new Response(JSON.stringify({ matchId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}
