'use strict';
const { publicConfig } = require('../lib/prompt');
const { loadOverrides } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { await loadOverrides(); } catch { /* fall back to journeys.json */ }
  res.status(200).json({ ...publicConfig(), requiresCode: Boolean(process.env.PILOT_CODE) });
};
