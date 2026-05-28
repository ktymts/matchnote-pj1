// functions/_middleware.js
// すべての /api/* リクエストに適用される認証ミドルウェア

// 認証不要なエンドポイント
const PUBLIC = [
  { method: 'POST', path: '/api/auth' },   // ログイン
  { method: 'POST', path: '/api/teams' },  // チーム作成
];

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // /api/ 以外はスルー
  if (!url.pathname.startsWith('/api/')) return next();

  // GET リクエストは認証不要（読み取り専用）
  if (request.method === 'GET') return next();

  // 公開エンドポイントはスルー
  if (PUBLIC.some(p => p.method === request.method && url.pathname === p.path)) {
    return next();
  }

  // セッショントークン検証
  const token = request.headers.get('X-Session-Token');
  if (!token) return unauth('Unauthorized');

  const teamId = await env.SESSIONS.get(`session:${token}`);
  if (!teamId) return unauth('Session expired or invalid');

  return next();
}

function unauth(msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
  });
}
