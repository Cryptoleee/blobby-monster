const config = require('./_config');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json(config);
  }
  res.status(405).json({ error: 'Method not allowed' });
};
