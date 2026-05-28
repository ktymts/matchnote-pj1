// functions/api/matches/[matchId].js
// GET    /api/matches/:matchId — 試合詳細
// PUT    /api/matches/:matchId — 試合更新（ステータス・スコア）
// DELETE /api/matches/:matchId — 試合削除

export async function onRequestGet({ env, params }) {
  const match = await env.DB
    .prepare('SELECT * FROM matches WHERE match_id = ?')
    .bind(params.matchId)
    .first();
  if (!match) return json({ error: 'Not found' }, 404);
  return json({ match });
}

export async function onRequestPut({ request, env, params }) {
  const body = await request.json().catch(() => ({}));

  // 'increment' 値を持つフィールドはインクリメント処理
  const incrementFields = Object.entries(body)
    .filter(([, v]) => v === 'increment')
    .map(([k]) => k);

  const setFields = Object.entries(body)
    .filter(([, v]) => v !== 'increment')
    .filter(([k]) => ['status','first_half_home','first_half_away','second_half_home','second_half_away','half_minutes'].includes(k));

  if (!setFields.length && !incrementFields.length)
    return json({ error: '更新フィールドがありません' }, 400);

  // 通常フィールドの更新
  if (setFields.length) {
    const sets = setFields.map(([k]) => `${k} = ?`).join(', ');
    const vals = setFields.map(([, v]) => v);
    vals.push(params.matchId);
    await env.DB.prepare(`UPDATE matches SET ${sets} WHERE match_id = ?`).bind(...vals).run();
  }

  // インクリメントフィールドの更新
  for (const field of incrementFields) {
    await env.DB
      .prepare(`UPDATE matches SET ${field} = ${field} + 1 WHERE match_id = ?`)
      .bind(params.matchId)
      .run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare('DELETE FROM events  WHERE match_id = ?').bind(params.matchId).run();
  await env.DB.prepare('DELETE FROM matches WHERE match_id = ?').bind(params.matchId).run();
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
