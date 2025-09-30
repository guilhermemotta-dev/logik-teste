import {
  getStoredCredentials,
  saveCredentials,
  clearCredentials,
  buildAuthHeader
} from './auth.js';

const params = new URLSearchParams(window.location.search);
const leadId = params.get('id');

const nameEl = document.getElementById('lead-name');
const createdEl = document.getElementById('lead-created');
const emailEl = document.getElementById('lead-email');
const phoneEl = document.getElementById('lead-phone');
const roleEl = document.getElementById('lead-role');
const birthEl = document.getElementById('lead-birth');
const messageEl = document.getElementById('lead-message');
const trackingEl = document.getElementById('lead-tracking');
const statusEl = document.getElementById('lead-status');
const refreshBtn = document.getElementById('refresh-lead');
const logoutBtn = document.getElementById('logout-btn');
const authDialog = document.getElementById('auth-dialog');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const cancelAuthBtn = document.getElementById('cancel-auth');

let credentials = getStoredCredentials();

function setCredentials(username, password) {
  credentials = saveCredentials(username, password);
}

function resetCredentials() {
  credentials = null;
  clearCredentials();
}

function openAuthDialog(reset = false) {
  if (reset) {
    resetCredentials();
  }
  authError.style.display = 'none';
  authError.textContent = '';
  if (!authDialog.open) {
    authForm.reset();
    authDialog.showModal();
  }
}

function closeAuthDialog() {
  if (authDialog.open) {
    authDialog.close();
  }
}

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.style.display = 'block';
}

function clearStatus() {
  statusEl.style.display = 'none';
  statusEl.textContent = '';
}

function renderTracking(tracking) {
  trackingEl.innerHTML = '';
  Object.entries(tracking || {}).forEach(([key, value]) => {
    const wrapper = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value || '-';
    wrapper.appendChild(dt);
    wrapper.appendChild(dd);
    trackingEl.appendChild(wrapper);
  });
}

function renderLead(lead) {
  nameEl.textContent = lead.name;
  document.title = `${lead.name} • Lead`;
  createdEl.textContent = `Criado em ${new Date(lead.createdAt).toLocaleString('pt-BR')}`;
  emailEl.textContent = lead.email;
  phoneEl.textContent = lead.phone;
  roleEl.textContent = lead.role;
  birthEl.textContent = new Date(lead.birthDate).toLocaleDateString('pt-BR');
  messageEl.textContent = lead.message;
  renderTracking(lead.tracking);
  clearStatus();
}

async function authorizedFetch(url, options = {}) {
  if (!credentials) {
    openAuthDialog();
    const error = new Error('Autenticação necessária.');
    error.authRequired = true;
    throw error;
  }

  const finalOptions = { ...options };
  finalOptions.headers = new Headers(options.headers || {});
  const authHeader = buildAuthHeader(credentials);
  finalOptions.headers.set('Authorization', authHeader);

  const response = await fetch(url, finalOptions);
  if (response.status === 401) {
    openAuthDialog(true);
    const error = new Error('Credenciais inválidas.');
    error.authRequired = true;
    throw error;
  }
  return response;
}

async function loadLead() {
  if (!leadId) {
    showStatus('ID do lead não informado.');
    return;
  }
  try {
    const response = await authorizedFetch(`/api/leads/${leadId}`);
    if (!response.ok) {
      throw new Error('Não foi possível carregar o lead.');
    }
    const data = await response.json();
    renderLead(data);
  } catch (error) {
    if (!error.authRequired) {
      console.error(error);
      showStatus(error.message || 'Erro ao carregar lead.');
    }
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = authForm.elements.username.value.trim();
  const password = authForm.elements.password.value;

  if (!username || !password) {
    authError.textContent = 'Informe usuário e senha.';
    authError.style.display = 'block';
    return;
  }

  try {
    const header = buildAuthHeader({ username, password });
    const response = await fetch('/api/leads', {
      headers: { Authorization: header }
    });
    if (response.status === 401) {
      throw new Error('Credenciais inválidas.');
    }
    if (!response.ok) {
      throw new Error('Não foi possível validar as credenciais.');
    }
    setCredentials(username, password);
    closeAuthDialog();
    await loadLead();
  } catch (error) {
    authError.textContent = error.message || 'Falha na autenticação.';
    authError.style.display = 'block';
  }
});

cancelAuthBtn.addEventListener('click', () => {
  closeAuthDialog();
});

refreshBtn.addEventListener('click', () => {
  loadLead();
});

logoutBtn.addEventListener('click', () => {
  resetCredentials();
  openAuthDialog();
});

if (!leadId) {
  showStatus('Lead não encontrado. Verifique o link utilizado.');
} else if (credentials) {
  loadLead().catch(() => {
    openAuthDialog(true);
  });
} else {
  openAuthDialog();
}
