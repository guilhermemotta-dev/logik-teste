const { handleApiRequest, CORS_HEADERS } = require('../../lib/apiHandler');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  const rawBody = event.body;
  const body = event.isBase64Encoded && typeof rawBody === 'string'
    ? Buffer.from(rawBody, 'base64').toString('utf8')
    : rawBody;

  try {
    return await handleApiRequest({
      method: event.httpMethod,
      path: event.path || '',
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body,
      pathPrefix: '/.netlify/functions/api'
    });
  } catch (error) {
    console.error('Erro inesperado na função API:', error);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ message: 'Erro interno do servidor.' })
    };
  }
};
