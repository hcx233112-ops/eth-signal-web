// Kraken: [time, open, high, low, close, vwap, volume, count]
async function fetchKlines() {
  const resp = await fetch(
    'https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&count=60'
  );
  const data = await resp.json();
  if (data.error && data.error.length) throw new Error(data.error[0]);
  const bars = data.result['XETHZUSD'];
  return bars; // 已是旧→新顺序
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const raw = await fetchKlines();
    const closes = raw.map(k => parseFloat(k[4]));
    const price  = closes[closes.length - 1];
    const rsiVal = calcRSI(closes, 14);

    let signal, label;
    if (rsiVal < 25)      { signal = 'UP';   label = '买涨 ↑'; }
    else if (rsiVal > 75) { signal = 'DOWN'; label = '买跌 ↓'; }
    else                  { signal = 'WAIT'; label = '观望'; }

    res.json({ signal, label, rsi: +rsiVal.toFixed(1), price: +price.toFixed(2), time: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
