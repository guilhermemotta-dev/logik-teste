const { handleApiRequest, CORS_HEADERS } = require('../lib/apiHandler');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).set(CORS_HEADERS).end();
    return;
  }

  try {
    const response = await handleApiRequest({
      method: req.method,
      path: req.url ? req.url.split('?')[0] : '/api/leads',
      headers: req.headers || {},
      query: req.query || {},
      body: req.body,
      pathPrefix: '/api'
    });

    res.status(response.statusCode);
    if (response.headers) {
      res.set(response.headers);
    }

    if (!response.body) {
      res.end();
      return;
    }

    res.send(response.body);
  } catch (error) {
    console.error('Erro inesperado no handler da Vercel:', error);
    res.status(500).set({
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.send(JSON.stringify({ message: 'Erro interno do servidor.' }));
  }
};
