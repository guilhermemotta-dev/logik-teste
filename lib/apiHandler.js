const { verifyAdminAuth } = require('./auth');
const {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  leadsToCsv
} = require('./storage');
const { validateLeadPayload } = require('./validation');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function emptyResponse(statusCode, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders
    },
    body: ''
  };
}

function parseBody(rawBody) {
  if (rawBody === undefined || rawBody === null || rawBody === '') {
    return {};
  }

  if (Buffer.isBuffer(rawBody)) {
    return parseBody(rawBody.toString('utf8'));
  }

  if (typeof rawBody === 'string') {
    try {
      return rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      return null;
    }
  }

  if (typeof rawBody === 'object') {
    return rawBody;
  }

  return null;
}

function getPathSegments(path = '', prefix = '') {
  const normalizedPath = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return normalizedPath.split('/').filter(Boolean);
}

function withAuth(headers, onAuthorized) {
  const auth = verifyAdminAuth({ headers });
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, { message: auth.message }, auth.headers);
  }
  return onAuthorized();
}

async function handleGet(request, segments) {
  if (segments.length === 1) {
    return withAuth(request.headers, async () => {
      const search = request.query.search;
      const leads = await listLeads({ search });
      return jsonResponse(200, leads);
    });
  }

  if (segments.length === 2 && segments[1] === 'export') {
    return withAuth(request.headers, async () => {
      const search = request.query.search;
      const leads = await listLeads({ search });
      const csv = leadsToCsv(leads);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="leads.csv"',
          ...CORS_HEADERS
        },
        body: csv
      };
    });
  }

  if (segments.length === 2) {
    return withAuth(request.headers, async () => {
      const id = segments[1];
      const lead = await getLeadById(id);
      if (!lead) {
        return jsonResponse(404, { message: 'Lead não encontrado.' });
      }
      return jsonResponse(200, lead);
    });
  }

  return jsonResponse(404, { message: 'Rota não encontrada.' });
}

async function handlePost(request, segments) {
  if (segments.length !== 1) {
    return jsonResponse(404, { message: 'Rota não encontrada.' });
  }

  const parsed = parseBody(request.body);
  if (parsed === null) {
    return jsonResponse(400, { message: 'JSON inválido.' });
  }

  const validation = validateLeadPayload(parsed);
  if (!validation.ok) {
    return jsonResponse(400, {
      message: 'Dados inválidos.',
      errors: validation.errors
    });
  }

  const lead = await createLead(validation.value);
  return jsonResponse(201, lead);
}

async function handlePut(request, segments) {
  if (segments.length !== 2) {
    return jsonResponse(404, { message: 'Rota não encontrada.' });
  }

  return withAuth(request.headers, async () => {
    const parsed = parseBody(request.body);
    if (parsed === null) {
      return jsonResponse(400, { message: 'JSON inválido.' });
    }

    const validation = validateLeadPayload(parsed);
    if (!validation.ok) {
      return jsonResponse(400, {
        message: 'Dados inválidos.',
        errors: validation.errors
      });
    }

    const id = segments[1];
    const lead = await updateLead(id, validation.value);
    if (!lead) {
      return jsonResponse(404, { message: 'Lead não encontrado.' });
    }

    return jsonResponse(200, lead);
  });
}

async function handleDelete(request, segments) {
  if (segments.length !== 2) {
    return jsonResponse(404, { message: 'Rota não encontrada.' });
  }

  return withAuth(request.headers, async () => {
    const id = segments[1];
    const removed = await deleteLead(id);
    if (!removed) {
      return jsonResponse(404, { message: 'Lead não encontrado.' });
    }

    return emptyResponse(204);
  });
}

async function handleApiRequest({ method, path, headers = {}, query = {}, body, pathPrefix = '' }) {
  let segments = getPathSegments(path, pathPrefix);

  if (segments[0] === 'api') {
    segments = segments.slice(1);
  }

  if (segments[0] !== 'leads') {
    return jsonResponse(404, { message: 'Rota não encontrada.' });
  }

  const request = { method, path, headers, query, body, pathPrefix };

  switch (method) {
    case 'GET':
      return handleGet(request, segments);
    case 'POST':
      return handlePost(request, segments);
    case 'PUT':
      return handlePut(request, segments);
    case 'DELETE':
      return handleDelete(request, segments);
    default:
      return jsonResponse(405, { message: 'Método não permitido.' });
  }
}

module.exports = {
  handleApiRequest,
  CORS_HEADERS,
  jsonResponse,
  emptyResponse
};
