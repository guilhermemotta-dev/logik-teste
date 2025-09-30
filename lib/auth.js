const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin';
const realm = 'Lead Manager Admin';

function getHeader(headers, name) {
  if (!headers) return undefined;
  const value = headers[name];
  if (value) return value;
  const lower = name.toLowerCase();
  return headers[lower];
}

function verifyAdminAuth(event) {
  const envUser = typeof process.env.ADMIN_USER === 'string' ? process.env.ADMIN_USER.trim() : '';
  const envPass = typeof process.env.ADMIN_PASS === 'string' ? process.env.ADMIN_PASS.trim() : '';

  const adminUser = envUser || DEFAULT_USERNAME;
  const adminPass = envPass || DEFAULT_PASSWORD;

  const header = getHeader(event.headers || {}, 'authorization');
  if (!header || !header.startsWith('Basic ')) {
    return {
      ok: false,
      statusCode: 401,
      message: 'Autenticação necessária.',
      headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }
    };
  }

  let credentials = '';
  try {
    credentials = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Cabeçalho de autenticação inválido.',
      headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }
    };
  }

  const separatorIndex = credentials.indexOf(':');
  if (separatorIndex === -1) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Cabeçalho de autenticação inválido.',
      headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }
    };
  }

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  if (username !== adminUser || password !== adminPass) {
    return {
      ok: false,
      statusCode: 401,
      message: 'Credenciais incorretas.',
      headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }
    };
  }

  return { ok: true };
}

module.exports = {
  verifyAdminAuth
};
