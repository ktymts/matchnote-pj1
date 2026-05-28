// functions/api/events/index.js
// GET  /api/events?matchId=xxx — イベント一覧（選手名 JOIN 付き）
// POST /api/events              — イベント記録

export async function onRequestGet({ request, env }) {
  const matchId = new URL(request.url).searchParams.get('matchId');
  if (!matchId) return json({ error: 'matchId が必要です' }, 400);

  const { results } = await env.DB.prepare(`
    SELECT
      e.*,
      sp.display_name  AS scorer_name,
      ap.display_name  AS assist_name,
      op.display_name  AS out_player_name,
      ip.display_name  AS in_player_name
    FROM events e
    LEFT JOIN players sp ON e.scorer_player_id = sp.player_id
    LEFT JOIN players ap ON e.assist_player_id  = ap.player_id
    LEFT JOIN players op ON e.out_player_id     = op.player_id
    LEFT JOIN players ip ON e.in_player_id      = ip.player_id
    WHERE e.match_id = ?
    ORDER BY e.created_at ASC
  `).bind(matchId).all();

  return json({ events: results });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { matchId, type, half, minute, scorerPlayerId, assistPlayerId, outPlayerId, inPlayerId } = body;

  const VALID_TYPES = ['goal', 'concede', 'substitution'];
  const VALID_HALVES = ['first', 'second'];

  if (!matchId || !type || !half)
    return json({ error: 'matchId / type / half が必要です' }, 400);
  if (!VALID_TYPES.includes(type))
    return json({ error: `type は ${VALID_TYPES.join(' / ')} のいずれか` }, 400);
  if (!VALID_HALVES.includes(half))
    return json({ error: `half は first / second のいずれか` }, 400);

  const eventId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO events
      (event_id, match_id, type, half, minute,
       scorer_player_id, assist_player_id, out_player_id, in_player_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, matchId, type, half, minute ?? null,
    scorerPlayerId ?? null, assistPlayerId ?? null,
    outPlayerId ?? null, inPlayerId ?? null, now
  ).run();

  return json({ eventId }, 201);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
