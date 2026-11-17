// Boardwalk: the board of open bounties, a page for each, its leaderboard,
// and an account's public profile, on hash routes.
//
//   #/                          the board
//   #/bounty/<slug>             one bounty
//   #/bounty/<slug>/leaderboard its leaderboard
//   #/u/<handle>                one account's profile
//
// window.__shotReady is false while a page loads and true once its data is
// on screen, so a screenshot script knows when to capture.

import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { board, boardList, bounty, leaderboard, leaderboardRows, profile } from './views.js';
import { esc } from './format.js';

const app = document.getElementById('app');
let boardData = null;
let leaderboardItems = [];
const boardState = { q: '', sort: 'closing', openOnly: false };

function route() {
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/bounty\/([^/]+)\/leaderboard$/))) return { name: 'leaderboard', slug: decodeURIComponent(m[1]) };
  if ((m = hash.match(/^#\/bounty\/([^/]+)$/))) return { name: 'bounty', slug: decodeURIComponent(m[1]) };
  if ((m = hash.match(/^#\/u\/([^/]+)$/))) return { name: 'profile', handle: decodeURIComponent(m[1]) };
  return { name: 'board' };
}

async function render() {
  window.__shotReady = false;
  const r = route();
  app.innerHTML = '<p class="loading">Loading…</p>';
  try {
    if (r.name === 'bounty') {
      const b = await getBounty(r.slug);
      document.title = `${b.title} | Boardwalk`;
      app.innerHTML = bounty(b);
    } else if (r.name === 'leaderboard') {
      const [b, lb] = await Promise.all([getBounty(r.slug), getLeaderboard(r.slug)]);
      leaderboardItems = [...(lb.entries || lb.items || [])].sort((a, c) => (a.rank ?? 1e9) - (c.rank ?? 1e9));
      document.title = `Leaderboard: ${b.title} | Boardwalk`;
      app.innerHTML = leaderboard(b, lb);
    } else if (r.name === 'profile') {
      const p = await getProfile(r.handle);
      document.title = `${p.display_name || p.handle} | Boardwalk`;
      app.innerHTML = profile(p);
    } else {
      if (!boardData) boardData = await getBounties();
      document.title = 'Boardwalk — make.fun bounties';
      app.innerHTML = board(boardData, boardState);
      renderBoardList();
    }
  } catch (err) {
    document.title = 'Boardwalk — make.fun bounties';
    app.innerHTML = `<p class="error">Could not load this page: ${esc(err.message)}. <a href="#/">Back to the board</a></p>`;
  }
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

/** Re-render only the board's rows, so typing in the search keeps its focus. */
function renderBoardList() {
  const list = document.getElementById('board-list');
  const count = document.getElementById('board-count');
  if (!list || !boardData) return;
  list.innerHTML = boardList(boardData, boardState);
  if (count) {
    const shown = list.querySelectorAll('li').length;
    const total = (boardData.items || []).length;
    count.textContent = shown === total ? `${total} bounties` : `Showing ${shown} of ${total} bounties`;
  }
}

app.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    boardState.q = e.target.value;
    renderBoardList();
  }
});

app.addEventListener('change', (e) => {
  if (e.target.id === 'sort') {
    boardState.sort = e.target.value;
    renderBoardList();
  }
  if (e.target.id === 'open-only') {
    boardState.openOnly = e.target.checked;
    renderBoardList();
  }
});

app.addEventListener('submit', (e) => {
  if (e.target.id === 'lookup') {
    e.preventDefault();
    const h = document.getElementById('lookup-handle').value.trim();
    if (h) location.hash = `#/u/${encodeURIComponent(h)}`;
  }
});

app.addEventListener('click', (e) => {
  const more = e.target.closest('[data-action="more"]');
  if (!more) return;
  const shown = Number(more.dataset.shown || 50) + 50;
  const rows = document.getElementById('lb-rows');
  if (rows) rows.innerHTML = leaderboardRows(leaderboardItems, shown);
  more.dataset.shown = String(shown);
  if (shown >= leaderboardItems.length) {
    more.remove();
  } else {
    more.textContent = `Show more (${leaderboardItems.length - shown} left)`;
  }
});

// A hunter's avatar can fail to load (its host may be slow or unreachable);
// hide the broken image instead of showing a broken-image glyph. The error
// event does not bubble, so this listens in the capture phase.
app.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement) e.target.style.display = 'none';
}, true);

window.addEventListener('hashchange', render);
render();
