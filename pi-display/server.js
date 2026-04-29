const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const RESONANT_API = process.env.RESONANT_API_URL || 'https://resonant-api-51dh.onrender.com';

app.use(express.static(path.join(__dirname, 'public')));

// Proxy GET /api/now-playing to the Resonant backend.
// The display page fetches from its own origin (localhost:8080) to avoid CORS.
app.get('/api/now-playing', async (req, res) => {
  try {
    const r = await fetch(`${RESONANT_API}/api/now-playing`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) { res.status(r.status).json({}); return; }
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(502).json({});
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Resonant display  →  http://localhost:${PORT}`);
  console.log(`Proxying API to   →  ${RESONANT_API}`);
});
