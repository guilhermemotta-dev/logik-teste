const STORAGE_KEY = 'lead-admin-auth';

export function getStoredCredentials() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.username && parsed.password) {
      return parsed;
    }
  } catch (error) {
    console.warn('Falha ao ler credenciais armazenadas', error);
  }
  return null;
}

export function saveCredentials(username, password) {
  const payload = { username, password };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearCredentials() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildAuthHeader(credentials) {
  if (!credentials) return null;
  const token = btoa(`${credentials.username}:${credentials.password}`);
  return `Basic ${token}`;
}
