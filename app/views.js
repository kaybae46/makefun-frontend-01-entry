// The four surfaces, each a function from API data to HTML. Every value from
// the API is escaped before it reaches the page.

import { date, esc, money, plural, relTime, timeLeft, accepting } from './format.js';
import { imageUrl } from './api.js';

/** The reward as it stands now: the prize plus any entry fees paid into it. */
const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** The entry fee, when the bounty charges one. */
const fee = (b) => (b.entryFeeUsd ? `${money(b.entryFeeUsd)} entry fee` : '');

/** One board row: title, live pot, fee, time left, entries. */
function boardRow(b) {
  const open = accepting(b);
  return `
      <li>
        <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
        <div class="meta">
          <span class="pot">${pot(b)}</span>
          ${b.entryFeeUsd ? `<span class="badge fee">${fee(b)}</span>` : ''}
          <span>${open ? timeLeft(b.deadline) : 'Closed — deadline passed'}</span>
          <span>${plural(b.submissionCount ?? 0, 'entry', 'entries')}</span>
          <span>${esc(b.category || '')}</span>
          <span class="badge${open ? '' : ' closed'}">${open ? 'Entries open' : 'Closed'}</span>
        </div>
      </li>`;
}

/** The board's rows for a search, sort and filter state, without the controls. */
export function boardList(data, state) {
  const q = (state.q || '').trim().toLowerCase();
  let items = (data.items || []).filter((b) => {
    if (state.openOnly && !accepting(b)) return false;
    if (!q) return true;
    return `${b.title} ${b.slug} ${b.category || ''}`.toLowerCase().includes(q);
  });
  const byClosing = (a, b) => new Date(a.deadline) - new Date(b.deadline);
  const byPot = (a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount);
  const byEntries = (a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0);
  const byNewest = (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  items = [...items].sort(
    state.sort === 'pot' ? byPot : state.sort === 'entries' ? byEntries : state.sort === 'newest' ? byNewest : byClosing,
  );
  if (!items.length) return '<p>No bounties match. Try clearing the search or the filter.</p>';
  return `<ul class="board">${items.map(boardRow).join('')}</ul>`;
}

/** The board: search, sort, filter, the rows, and a profile lookup. */
export function board(data, state) {
  const total = (data.items || []).length;
  return `
    <h1>Open bounties</h1>
    <div class="controls">
      <input type="search" id="q" placeholder="Search bounties…" aria-label="Search bounties" value="${esc(state.q || '')}">
      <select id="sort" aria-label="Sort bounties">
        <option value="closing"${state.sort === 'closing' ? ' selected' : ''}>Closing soon</option>
        <option value="pot"${state.sort === 'pot' ? ' selected' : ''}>Biggest pot</option>
        <option value="entries"${state.sort === 'entries' ? ' selected' : ''}>Most entries</option>
        <option value="newest"${state.sort === 'newest' ? ' selected' : ''}>Newest</option>
      </select>
      <label><input type="checkbox" id="open-only"${state.openOnly ? ' checked' : ''}> Entries open only</label>
    </div>
    <p class="count" id="board-count"></p>
    <div id="board-list">${boardList(data, state)}</div>
    <form class="lookup" id="lookup">
      <input id="lookup-handle" placeholder="Look up an account, e.g. kay-goblog" aria-label="Account handle">
      <button type="submit">View profile</button>
    </form>
    <p class="count">${total} ${total === 1 ? 'bounty' : 'bounties'} on the board. A bounty past its deadline takes no more entries, even while its status still reads open.</p>`;
}

/** The rewards table: each place and what it pays now (base prize plus its
 *  share of the entry fees paid in). The live amounts come from rewardsNow;
 *  the fallback is the base table in rewards, a { place: amount } map. */
function rewardsTable(b) {
  const now = b.rewardsNow;
  if (Array.isArray(now) && now.length) {
    return `
    <div class="scroll"><table>
      <thead><tr><th>Place</th><th class="num">Pays now</th><th class="num">Base</th><th class="num">Fee share</th></tr></thead>
      <tbody>${now
        .map(
          (r) => `<tr><td>${esc(r.place)}</td><td class="num">${money(r.amountUsd)}</td><td class="num">${money(r.baseUsd)}</td><td class="num">${money(r.feeShareUsd)}</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
  }
  const base = b.rewards;
  if (base && typeof base === 'object') {
    const rows = Object.entries(base).sort((a, c) => Number(a[0]) - Number(c[0]));
    if (rows.length) {
      return `
    <div class="scroll"><table>
      <thead><tr><th>Place</th><th class="num">Pays</th></tr></thead>
      <tbody>${rows.map(([place, amount]) => `<tr><td>${esc(place)}</td><td class="num">${money(amount)}</td></tr>`).join('')}</tbody>
    </table></div>`;
    }
  }
  return '<p>No rewards table published.</p>';
}

/** One bounty: summary, reward, dates, status, description, rules, rewards. */
export function bounty(b) {
  const open = accepting(b);
  return `
    <p><a href="#/">← All bounties</a></p>
    <h1>${esc(b.title)}</h1>
    <p>${esc(b.summary || '')}</p>
    <p><span class="badge${open ? '' : ' closed'}">${open ? 'Entries open' : 'Closed — deadline passed'}</span>
    <a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard →</a></p>
    <dl>
      <dt>Live pot</dt><dd>${pot(b)}</dd>
      <dt>Base reward</dt><dd>${money(b.rewardAmount)}</dd>
      ${b.entryFeeUsd ? `<dt>Entry fee</dt><dd>${money(b.entryFeeUsd)}</dd>` : ''}
      <dt>Deadline</dt><dd>${date(b.deadline)} (${timeLeft(b.deadline)})</dd>
      <dt>Entries</dt><dd>${plural(b.submissionCount ?? 0, 'entry', 'entries')}</dd>
      <dt>Category</dt><dd>${esc(b.category || '')}</dd>
      <dt>Status</dt><dd>${esc(b.status || '')}${open ? '' : ' (no longer accepting entries)'}</dd>
    </dl>
    <h2>Rewards</h2>
    ${rewardsTable(b)}
    <h2>Description</h2>
    <div class="description">${esc(b.description || '')}</div>
    ${b.rules ? `<details><summary>Full rules (${Math.round(String(b.rules).length / 1024)} KB)</summary><div class="rules">${esc(b.rules)}</div></details>` : ''}`;
}

/** A leaderboard row's judge win rate: the API stores it in micro units
 *  (956066 means 95.6%). */
function judgeRate(r) {
  const v = r.values?.judge ?? r.display?.judge ?? r.score ?? r.overall ?? r.rate;
  if (v == null || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${(n / 10000).toFixed(1)}%`;
}

/** The leaderboard's rows: rank, hunter, entry, judge win rate. */
export function leaderboardRows(items, shown) {
  return items
    .slice(0, shown)
    .map((r, i) => {
      const rank = r.rank ?? i + 1;
      const when = r.received_at || r.createdAt;
      return `<tr>
        <td class="num">${esc(rank)}</td>
        <td><a href="#/u/${encodeURIComponent(r.handle || '')}">${r.image ? `<img crossorigin="anonymous" class="avatar" src="${esc(imageUrl(r.image))}" alt="">` : ''}${esc(r.handle || '—')}</a>${r.house ? ' <span class="badge">house</span>' : ''}</td>
        <td>${esc(r.title || '')}<span class="sub">${r.status ? esc(r.status) : ''}${when ? ` · ${relTime(when)}` : ''}${r.prize_rank ? ` · prize #${esc(r.prize_rank)}` : ''}</span></td>
        <td class="num">${judgeRate(r) || '—'}</td>
      </tr>`;
    })
    .join('');
}

/** A bounty's leaderboard, 50 rows at a time. */
export function leaderboard(b, data) {
  const items = [...(data.entries || data.items || [])].sort((a, b2) => (a.rank ?? 1e9) - (b2.rank ?? 1e9));
  return `
    <p><a href="#/bounty/${encodeURIComponent(b.slug)}">← ${esc(b.title)}</a></p>
    <h1>Leaderboard: ${esc(b.title)}</h1>
    <p class="count">${plural(items.length, 'entry', 'entries')} ranked${data.title ? ` · ${esc(data.title)}` : ''}</p>
    ${items.length ? `<div class="scroll"><table>
      <thead><tr><th class="num">Rank</th><th>Hunter</th><th>Entry</th><th class="num">Judge win rate</th></tr></thead>
      <tbody id="lb-rows">${leaderboardRows(items, 50)}</tbody>
    </table></div>
    ${items.length > 50 ? `<button class="more" data-action="more" data-shown="50">Show more (${items.length - 50} left)</button>` : ''}` : '<p>No entries ranked yet.</p>'}`;
}

/** An account's public profile: picture, links, record, entries. */
export function profile(p) {
  const rec = p.record || {};
  const stat = (v, label) => `<div><b>${esc(v ?? '—')}</b><span>${label}</span></div>`;
  const links = [];
  if (p.github_login) links.push(`<a href="https://github.com/${encodeURIComponent(p.github_login)}">GitHub: ${esc(p.github_login)}</a>`);
  if (p.x?.url) links.push(`<a href="${esc(p.x.url)}">X: ${esc(p.x.username || p.x.name || '')}</a>`);
  if (p.discord?.url) links.push(`<a href="${esc(p.discord.url)}">Discord: ${esc(p.discord.username || '')}</a>`);
  if (p.wallet?.explorer_url) links.push(`<a href="${esc(p.wallet.explorer_url)}">Wallet ${esc((p.wallet.address || '').slice(0, 8))}…</a>`);
  const solutions = p.solutions || [];
  return `
    <p><a href="#/">← All bounties</a></p>
    <div class="profile-head">
      <img crossorigin="anonymous" src="https://make.fun/api/profiles/${encodeURIComponent(p.handle)}/picture.png" alt="Profile picture of ${esc(p.handle)}">
      <div>
        <h1>${esc(p.display_name || p.handle)}</h1>
        <p>@${esc(p.handle)}${p.joined_at ? ` · joined ${date(p.joined_at)}` : ''}</p>
      </div>
    </div>
    ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
    ${links.length ? `<p>${links.join(' · ')}</p>` : ''}
    <div class="stats">
      ${stat(rec.competitions_entered, 'entered')}
      ${stat(rec.competitions_placed, 'placed')}
      ${stat(rec.competitions_won, 'won')}
      ${stat(rec.podium_finishes, 'podiums')}
      ${stat(rec.best_placement, 'best place')}
      ${stat(rec.prize_usd != null ? money(rec.prize_usd) : null, 'prize money')}
    </div>
    <h2>Entries (${solutions.length})</h2>
    ${solutions.length ? `<ul class="board">${solutions
      .map(
        (s) => `<li><h2>${s.competition ? `<a href="#/bounty/${encodeURIComponent(s.competition.slug)}">${esc(s.competition.title)}</a>` : esc(s.title || '')}</h2>
        <div class="meta"><span>${esc(s.title || '')}</span>${s.place ? `<span>Placed ${esc(s.place)}</span>` : ''}${s.createdAt ? `<span>${relTime(s.createdAt)}</span>` : ''}</div></li>`,
      )
      .join('')}</ul>` : '<p>No entries yet.</p>'}
    ${p.payouts?.length ? `<h2>Payouts</h2><ul>${p.payouts.map((x) => `<li>${esc(money(x.amount_usd ?? x.amountUsd ?? 0))} — ${esc(x.competition?.title || '')}</li>`).join('')}</ul>` : ''}`;
}
