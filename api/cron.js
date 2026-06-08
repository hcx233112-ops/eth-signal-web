// 对比前一根K线RSI，只在刚越过阈值时推送，无需存储状态
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

async function bark(signal, rsi, level) {
  const key   = process.env.BARK_KEY;
  const title = signal === 'UP' ? '脚本已完成1' : '脚本已完成2';
  const body  = `RSI ${rsi.toFixed(1)} | ${level}`;
  await fetch(`https://api.day.app/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?sound=minuet&level=active`);
}

export default async function handler(req, res) {
  // 可选：加 secret 防止外部随意调用
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const raw    = await fetchKlines();
    const closes = raw.map(k => parseFloat(k[4]));

    // 当前RSI用最后一根bar，前一根RSI去掉最后一个close
    const rsiNow  = calcRSI(closes);
    const rsiPrev = calcRSI(closes.slice(0, -1));

    const pushed = [];

    // RSI 25/75
    const s1Now  = getSignal(rsiNow,  25, 75);
    const s1Prev = getSignal(rsiPrev, 25, 75);
    if (s1Prev === 'WAIT' && s1Now !== 'WAIT') {
      await bark(s1Now, rsiNow, 'RSI25/75');
      pushed.push(`s1:${s1Now}`);
    }

    // RSI 30/70
    const s2Now  = getSignal(rsiNow,  30, 70);
    const s2Prev = getSignal(rsiPrev, 30, 70);
    if (s2Prev === 'WAIT' && s2Now !== 'WAIT') {
      await bark(s2Now, rsiNow, 'RSI30/70');
      pushed.push(`s2:${s2Now}`);
    }

    res.json({ rsiNow: +rsiNow.toFixed(1), rsiPrev: +rsiPrev.toFixed(1), pushed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
