// functions/_middleware.js
// PIN認証が必要なエンドポイントの保護 (設計書 Section 10.2 参照)

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // 書き込み系エンドポイントのみ認証を要求
  if (request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    const sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // KV からセッションを検証
    const teamId = await env.SESSIONS.get(`session:${sessionToken}`);
    if (!teamId) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return next();
}
