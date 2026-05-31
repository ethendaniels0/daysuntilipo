(() => {
  'use strict';

  // SpaceX IPO target: June 12, 2026, market open in NY (~9:30 ET = 13:30 UTC)
  const IPO_AT = new Date('2026-06-12T13:30:00-04:00').getTime();

  const POLYMARKET_URL = 'https://gamma-api.polymarket.com/events?slug=spacex-ipo-closing-market-cap';
  const REFRESH_MS = 5 * 60 * 1000;

  // SpaceX's targeted IPO valuation (trillions USD). Implied cap above this
  // => stonks background; below => not_stonks.
  const IPO_TARGET_T = 1.75;

  // bracket label patterns (match Polymarket's full-sentence questions)
  // -> midpoint in trillions (USD)
  const BRACKETS = [
    { re: /less than \$?1\.0?T|^<\s*\$?1\.0?T/i,        label: '< $1.0T',   mid: 0.75 },
    { re: /between \$?1\.0?T and \$?1\.5T/i,            label: '$1.0–1.5T', mid: 1.25 },
    { re: /between \$?1\.5T and \$?2\.0?T/i,            label: '$1.5–2.0T', mid: 1.75 },
    { re: /between \$?2\.0?T and \$?2\.5T/i,            label: '$2.0–2.5T', mid: 2.25 },
    { re: /between \$?2\.5T and \$?3\.0?T/i,            label: '$2.5–3.0T', mid: 2.75 },
    { re: /between \$?3\.0?T and \$?3\.5T/i,            label: '$3.0–3.5T', mid: 3.25 },
    { re: /at least \$?3\.5T|(≥|>=|>)\s*\$?3\.5T/i,     label: '≥ $3.5T',   mid: 3.75 },
  ];

  // ---- countdown ----
  const $days = document.getElementById('days');
  const $label = document.querySelector('.counter .label');

  function renderCountdown() {
    const now = Date.now();
    const ms = IPO_AT - now;
    if (ms <= 0) {
      $days.textContent = '0';
      $label.textContent = 'SPCX IS LIVE';
      $label.style.color = 'var(--green)';
      return;
    }
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    $days.textContent = days.toLocaleString();
    $label.textContent = days === 1 ? 'day until' : 'days until';
  }

  renderCountdown();
  // tick once a minute; nothing rendered finer than days
  setInterval(renderCountdown, 60 * 1000);

  // ---- polymarket ----
  const $cap = document.getElementById('cap');
  const $capSub = document.getElementById('cap-sub');
  const $capMeta = document.getElementById('cap-meta');
  const SUBTITLE = 'probability-weighted closing market cap via polymarket';

  function fmtTrillions(n) {
    // n in trillions of USD -> "$2.31T"
    return '$' + n.toFixed(2) + 'T';
  }

  function parseOutcomePrices(raw) {
    if (Array.isArray(raw)) return raw.map(parseFloat);
    if (typeof raw === 'string') {
      try { return JSON.parse(raw).map(parseFloat); } catch { return null; }
    }
    return null;
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h + 'h ago';
  }

  let lastFetchAt = null;

  async function fetchMarket() {
    const r = await fetch(POLYMARKET_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty event');
    const event = data[0];
    if (!Array.isArray(event.markets)) throw new Error('no markets');

    const rows = [];
    let weighted = 0;
    let probSum = 0;
    let noIpoProb = 0;

    for (const m of event.markets) {
      const q = m.question || m.groupItemTitle || '';
      const prices = parseOutcomePrices(m.outcomePrices);
      if (!prices) continue;
      const yes = prices[0];

      if (/no ipo/i.test(q)) { noIpoProb = yes; continue; }

      const b = BRACKETS.find(b => b.re.test(q));
      if (!b) continue;

      rows.push({ label: b.label, mid: b.mid, yes });
      weighted += yes * b.mid;
      probSum += yes;
    }

    if (!rows.length) throw new Error('no recognized brackets');

    const expected = weighted / probSum; // normalize across IPO outcomes
    rows.sort((a, b) => a.mid - b.mid);

    return { expected, rows, probSum, noIpoProb };
  }

  function renderMarket({ expected }) {
    $cap.textContent = '~' + fmtTrillions(expected);
    $capSub.textContent = SUBTITLE;

    const stonks = expected >= IPO_TARGET_T;
    document.body.classList.toggle('stonks', stonks);
    document.body.classList.toggle('not-stonks', !stonks);

    lastFetchAt = Date.now();
    updateMeta();
  }

  function renderError(msg) {
    $cap.innerHTML = '<span class="err">market data unavailable</span>';
    $capSub.textContent = msg || '';
  }

  function updateMeta() {
    if (!lastFetchAt) { $capMeta.textContent = ''; return; }
    $capMeta.textContent = 'updated ' + timeAgo(lastFetchAt) + ' · refreshes every 5 min';
  }

  async function refresh() {
    try {
      const data = await fetchMarket();
      renderMarket(data);
    } catch (e) {
      console.error('polymarket fetch failed:', e);
      if (!lastFetchAt) renderError(String(e.message || e));
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(updateMeta, 30 * 1000);
})();
