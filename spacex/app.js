(() => {
  'use strict';

  // SpaceX IPO: June 12, 2026, market open in NY (~9:30 ET = 13:30 UTC)
  const IPO_AT = new Date('2026-06-12T13:30:00-04:00').getTime();

  const POLYMARKET_URL = 'https://gamma-api.polymarket.com/events?slug=spacex-ipo-closing-market-cap';
  const REFRESH_MS = 5 * 60 * 1000;

  // SpaceX's targeted IPO valuation (trillions USD). Implied cap at/above this
  // => STONKS; below => NOT STONKS.
  const IPO_TARGET_T = 1.75;

  // bracket label patterns (Polymarket's full-sentence questions) -> midpoint (T USD)
  const BRACKETS = [
    { re: /less than \$?1\.0?T|^<\s*\$?1\.0?T/i,        mid: 0.75 },
    { re: /between \$?1\.0?T and \$?1\.5T/i,            mid: 1.25 },
    { re: /between \$?1\.5T and \$?2\.0?T/i,            mid: 1.75 },
    { re: /between \$?2\.0?T and \$?2\.5T/i,            mid: 2.25 },
    { re: /between \$?2\.5T and \$?3\.0?T/i,            mid: 2.75 },
    { re: /between \$?3\.0?T and \$?3\.5T/i,            mid: 3.25 },
    { re: /at least \$?3\.5T|(≥|>=|>)\s*\$?3\.5T/i,     mid: 3.75 },
  ];

  const $ = (id) => document.getElementById(id);
  const $days = $('days');
  const $label = $('label');
  const $cap = $('cap');
  const $memeLine = $('meme-line');
  const $capMeta = $('cap-meta');

  // ---- countdown ----
  function renderCountdown() {
    const ms = IPO_AT - Date.now();
    if (ms <= 0) {
      $days.textContent = '0';
      $label.textContent = "IT'S LIVE 🔔";
      return;
    }
    const days = Math.ceil(ms / 86400000);
    $days.textContent = days.toLocaleString();
    $label.textContent = days === 1 ? 'DAY' : 'DAYS';
  }
  renderCountdown();
  setInterval(renderCountdown, 60000);

  // ---- polymarket ----
  function parsePrices(raw) {
    if (Array.isArray(raw)) return raw.map(parseFloat);
    if (typeof raw === 'string') { try { return JSON.parse(raw).map(parseFloat); } catch { return null; } }
    return null;
  }

  async function fetchExpectedCap() {
    const r = await fetch(POLYMARKET_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const event = Array.isArray(data) && data[0];
    if (!event || !Array.isArray(event.markets)) throw new Error('no markets');

    let weighted = 0, probSum = 0;
    for (const m of event.markets) {
      const q = m.question || m.groupItemTitle || '';
      if (/no ipo/i.test(q)) continue;
      const prices = parsePrices(m.outcomePrices);
      if (!prices) continue;
      const b = BRACKETS.find((b) => b.re.test(q));
      if (!b) continue;
      weighted += prices[0] * b.mid;
      probSum += prices[0];
    }
    if (probSum <= 0) throw new Error('no recognized brackets');
    return weighted / probSum; // normalize across IPO outcomes
  }

  let lastFetchAt = null;

  function setStonks(isStonks) {
    document.body.classList.toggle('stonks', isStonks);
    document.body.classList.toggle('not-stonks', !isStonks);
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.floor(m / 60) + 'h ago';
  }

  function updateMeta() {
    $capMeta.textContent = lastFetchAt
      ? 'updated ' + timeAgo(lastFetchAt) + ' · refreshes every 5 min'
      : ' ';
  }

  function renderCap(cap) {
    const stonks = cap >= IPO_TARGET_T;
    $cap.classList.remove('err');
    $cap.textContent = '$' + cap.toFixed(2) + 'T';
    $memeLine.textContent = stonks ? 'STONKS  📈' : 'NOT STONKS  📉';
    setStonks(stonks);
    lastFetchAt = Date.now();
    updateMeta();
  }

  function renderError() {
    // never break the meme — keep the (default) stonks vibe, just say we're loading
    if (lastFetchAt) return; // already have a real value; keep it
    $memeLine.textContent = 'LOADING THE STONKS…  📈';
  }

  async function refresh() {
    try {
      renderCap(await fetchExpectedCap());
    } catch (e) {
      console.error('polymarket fetch failed:', e);
      renderError();
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(updateMeta, 30000);
})();
