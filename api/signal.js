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

function composite(closes) {
  const rsi       = calcRSI(closes);
  const e5        = emaArr(closes, 5);
  const e20       = emaArr(closes, 20);
  const { macd, sig } = calcMACD(closes);
  const { upper, lower } = calcBB(closes);
  const price     = closes[closes.length - 1];
  const ema5      = e5[e5.length - 1];
  const ema20     = e20[e20.length - 1];

  const rsiV  = rsi < 30 ? 1 : rsi > 70 ? -1 : 0;
  const macdV = macd > sig ? 1 : -1;
  const emaV  = ema5 > ema20 ? 1 : -1;
  const bbV   = price < lower ? 1 : price > upper ? -1 : 0;

  const score = rsiV + macdV + emaV + bbV;
  return {
    score,
    signal: score >= 2 ? 'UP' : score <= -2 ? 'DOWN' : 'WAIT',
    label:  score >= 2 ? '买涨 ↑' : score <= -2 ? '买跌 ↓' : '观望',
    votes:   { rsi: rsiV, macd: macdV, ema: emaV, bb: bbV },
    details: {
      rsi:      +rsi.toFixed(1),
      macdHist: +(macd - sig).toFixed(4),
      emaDir:   ema5 > ema20 ? 'EMA5↑' : 'EMA5↓',
      bbPos:    price < lower ? '触下轨' : price > upper ? '触上轨' : '轨内',
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const raw    = await fetchKlines();
    const closes = raw.map(k => parseFloat(k[4]));
    const price  = closes[closes.length - 1];
    const comp   = composite(closes);

    res.json({
      rsi:   comp.details.rsi,
      price: +price.toFixed(2),
      time:  Date.now(),
      comp,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
