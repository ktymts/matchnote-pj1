// ============================================================
// MatchNote — 少年サッカー8人制 試合記録・共有アプリ
// Cloudflare Pages + KV + D1  |  Vanilla JS SPA
// ============================================================

'use strict';

// ===== 状態管理 =============================================
const state = {
  sessionToken: localStorage.getItem('mn_token') || null,
  currentTeamId: localStorage.getItem('mn_team') || null,
};

function saveSession(token, teamId) {
  state.sessionToken = token;
  state.currentTeamId = teamId;
  localStorage.setItem('mn_token', token);
  localStorage.setItem('mn_team', teamId);
}

function clearSession() {
  state.sessionToken = null;
  localStorage.removeItem('mn_token');
}

// ===== API クライアント ======================================
const api = {
  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) {
      headers['X-Session-Token'] = state.sessionToken;
    }
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSession();
      throw new Error('UNAUTHORIZED');
    }
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  get:    (path)       => api.request('GET',    path),
  post:   (path, body) => api.request('POST',   path, body),
  put:    (path, body) => api.request('PUT',    path, body),
  delete: (path)       => api.request('DELETE', path),
};

// ===== DOM ユーティリティ ====================================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function render(html) {
  $('#app').innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

// ===== Toast & Modal ========================================
function showToast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function showModal(html) {
  $('#modal-content').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
  // 最初の入力フォームにフォーカス
  setTimeout(() => $('#modal-content input, #modal-content select')?.focus(), 100);
}

function hideModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
}

// モーダル外クリックで閉じる
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') hideModal();
});

// ===== PIN 認証 ==============================================
function requireAuth(teamId) {
  if (state.sessionToken) return Promise.resolve(true);

  return new Promise(resolve => {
    showModal(`
      <div class="pin-modal">
        <div class="pin-icon">🔐</div>
        <h3>編集 PIN を入力</h3>
        <p class="text-muted">このチームを編集するには PIN が必要です</p>
        <input type="password" id="pin-input" class="pin-input"
               placeholder="● ● ● ●" maxlength="4" inputmode="numeric" autocomplete="off">
        <div id="pin-error" class="error-msg hidden">PIN が正しくありません</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="pin-cancel">キャンセル</button>
          <button class="btn btn-primary"   id="pin-submit">ログイン</button>
        </div>
      </div>
    `);

    const input = $('#pin-input');

    $('#pin-cancel').addEventListener('click', () => { hideModal(); resolve(false); });

    async function tryLogin() {
      const pin = input.value.trim();
      if (!/^\d{4}$/.test(pin)) {
        $('#pin-error').textContent = '4 桁の数字を入力してください';
        $('#pin-error').classList.remove('hidden');
        return;
      }
      try {
        const res = await api.post('/auth', { teamId, pin });
        saveSession(res.token, teamId);
        hideModal();
        resolve(true);
      } catch {
        $('#pin-error').classList.remove('hidden');
        input.value = '';
        input.focus();
      }
    }

    $('#pin-submit').addEventListener('click', tryLogin);
    input.addEventListener('keypress', e => e.key === 'Enter' && tryLogin());
  });
}

// ===== ルーター ==============================================
const Router = {
  routes: [],

  on(pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'
    );
    this.routes.push({ regex, keys, handler });
  },

  navigate(path) {
    history.pushState(null, '', path);
    this._dispatch(path);
  },

  _dispatch(path) {
    for (const { regex, keys, handler } of this.routes) {
      const m = path.match(regex);
      if (m) {
        const params = {};
        keys.forEach((k, i) => params[k] = m[i + 1]);
        handler(params);
        return;
      }
    }
    render('<div class="container"><p class="error-msg">ページが見つかりません</p></div>');
  },

  init() {
    window.addEventListener('popstate', () => this._dispatch(location.pathname));
    this._dispatch(location.pathname);
  },
};

// ===== VIEW: ホーム ==========================================
async function viewHome() {
  render(`
    <header class="app-header">
      <div class="header-content">
        <h1 class="app-title">⚽ MatchNote</h1>
        <p class="app-subtitle">少年サッカー 試合記録</p>
      </div>
    </header>
    <main class="container">
      <div id="teams-list"><div class="spinner"></div></div>
      <button class="btn btn-primary btn-block mt-4" id="create-team-btn">
        ＋ チームを作成
      </button>
    </main>
  `);

  $('#create-team-btn').addEventListener('click', showCreateTeamModal);

  try {
    const { teams } = await api.get('/teams');
    renderTeamsList(teams);
  } catch {
    $('#teams-list').innerHTML = '<p class="error-msg">チームの読み込みに失敗しました</p>';
  }
}

function renderTeamsList(teams) {
  if (!teams?.length) {
    $('#teams-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏟️</div>
        <p>チームが登録されていません</p>
        <p class="text-muted">「チームを作成」から始めましょう</p>
      </div>`;
    return;
  }
  $('#teams-list').innerHTML = `
    <h2 class="section-title">チーム一覧</h2>
    <ul class="card-list">
      ${teams.map(t => `
        <li class="team-card" data-id="${t.team_id}">
          <div class="team-card-info">
            <span class="team-name">${escHtml(t.team_name)}</span>
            <span class="team-meta">${escHtml(t.season)} シーズン ／ ${t.default_half_minutes}分ハーフ</span>
          </div>
          <span class="chevron">›</span>
        </li>
      `).join('')}
    </ul>`;

  $$('.team-card').forEach(card =>
    card.addEventListener('click', () => {
      state.currentTeamId = card.dataset.id;
      localStorage.setItem('mn_team', card.dataset.id);
      Router.navigate(`/teams/${card.dataset.id}`);
    })
  );
}

function showCreateTeamModal() {
  const year = new Date().getFullYear();
  showModal(`
    <div class="form-modal">
      <h3>チームを作成</h3>
      <div class="form-group">
        <label>チーム名 <span class="required">*</span></label>
        <input type="text" id="f-team-name" class="input" placeholder="例: FC ひまわり U-10">
      </div>
      <div class="form-group">
        <label>シーズン</label>
        <input type="text" id="f-team-season" class="input" value="${year}">
      </div>
      <div class="form-group">
        <label>ハーフ時間（分）</label>
        <select id="f-half-min" class="input">
          <option value="10">10 分</option>
          <option value="12">12 分</option>
          <option value="15" selected>15 分</option>
          <option value="20">20 分</option>
          <option value="25">25 分</option>
        </select>
      </div>
      <div class="form-group">
        <label>編集 PIN（4 桁）<span class="required">*</span></label>
        <input type="password" id="f-pin" class="input" placeholder="0000"
               maxlength="4" inputmode="numeric">
      </div>
      <div class="form-group">
        <label>編集 PIN（確認）<span class="required">*</span></label>
        <input type="password" id="f-pin2" class="input" placeholder="0000"
               maxlength="4" inputmode="numeric">
      </div>
      <div id="create-team-err" class="error-msg hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModal()">キャンセル</button>
        <button class="btn btn-primary" id="create-team-ok">作成する</button>
      </div>
    </div>
  `);

  $('#create-team-ok').addEventListener('click', async () => {
    const name  = $('#f-team-name').value.trim();
    const season = $('#f-team-season').value.trim() || String(year);
    const half  = parseInt($('#f-half-min').value);
    const pin   = $('#f-pin').value;
    const pin2  = $('#f-pin2').value;
    const errEl = $('#create-team-err');

    if (!name)               return showErr('チーム名を入力してください');
    if (!/^\d{4}$/.test(pin)) return showErr('PIN は 4 桁の数字で入力してください');
    if (pin !== pin2)         return showErr('PIN が一致しません');

    function showErr(msg) { errEl.textContent = msg; errEl.classList.remove('hidden'); }

    try {
      const res = await api.post('/teams', { name, season, halfMinutes: half, pin });
      saveSession(res.token, res.teamId);
      hideModal();
      Router.navigate(`/teams/${res.teamId}`);
    } catch (e) {
      showErr('作成に失敗しました: ' + e.message);
    }
  });
}

// ===== VIEW: チームダッシュボード ===========================
async function viewTeam({ teamId }) {
  state.currentTeamId = teamId;
  localStorage.setItem('mn_team', teamId);

  render(`
    <header class="app-header">
      <button class="btn-back" id="back-btn">‹</button>
      <h1 class="app-title" id="team-title">読み込み中...</h1>
      <button class="btn-icon" id="logout-btn" title="ログアウト">🔓</button>
    </header>
    <nav class="tab-nav">
      <button class="tab active" data-tab="matches">試合</button>
      <button class="tab" data-tab="players">選手</button>
    </nav>
    <main class="container" id="tab-body"><div class="spinner"></div></main>
  `);

  $('#back-btn').addEventListener('click', () => Router.navigate('/'));
  $('#logout-btn').addEventListener('click', async () => {
    if (!confirm('ログアウトしますか？')) return;
    try { await api.delete('/auth'); } catch { /* ignore */ }
    clearSession();
    showToast('ログアウトしました');
  });

  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tab.dataset.tab === 'matches' ? renderMatchesTab(teamId) : renderPlayersTab(teamId);
  }));

  try {
    const { team } = await api.get(`/teams/${teamId}`);
    $('#team-title').textContent = team.team_name;
    renderMatchesTab(teamId);
  } catch {
    render('<div class="container"><p class="error-msg">チームが見つかりません</p></div>');
  }
}

// --- 試合タブ ---
async function renderMatchesTab(teamId) {
  $('#tab-body').innerHTML = `
    <button class="btn btn-primary btn-block mb-3" id="add-match-btn">＋ 試合を登録</button>
    <div id="matches-area"><div class="spinner"></div></div>
  `;
  $('#add-match-btn').addEventListener('click', () => showCreateMatchModal(teamId));
  try {
    const { matches } = await api.get(`/matches?teamId=${teamId}`);
    renderMatchesList(matches);
  } catch {
    $('#matches-area').innerHTML = '<p class="error-msg">試合の読み込みに失敗しました</p>';
  }
}

function renderMatchesList(matches) {
  if (!matches?.length) {
    $('#matches-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>試合が登録されていません</p>
      </div>`;
    return;
  }

  const STATUS_LABEL = { scheduled: '予定', first_half: '前半', halftime: 'HT', second_half: '後半', finished: '終了' };
  const STATUS_CLS   = { scheduled: '', first_half: 'live', halftime: 'live', second_half: 'live', finished: 'done' };

  $('#matches-area').innerHTML = `
    <ul class="card-list">
      ${matches.map(m => {
        const home = m.first_half_home + m.second_half_home;
        const away = m.first_half_away + m.second_half_away;
        return `
          <li class="match-card ${STATUS_CLS[m.status]}" data-id="${m.match_id}">
            <div class="match-left">
              <span class="match-date">${formatDate(m.date)}</span>
              <span class="match-vs">vs ${escHtml(m.opponent)}</span>
              ${m.competition ? `<span class="match-comp">${escHtml(m.competition)}</span>` : ''}
            </div>
            <div class="match-right">
              ${m.status !== 'scheduled' ? `<span class="match-score">${home}–${away}</span>` : ''}
              <span class="status-badge">${STATUS_LABEL[m.status]}</span>
            </div>
          </li>`;
      }).join('')}
    </ul>`;

  $$('.match-card').forEach(card =>
    card.addEventListener('click', () => Router.navigate(`/matches/${card.dataset.id}`))
  );
}

function showCreateMatchModal(teamId) {
  const today = new Date().toISOString().slice(0, 10);
  showModal(`
    <div class="form-modal">
      <h3>試合を登録</h3>
      <div class="form-group">
        <label>日付 <span class="required">*</span></label>
        <input type="date" id="m-date" class="input" value="${today}">
      </div>
      <div class="form-group">
        <label>対戦相手 <span class="required">*</span></label>
        <input type="text" id="m-opp" class="input" placeholder="例: FC たんぽぽ">
      </div>
      <div class="form-group">
        <label>会場</label>
        <input type="text" id="m-venue" class="input" placeholder="例: 中央公園グラウンド">
      </div>
      <div class="form-group">
        <label>大会名</label>
        <input type="text" id="m-comp" class="input" placeholder="例: 市内リーグ 第3節">
      </div>
      <div class="form-group">
        <label>ハーフ時間（分）</label>
        <select id="m-half" class="input">
          <option value="10">10 分</option>
          <option value="12">12 分</option>
          <option value="15" selected>15 分</option>
          <option value="20">20 分</option>
          <option value="25">25 分</option>
        </select>
      </div>
      <div id="match-err" class="error-msg hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModal()">キャンセル</button>
        <button class="btn btn-primary" id="match-ok">登録する</button>
      </div>
    </div>
  `);

  $('#match-ok').addEventListener('click', async () => {
    const date = $('#m-date').value;
    const opp  = $('#m-opp').value.trim();
    const errEl = $('#match-err');

    if (!date || !opp) {
      errEl.textContent = '日付と対戦相手は必須です';
      errEl.classList.remove('hidden');
      return;
    }
    const authed = await requireAuth(teamId);
    if (!authed) return;

    try {
      const res = await api.post('/matches', {
        teamId, date, opponent: opp,
        venue:       $('#m-venue').value.trim() || null,
        competition: $('#m-comp').value.trim()  || null,
        halfMinutes: parseInt($('#m-half').value),
      });
      hideModal();
      Router.navigate(`/matches/${res.matchId}`);
    } catch (e) {
      errEl.textContent = '登録に失敗しました: ' + e.message;
      errEl.classList.remove('hidden');
    }
  });
}

// --- 選手タブ ---
async function renderPlayersTab(teamId) {
  $('#tab-body').innerHTML = `
    <button class="btn btn-primary btn-block mb-3" id="add-player-btn">＋ 選手を登録</button>
    <div id="players-area"><div class="spinner"></div></div>
  `;
  $('#add-player-btn').addEventListener('click', () => showAddPlayerModal(teamId));
  try {
    const { players } = await api.get(`/players?teamId=${teamId}`);
    renderPlayersList(players, teamId);
  } catch {
    $('#players-area').innerHTML = '<p class="error-msg">選手の読み込みに失敗しました</p>';
  }
}

function renderPlayersList(players, teamId) {
  if (!players?.length) {
    $('#players-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👕</div>
        <p>選手が登録されていません</p>
      </div>`;
    return;
  }

  const sorted = [...players].sort((a, b) => a.jersey_number - b.jersey_number);
  const POSITIONS = { GK: '🧤', DF: '🛡️', MF: '⚙️', FW: '⚡' };

  $('#players-area').innerHTML = `
    <ul class="card-list">
      ${sorted.map(p => `
        <li class="player-card ${p.active ? '' : 'inactive'}" data-id="${p.player_id}" data-team="${teamId}">
          <span class="jersey">${p.jersey_number}</span>
          <div class="player-info">
            <span class="player-name">${escHtml(p.display_name)}</span>
            ${p.preferred_position ? `<span class="player-pos">${POSITIONS[p.preferred_position] || ''} ${escHtml(p.preferred_position)}</span>` : ''}
          </div>
          <div class="player-actions">
            ${p.active
              ? `<button class="btn-sm btn-danger" data-action="deactivate">退団</button>`
              : `<button class="btn-sm btn-success" data-action="activate">復帰</button>`}
          </div>
        </li>
      `).join('')}
    </ul>`;

  $$('[data-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const card = btn.closest('.player-card');
      const pid = card.dataset.id;
      const active = btn.dataset.action === 'activate' ? 1 : 0;
      const authed = await requireAuth(teamId);
      if (!authed) return;
      try {
        await api.put(`/players/${pid}`, { active });
        renderPlayersTab(teamId);
      } catch { showToast('更新に失敗しました', 'error'); }
    });
  });
}

function showAddPlayerModal(teamId) {
  showModal(`
    <div class="form-modal">
      <h3>選手を登録</h3>
      <div class="form-group">
        <label>背番号 <span class="required">*</span></label>
        <input type="number" id="p-num" class="input" min="1" max="99" placeholder="例: 10">
      </div>
      <div class="form-group">
        <label>名前 <span class="required">*</span></label>
        <input type="text" id="p-name" class="input" placeholder="例: 山田 太郎">
      </div>
      <div class="form-group">
        <label>ポジション</label>
        <select id="p-pos" class="input">
          <option value="">— 未設定 —</option>
          <option value="GK">GK（ゴールキーパー）</option>
          <option value="DF">DF（ディフェンダー）</option>
          <option value="MF">MF（ミッドフィルダー）</option>
          <option value="FW">FW（フォワード）</option>
        </select>
      </div>
      <div id="player-err" class="error-msg hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModal()">キャンセル</button>
        <button class="btn btn-primary" id="player-ok">登録する</button>
      </div>
    </div>
  `);

  $('#player-ok').addEventListener('click', async () => {
    const num  = parseInt($('#p-num').value);
    const name = $('#p-name').value.trim();
    const errEl = $('#player-err');

    if (!num || num < 1)  { errEl.textContent = '背番号を入力してください'; errEl.classList.remove('hidden'); return; }
    if (!name)            { errEl.textContent = '名前を入力してください';   errEl.classList.remove('hidden'); return; }

    const authed = await requireAuth(teamId);
    if (!authed) return;

    try {
      await api.post('/players', {
        teamId, jerseyNumber: num, displayName: name,
        preferredPosition: $('#p-pos').value || null,
      });
      hideModal();
      showToast('選手を登録しました');
      renderPlayersTab(teamId);
    } catch (e) {
      errEl.textContent = '登録に失敗しました: ' + e.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== VIEW: 試合詳細 ========================================
async function viewMatch({ matchId }) {
  render(`
    <header class="app-header">
      <button class="btn-back" id="back-btn">‹</button>
      <h1 class="app-title">試合詳細</h1>
      <button class="btn-icon" id="share-btn" title="共有">📤</button>
    </header>
    <main class="container" id="match-body"><div class="spinner"></div></main>
  `);

  $('#back-btn').addEventListener('click', () =>
    state.currentTeamId ? Router.navigate(`/teams/${state.currentTeamId}`) : Router.navigate('/')
  );

  await loadMatchView(matchId);
}

async function loadMatchView(matchId) {
  try {
    const [mr, er] = await Promise.all([
      api.get(`/matches/${matchId}`),
      api.get(`/events?matchId=${matchId}`),
    ]);
    renderMatchBody(mr.match, er.events);
    $('#share-btn').onclick = () => showShareModal(mr.match, er.events);
  } catch {
    $('#match-body').innerHTML = '<p class="error-msg">試合が見つかりません</p>';
  }
}

function renderMatchBody(match, events) {
  const home = match.first_half_home + match.second_half_home;
  const away = match.first_half_away + match.second_half_away;
  const result = home > away ? '勝利' : home < away ? '敗北' : '引き分け';
  const resultCls = home > away ? 'win' : home < away ? 'lose' : 'draw';

  const STATUS = { scheduled: '試合前', first_half: '前半 進行中', halftime: 'ハーフタイム', second_half: '後半 進行中', finished: '試合終了' };

  const controlBtn = {
    scheduled:   { id: 'ctrl-btn', label: '▶ 前半開始',    nextStatus: 'first_half'  },
    first_half:  { id: 'ctrl-btn', label: '⏸ ハーフタイム', nextStatus: 'halftime'    },
    halftime:    { id: 'ctrl-btn', label: '▶ 後半開始',    nextStatus: 'second_half' },
    second_half: { id: 'ctrl-btn', label: '🏁 試合終了',    nextStatus: 'finished'    },
  }[match.status];

  $('#match-body').innerHTML = `
    <!-- スコアボード -->
    <div class="scoreboard">
      <div class="sb-teams">
        <span class="sb-team">自チーム</span>
        <span class="sb-score">${home} – ${away}</span>
        <span class="sb-team">${escHtml(match.opponent)}</span>
      </div>
      <div class="sb-halves">前半 ${match.first_half_home}–${match.first_half_away} ／ 後半 ${match.second_half_home}–${match.second_half_away}</div>
      <div class="sb-meta">${formatDate(match.date)}${match.venue ? ' ／ ' + escHtml(match.venue) : ''}</div>
      ${match.competition ? `<div class="sb-meta">${escHtml(match.competition)}</div>` : ''}
      <div class="sb-status">${STATUS[match.status]}</div>
      ${match.status === 'finished' ? `<div class="sb-result result-${resultCls}">${result}</div>` : ''}
    </div>

    <!-- 試合コントロール -->
    ${controlBtn ? `
    <div class="ctrl-area">
      <button class="btn btn-primary btn-block" id="ctrl-btn">${controlBtn.label}</button>
    </div>` : ''}

    <!-- イベント記録ボタン（試合中のみ） -->
    ${['first_half', 'halftime', 'second_half'].includes(match.status) ? `
    <div class="event-btns">
      <button class="btn btn-success" id="btn-goal">⚽ 得点</button>
      <button class="btn btn-danger"  id="btn-concede">🚨 失点</button>
      <button class="btn btn-warning" id="btn-sub">🔄 交代</button>
    </div>` : ''}

    <!-- イベントログ -->
    <div class="event-log">
      <h3 class="section-title">記録</h3>
      ${events.length === 0
        ? '<p class="text-muted">まだ記録がありません</p>'
        : `<ul class="event-list">${events.map(renderEventItem).join('')}</ul>`}
    </div>
  `;

  // コントロールボタン
  if (controlBtn) {
    $('#ctrl-btn').addEventListener('click', async () => {
      const authed = await requireAuth(match.team_id);
      if (!authed) return;
      try {
        await api.put(`/matches/${match.match_id}`, { status: controlBtn.nextStatus });
        showToast('更新しました');
        loadMatchView(match.match_id);
      } catch { showToast('更新に失敗しました', 'error'); }
    });
  }

  // イベント記録ボタン
  $('#btn-goal')?.addEventListener('click',    () => showEventModal(match, 'goal'));
  $('#btn-concede')?.addEventListener('click', () => showEventModal(match, 'concede'));
  $('#btn-sub')?.addEventListener('click',     () => showEventModal(match, 'substitution'));
}

function renderEventItem(ev) {
  const CFG = {
    goal:         { icon: '⚽', label: '得点',  cls: 'goal' },
    concede:      { icon: '🚨', label: '失点',  cls: 'concede' },
    substitution: { icon: '🔄', label: '交代',  cls: 'sub' },
  };
  const c = CFG[ev.type];
  const halfLabel = ev.half === 'first' ? '前半' : '後半';
  const min = ev.minute ? `${ev.minute}分` : '';

  let detail = '';
  if (ev.type === 'goal' && ev.scorer_name) {
    detail = escHtml(ev.scorer_name);
    if (ev.assist_name) detail += ` <span class="assist">▶ アシスト: ${escHtml(ev.assist_name)}</span>`;
  } else if (ev.type === 'substitution' && ev.out_player_name) {
    detail = `${escHtml(ev.out_player_name)} → ${escHtml(ev.in_player_name)}`;
  }

  return `
    <li class="event-item ev-${c.cls}">
      <span class="ev-icon">${c.icon}</span>
      <div class="ev-body">
        <span class="ev-label">${c.label}</span>
        <span class="ev-time">${halfLabel}${min ? ' ' + min : ''}</span>
        ${detail ? `<span class="ev-detail">${detail}</span>` : ''}
      </div>
    </li>`;
}

async function showEventModal(match, type) {
  const authed = await requireAuth(match.team_id);
  if (!authed) return;

  let players = [];
  try {
    const res = await api.get(`/players?teamId=${match.team_id}`);
    players = res.players.filter(p => p.active);
  } catch { /* ignore */ }

  const opts = players.map(p =>
    `<option value="${p.player_id}">#${p.jersey_number} ${escHtml(p.display_name)}</option>`
  ).join('');
  const emptyOpt = '<option value="">— 選択 —</option>';
  const halfOpts = `
    <option value="first"  ${match.status === 'first_half'  ? 'selected' : ''}>前半</option>
    <option value="second" ${match.status === 'second_half' ? 'selected' : ''}>後半</option>`;

  const TITLES = { goal: '⚽ 得点を記録', concede: '🚨 失点を記録', substitution: '🔄 交代を記録' };

  let fields = `
    <div class="form-group">
      <label>ハーフ</label>
      <select id="ev-half" class="input">${halfOpts}</select>
    </div>
    <div class="form-group">
      <label>分（任意）</label>
      <input type="number" id="ev-min" class="input" min="1" max="40" placeholder="例: 12">
    </div>`;

  if (type === 'goal') {
    fields = `
      <div class="form-group">
        <label>得点者</label>
        <select id="ev-scorer" class="input">${emptyOpt}${opts}</select>
      </div>
      <div class="form-group">
        <label>アシスト（任意）</label>
        <select id="ev-assist" class="input">${emptyOpt}${opts}</select>
      </div>` + fields;
  } else if (type === 'substitution') {
    fields = `
      <div class="form-group">
        <label>OUT（退く選手）<span class="required">*</span></label>
        <select id="ev-out" class="input">${emptyOpt}${opts}</select>
      </div>
      <div class="form-group">
        <label>IN（入る選手）<span class="required">*</span></label>
        <select id="ev-in" class="input">${emptyOpt}${opts}</select>
      </div>` + fields;
  }

  showModal(`
    <div class="form-modal">
      <h3>${TITLES[type]}</h3>
      ${fields}
      <div id="ev-err" class="error-msg hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModal()">キャンセル</button>
        <button class="btn btn-primary" id="ev-ok">記録する</button>
      </div>
    </div>
  `);

  $('#ev-ok').addEventListener('click', async () => {
    const half   = $('#ev-half').value;
    const minute = parseInt($('#ev-min')?.value) || null;
    const errEl  = $('#ev-err');

    const body = { matchId: match.match_id, type, half, minute };

    if (type === 'goal') {
      body.scorerPlayerId = $('#ev-scorer').value || null;
      body.assistPlayerId = $('#ev-assist').value || null;
    } else if (type === 'substitution') {
      body.outPlayerId = $('#ev-out').value;
      body.inPlayerId  = $('#ev-in').value;
      if (!body.outPlayerId || !body.inPlayerId) {
        errEl.textContent = 'OUT / IN 両方を選択してください';
        errEl.classList.remove('hidden');
        return;
      }
    }

    try {
      // スコア更新
      if (type === 'goal' || type === 'concede') {
        const field = type === 'goal'
          ? (half === 'first' ? 'first_half_home' : 'second_half_home')
          : (half === 'first' ? 'first_half_away' : 'second_half_away');
        await api.put(`/matches/${match.match_id}`, { [field]: 'increment' });
      }
      await api.post('/events', body);
      hideModal();
      showToast('記録しました');
      loadMatchView(match.match_id);
    } catch (e) {
      errEl.textContent = '記録に失敗しました: ' + e.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== 共有モーダル ==========================================
function showShareModal(match, events) {
  const home = match.first_half_home + match.second_half_home;
  const away = match.first_half_away + match.second_half_away;

  let text = `【試合結果】${formatDate(match.date)}\n`;
  if (match.competition) text += `${match.competition}\n`;
  text += `自チーム  ${home} – ${away}  ${match.opponent}\n`;
  text += `（前半 ${match.first_half_home}–${match.first_half_away} ／ 後半 ${match.second_half_home}–${match.second_half_away}）\n`;

  const goals = events.filter(e => e.type === 'goal');
  if (goals.length) {
    text += `\n⚽ 得点: ${goals.map(g => g.scorer_name || '不明').join('、')}\n`;
  }
  text += `\n▶ 詳細: ${location.origin}/matches/${match.match_id}`;

  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;

  showModal(`
    <div class="form-modal">
      <h3>📤 試合結果を共有</h3>
      <pre class="share-preview">${escHtml(text)}</pre>
      <a href="${lineUrl}" target="_blank" rel="noopener"
         class="btn btn-line btn-block mt-3">LINE で送る</a>
      <button class="btn btn-secondary btn-block mt-2" id="copy-btn">テキストをコピー</button>
      <button class="btn btn-outline btn-block mt-2" onclick="hideModal()">閉じる</button>
    </div>
  `);

  $('#copy-btn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    showToast('コピーしました');
  });
}

// ===== ルーティング登録 =====================================
Router.on('/',                viewHome);
Router.on('/teams/:teamId',   viewTeam);
Router.on('/matches/:matchId', viewMatch);

// ===== 起動 =================================================
Router.init();

// Service Worker 登録
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
