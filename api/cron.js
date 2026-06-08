async function fetchKlines() {
  const resp = await fetch(
    'https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&count=200'
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

function emaArr(closes, p) {
  const k = 2 / (p + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] * k + out[i-1] * (1 - k));
  return out;
}

function calcMACD(closes) {
  const e12 = emaArr(closes, 12);
  const e26 = emaArr(closes, 26);
  const ml  = e12.map((v, i) => v - e26[i]);
  const sl  = emaArr(ml, 9);
  const n   = ml.length;
  return { macd: ml[n-1], sig: sl[n-1] };
}

function calcBB(closes, p = 20) {
  const sl   = closes.slice(-p);
  const mean = sl.reduce((a, b) => a + b) / p;
  const std  = Math.sqrt(sl.map(x => (x - mean) ** 2).reduce((a, b) => a + b) / p);
  return { upper: mean + 2 * std, lower: mean - 2 * std };
}

function getComposite(closes) {
  const rsi       = calcRSI(closes);
  const e5        = emaArr(closes, 5);
  const e20       = emaArr(closes, 20);
  const { macd, sig } = calcMACD(closes);
  const { upper, lower } = calcBB(closes);
  const price     = closes[closes.length - 1];

  const rsiV  = rsi < 30 ? 1 : rsi > 70 ? -1 : 0;
  const macdV = macd > sig ? 1 : -1;
  const emaV  = e5[e5.length - 1] > e20[e20.length - 1] ? 1 : -1;
  const bbV   = price < lower ? 1 : price > upper ? -1 : 0;

  const score = rsiV + macdV + emaV + bbV;
  return { signal: score >= 2 ? 'UP' : score <= -2 ? 'DOWN' : 'WAIT', score, rsi };
}

async function bark(signal, score, rsi) {
  const key   = process.env.BARK_KEY;
  const title = signal === 'UP' ? '买涨信号 ↑' : '买跌信号 ↓';
  const body  = `综合得分 ${score > 0 ? '+' : ''}${score} | RSI ${rsi.toFixed(1)}`;
  await fetch(`https://api.day.app/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?sound=minuet&level=active`);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const raw      = await fetchKlines();
    const allCloses = raw.map(k => parseFloat(k[4]));

    const now  = getComposite(allCloses);
    const prev = getComposite(allCloses.slice(0, -1));

    const pushed = [];
    if (prev.signal === 'WAIT' && now.signal !== 'WAIT') {
      await bark(now.signal, now.score, now.rsi);
      pushed.push(now.signal);
    }

    res.json({ now: now.signal, prev: prev.signal, score: now.score, pushed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
