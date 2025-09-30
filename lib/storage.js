const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Generate a unique identifier for a lead.
 *
 * Netlify’s default Node runtime historically used older Node versions
 * (for example Node 14) which do not expose `crypto.randomUUID()`. When
 * running in that environment the previous implementation attempted to
 * call `crypto.randomUUID()` unconditionally. If that method doesn’t
 * exist Node will throw a `TypeError: crypto.randomUUID is not a
 * function`, causing uncaught exceptions and resulting in HTTP 500
 * responses. To make the code robust across Node versions, we now
 * detect whether `randomUUID` is available. If it isn’t, we fall back to
 * generating a UUID‐like identifier using `crypto.randomBytes()`. This
 * fallback simply returns 32 hex characters (128 bits of entropy), which
 * is sufficient for the purpose of uniquely identifying leads.
 *
 * @returns {string} A randomly generated identifier.
 */
function generateId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Generate 16 random bytes and convert them to a hex string. The
  // resulting 32‑character string resembles a UUID without dashes. It’s
  // not a RFC4122 UUID but is unique enough for our use case.
  return crypto.randomBytes(16).toString('hex');
}

const TRACKING_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid'
];

const DEFAULT_DATA_FILE = path.resolve(__dirname, '../data/leads.json');
let dataFilePath = process.env.LEADS_STORAGE_FILE || DEFAULT_DATA_FILE;
let isFileStoragePrepared = false;
let blobStorePromise;

function isNetlify() {
  return String(process.env.NETLIFY).toLowerCase() === 'true';
}

async function getBlobStore() {
  if (!isNetlify()) {
    return null;
  }
  if (!blobStorePromise) {
    blobStorePromise = (async () => {
      try {
        const { getStore } = require('@netlify/blobs');
        return getStore({ name: process.env.NETLIFY_BLOB_STORE || 'leads' });
      } catch (error) {
        console.warn('Netlify Blob Store indisponível, usando armazenamento em arquivo.', error);
        return null;
      }
    })();
  }
  return blobStorePromise;
}

async function ensureFileInitialized(filePath, { seedFrom } = {}) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch (error) {
    let initialPayload = '[]\n';
    if (seedFrom) {
      try {
        const raw = await fs.readFile(seedFrom, 'utf8');
        if (raw.trim()) {
          initialPayload = raw.endsWith('\n') ? raw : `${raw}\n`;
        }
      } catch (seedError) {
        console.warn('Não foi possível ler o arquivo seed de leads.', seedError);
      }
    }
    await fs.writeFile(filePath, initialPayload, 'utf8');
  }
}

async function switchToFallbackFile() {
  const fallback = path.join(os.tmpdir(), 'leads.json');
  await ensureFileInitialized(fallback, { seedFrom: DEFAULT_DATA_FILE });
  dataFilePath = fallback;
  isFileStoragePrepared = true;
  return fallback;
}

async function prepareFileStorage() {
  // Return early if storage has already been prepared.
  if (isFileStoragePrepared) {
    return dataFilePath;
  }

  try {
    await ensureFileInitialized(dataFilePath);
    isFileStoragePrepared = true;
    return dataFilePath;
  } catch (error) {
    /*
     * In Netlify’s production environment the `/var/task` directory is read only
     * and attempting to create `/var/task/data` yields either `EACCES`,
     * `EROFS` or `ENOENT` depending on the platform.  To avoid the HTTP 500
     * observed in the logs, treat all of those errors as signals to switch
     * to the temporary directory when LEADS_STORAGE_FILE is not set.  The
     * fallback ensures we always have a writable location for leads.json.
     */
    const shouldFallback =
      !process.env.LEADS_STORAGE_FILE &&
      (error.code === 'EROFS' || error.code === 'EACCES' || error.code === 'ENOENT');
    if (shouldFallback) {
      await switchToFallbackFile();
      return dataFilePath;
    }
    throw error;
  }
}

async function readSeedData() {
  try {
    const raw = await fs.readFile(DEFAULT_DATA_FILE, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

async function readFromFileStorage() {
  const filePath = await prepareFileStorage();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Erro ao interpretar leads.json', error);
    return [];
  }
}

async function writeToFileStorage(leads) {
  const payload = JSON.stringify(leads, null, 2);
  let filePath = await prepareFileStorage();
  try {
    await fs.writeFile(filePath, `${payload}\n`, 'utf8');
  } catch (error) {
    // If writing fails due to read only or missing directories, switch to fallback file.
    const shouldFallback =
      !process.env.LEADS_STORAGE_FILE &&
      (error.code === 'EROFS' || error.code === 'EACCES' || error.code === 'ENOENT');
    if (shouldFallback) {
      filePath = await switchToFallbackFile();
      await fs.writeFile(filePath, `${payload}\n`, 'utf8');
      return;
    }
    throw error;
  }
}

async function readFromBlobStore(store) {
  try {
    const result = await store.get('leads.json', { type: 'json' });
    if (Array.isArray(result)) {
      return result;
    }
    if (result == null) {
      const seed = await readSeedData();
      await writeToBlobStore(store, seed);
      return seed;
    }
  } catch (error) {
    console.error('Erro ao ler leads do Netlify Blob Store', error);
  }
  return null;
}

async function writeToBlobStore(store, leads) {
  try {
    await store.set('leads.json', JSON.stringify(leads, null, 2), {
      contentType: 'application/json'
    });
  } catch (error) {
    console.error('Erro ao salvar leads no Netlify Blob Store', error);
    throw error;
  }
}

function normalizeLead(lead) {
  const tracking = lead.tracking || {};
  const normalizedTracking = {};
  for (const key of TRACKING_FIELDS) {
    normalizedTracking[key] = tracking[key] || '';
  }
  return { ...lead, tracking: normalizedTracking };
}

async function readLeadsRaw() {
  const store = await getBlobStore();
  if (store) {
    const blobData = await readFromBlobStore(store);
    if (Array.isArray(blobData)) {
      return blobData;
    }
  }
  return readFromFileStorage();
}

async function writeLeadsRaw(leads) {
  const store = await getBlobStore();
  if (store) {
    try {
      await writeToBlobStore(store, leads);
      return;
    } catch (error) {
      console.warn('Falha ao persistir no Blob Store, utilizando armazenamento em arquivo.');
    }
  }
  await writeToFileStorage(leads);
}

async function listLeads({ search } = {}) {
  const leads = (await readLeadsRaw()).map(normalizeLead);
  if (search) {
    const term = search.trim().toLowerCase();
    return leads
      .filter((lead) => {
        return (
          lead.name.toLowerCase().includes(term) ||
          lead.email.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getLeadById(id) {
  const leads = await readLeadsRaw();
  const lead = leads.find((item) => item.id === id);
  return lead ? normalizeLead(lead) : null;
}

function buildLead(payload) {
  const now = new Date().toISOString();
  return {
    // Use a wrapper around `crypto.randomUUID()` so that older Node
    // versions without this API don’t throw at runtime. See
    // generateId() above for details.
    id: generateId(),
    ...payload,
    tracking: TRACKING_FIELDS.reduce((acc, key) => {
      acc[key] = payload.tracking?.[key] || '';
      return acc;
    }, {}),
    createdAt: now,
    updatedAt: now
  };
}

async function createLead(payload) {
  const leads = await readLeadsRaw();
  const lead = buildLead(payload);
  leads.push(lead);
  await writeLeadsRaw(leads);
  return normalizeLead(lead);
}

async function updateLead(id, payload) {
  const leads = await readLeadsRaw();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) {
    return null;
  }
  const existing = leads[index];
  const updated = {
    ...existing,
    ...payload,
    tracking: {
      ...TRACKING_FIELDS.reduce((acc, key) => {
        acc[key] = existing.tracking?.[key] || '';
        return acc;
      }, {}),
      ...payload.tracking
    },
    updatedAt: new Date().toISOString()
  };
  leads[index] = updated;
  await writeLeadsRaw(leads);
  return normalizeLead(updated);
}

async function deleteLead(id) {
  const leads = await readLeadsRaw();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) {
    return false;
  }
  leads.splice(index, 1);
  await writeLeadsRaw(leads);
  return true;
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const str = String(value);
  if (!str) {
    return '';
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function leadsToCsv(leads) {
  const headers = [
    'id',
    'name',
    'email',
    'phone',
    'role',
    'birthDate',
    'message',
    'createdAt',
    'updatedAt',
    ...TRACKING_FIELDS
  ];

  const rows = leads.map((lead) => {
    return headers.map((key) => {
      if (TRACKING_FIELDS.includes(key)) {
        return escapeCsvValue(lead.tracking?.[key] || '');
      }
      return escapeCsvValue(lead[key]);
    });
  });

  const csvLines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((record) => record.join(','))
  ];

  return `${csvLines.join('\r\n')}\r\n`;
}

module.exports = {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  leadsToCsv,
  TRACKING_FIELDS
};
