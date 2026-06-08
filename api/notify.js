export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { signal, price, rsi, level } = req.query;
  const key = process.env.BARK_KEY;
  if (!key) return res.status(500).json({ error: 'no bark key' });

  const title = signal === 'UP' ? '脚本已完成1' : '脚本已完成2';
  const body  = `RSI ${rsi} | ${level}`;
  const url   = `https://api.day.app/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?sound=minuet&level=active`;

  try {
    await fetch(url);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
