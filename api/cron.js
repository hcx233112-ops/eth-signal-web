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

function getRSISignal(rsi, lo, hi) {
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
    const raw       = await fetchKlines();
    const allCloses = raw.map(k => parseFloat(k[4]));
    const rsiNow    = calcRSI(allCloses);
    const rsiPrev   = calcRSI(allCloses.slice(0, -1));

    const pushed = [];

    // RSI 25/75 — 高精度
    const s1Now  = getRSISignal(rsiNow,  25, 75);
    const s1Prev = getRSISignal(rsiPrev, 25, 75);
    if (s1Prev === 'WAIT' && s1Now !== 'WAIT') {
      await bark(
        s1Now === 'UP' ? '买涨 ↑ RSI25/75' : '买跌 ↓ RSI25/75',
        `RSI ${rsiNow.toFixed(1)} | 胜率 56.4%`
      );
      pushed.push(`s1:${s1Now}`);
    }

    // RSI 30/70 — 高频率
    const s2Now  = getRSISignal(rsiNow,  30, 70);
    const s2Prev = getRSISignal(rsiPrev, 30, 70);
    if (s2Prev === 'WAIT' && s2Now !== 'WAIT') {
      await bark(
        s2Now === 'UP' ? '买涨 ↑ RSI30/70' : '买跌 ↓ RSI30/70',
        `RSI ${rsiNow.toFixed(1)} | 胜率 56.0%`
      );
      pushed.push(`s2:${s2Now}`);
    }

    // 综合信号 (RSI + MACD + EMA + 布林带)
    const compNow  = getComposite(allCloses);
    const compPrev = getComposite(allCloses.slice(0, -1));
    if (compPrev.signal === 'WAIT' && compNow.signal !== 'WAIT') {
      await bark(
        compNow.signal === 'UP' ? '买涨 ↑ 综合信号' : '买跌 ↓ 综合信号',
        `得分 ${compNow.score > 0 ? '+' : ''}${compNow.score} | RSI ${rsiNow.toFixed(1)}`
      );
      pushed.push(`comp:${compNow.signal}`);
    }

    res.json({ rsiNow: +rsiNow.toFixed(1), rsiPrev: +rsiPrev.toFixed(1), pushed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
