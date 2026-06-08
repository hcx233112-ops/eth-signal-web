async function fetchKlines() {
  const resp = await fetch(
    'https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&count=60'
  );
  const data = await resp.json();
  if (data.error && data.error.length) throw new Error(data.error[0]);
  return data.result['XETHZUSD'];
}

function calcRSI(closes, p = 14) {
  const d = closes.slice(1).map((c, i) => c - closes[i]);
  const g = d.map(x => x > 0 ? x : 0);
  const l = d.map(x => x < 0 ? -x : 0);
  let ag = g.slice(0, p).reduce((a, b) => a + b) / p;
  let al = l.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < d.length; i++) {
    ag = (ag * (p - 1) + g[i]) / p;
    al = (al * (p - 1) + l[i]) / p;
  }
  return 100 - 100 / (1 + ag / (al || 1e-9));
}

function getSignal(rsi, lo, hi) {
  if (rsi < lo) return 'UP';
  if (rsi > hi) return 'DOWN';
  return 'WAIT';
}

async function bark(title, body) {
  const key = process.env.BARK_KEY;
  await fetch(`https://api.day.app/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?sound=minuet&level=active`);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const raw     = await fetchKlines();
    const closes  = raw.map(k => parseFloat(k[4]));
    const rsiNow  = calcRSI(closes);
    const rsiPrev = calcRSI(closes.slice(0, -1));

    const pushed = [];

    const s1Now  = getSignal(rsiNow,  25, 75);
    const s1Prev = getSignal(rsiPrev, 25, 75);
    if (s1Prev === 'WAIT' && s1Now !== 'WAIT') {
      await bark(
        s1Now === 'UP' ? '买涨 ↑ RSI25/75' : '买跌 ↓ RSI25/75',
        `RSI ${rsiNow.toFixed(1)} | 胜率 57.3%`
      );
      pushed.push(`s1:${s1Now}`);
    }

    const s2Now  = getSignal(rsiNow,  30, 70);
    const s2Prev = getSignal(rsiPrev, 30, 70);
    if (s2Prev === 'WAIT' && s2Now !== 'WAIT') {
      await bark(
        s2Now === 'UP' ? '买涨 ↑ RSI30/70' : '买跌 ↓ RSI30/70',
        `RSI ${rsiNow.toFixed(1)} | 胜率 56.2%`
      );
      pushed.push(`s2:${s2Now}`);
    }

    res.json({ rsiNow: +rsiNow.toFixed(1), rsiPrev: +rsiPrev.toFixed(1), pushed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
