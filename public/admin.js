import {
  getStoredCredentials,
  saveCredentials,
  clearCredentials,
  buildAuthHeader
} from './auth.js';

// ADICIONADO: Seletor para o layout principal
const adminLayout = document.querySelector('.admin-layout');

const leadsTable = document.getElementById('leads-table');
const leadsTableBody = leadsTable.querySelector('tbody');
const leadsEmpty = document.getElementById('leads-empty');
const searchInput = document.getElementById('search');
const exportBtn = document.getElementById('export-btn');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const createForm = document.getElementById('admin-create-form');
const statusEl = document.getElementById('admin-status');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const cancelEditBtn = document.getElementById('cancel-edit');
const rowTemplate = document.getElementById('lead-row-template');
const authDialog = document.getElementById('auth-dialog');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const cancelAuthBtn = document.getElementById('cancel-auth');

const today = new Date().toISOString().split('T')[0];
createForm.elements.birthDate.max = today;

let credentials = getStoredCredentials();
let cachedLeads = [];
let searchDebounce;

function showStatus(message, type = 'success') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3500);
}

function renderLeads() {
  leadsTableBody.innerHTML = '';
  if (!cachedLeads.length) {
    leadsEmpty.style.display = 'block';
    leadsTable.style.display = 'none';
    return;
  }
  leadsEmpty.style.display = 'none';
  leadsTable.style.display = 'table';

  cachedLeads.forEach((lead) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-field="name"]').textContent = lead.name;
    row.querySelector('[data-field="email"]').textContent = lead.email;
    row.querySelector('[data-field="phone"]').textContent = lead.phone;
    row
      .querySelector('[data-field="createdAt"]')
      .textContent = new Date(lead.createdAt).toLocaleString('pt-BR');

    row.querySelector('[data-action="view"]').addEventListener('click', () => {
      window.location.href = `/lead.html?id=${lead.id}`;
    });

    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      openEditModal(lead);
    });

    row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (confirm('Deseja realmente excluir este lead?')) {
        try {
          await deleteLead(lead.id);
        } catch (error) {
          handleError(error);
        }
      }
    });

    leadsTableBody.appendChild(row);
  });
}

function serializeForm(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  return payload;
}

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
    // ADICIONADO: Ocultar painel se a autenticação falhar
    adminLayout.style.display = 'none';
    openAuthDialog(true);
    const error = new Error('Credenciais inválidas.');
    error.authRequired = true;
    throw error;
  }

  return response;
}

async function fetchLeads(search = '') {
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const query = params.toString();
    const url = query ? `/api/leads?${query}` : '/api/leads';
    const response = await authorizedFetch(url);
    if (!response.ok) {
      throw new Error('Não foi possível carregar os leads.');
    }
    cachedLeads = await response.json();
    renderLeads();
  } catch (error) {
    handleError(error);
  }
}

async function deleteLead(id) {
  const response = await authorizedFetch(`/api/leads/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Não foi possível excluir o lead.');
  }
  cachedLeads = cachedLeads.filter((lead) => lead.id !== id);
  renderLeads();
  showStatus('Lead removido com sucesso.');
}

function populateTrackingFields(target, tracking) {
  const fields = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid'
  ];
  fields.forEach((field) => {
    if (target.elements[field]) {
      target.elements[field].value = tracking?.[field] || '';
    }
  });
}

function openEditModal(lead) {
  const form = editForm;
  form.elements.id.value = lead.id;
  form.elements.name.value = lead.name;
  form.elements.email.value = lead.email;
  form.elements.phone.value = lead.phone;
  form.elements.role.value = lead.role;
  form.elements.birthDate.value = lead.birthDate;
  form.elements.birthDate.max = today;
  form.elements.message.value = lead.message;
  populateTrackingFields(form, lead.tracking);
  editDialog.showModal();
}

function updateLeadInCache(updatedLead) {
  cachedLeads = cachedLeads
    .map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderLeads();
}

function handleError(error) {
  if (error?.authRequired) {
    return;
  }
  console.error(error);
  alert(error.message || 'Ocorreu um erro inesperado.');
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.style.display = 'none';

  if (!createForm.checkValidity()) {
    showStatus('Verifique os campos obrigatórios antes de salvar.', 'error');
    return;
  }

  const payload = serializeForm(createForm);

  try {
    const response = await authorizedFetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Erro ao criar lead.');
    }

    cachedLeads = [data, ...cachedLeads];
    renderLeads();
    createForm.reset();
    createForm.elements.birthDate.max = today;
    showStatus('Lead criado com sucesso!');

    // ==== ANALYTICS & MARKETING EVENTS (Admin creation) ==== //
    async function hashSHA256(value) {
      if (!value) return '';
      const encoder = new TextEncoder();
      const dataBuf = encoder.encode(value);
      const digest = await crypto.subtle.digest('SHA-256', dataBuf);
      const hashArray = Array.from(new Uint8Array(digest));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    async function sendAdsConversion(email, phone) {
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedPhone = (phone || '').replace(/\D/g, '');
      const hashedEmail = await hashSHA256(normalizedEmail);
      const hashedPhone = await hashSHA256(normalizedPhone);
      gtag('event', 'conversion', {
        send_to: 'AW-XXXXXXXXX/XXXXXXXXXX',
        user_data: {
          email: hashedEmail,
          phone_number: hashedPhone
        }
      });
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'generate_lead',
      lead_name: data.name,
      lead_email: data.email,
      lead_phone: data.phone,
      lead_role: data.role,
      lead_birthDate: data.birthDate,
      lead_message: data.message
    });
    gtag('event', 'generate_lead', {
      lead_name: data.name,
      lead_email: data.email,
      lead_phone: data.phone,
      lead_role: data.role
    });
    sendAdsConversion(data.email, data.phone);
    const hashedEmail = await hashSHA256((data.email || '').trim().toLowerCase());
    const hashedPhone = await hashSHA256((data.phone || '').replace(/\D/g, ''));
    fbq('track', 'Lead', { em: hashedEmail, ph: hashedPhone });
    // ==== END EVENTS ==== //
  } catch (error) {
    handleError(error);
  }
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = serializeForm(editForm);
  const id = payload.id;
  delete payload.id;

  if (!editForm.checkValidity()) {
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  try {
    const response = await authorizedFetch(`/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Erro ao atualizar lead.');
    }

    updateLeadInCache(data);
    editDialog.close();
    showStatus('Lead atualizado com sucesso!');
  } catch (error) {
    handleError(error);
  }
});

cancelEditBtn.addEventListener('click', () => {
  editDialog.close();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    fetchLeads(searchInput.value);
  }, 300);
});

refreshBtn.addEventListener('click', () => {
  fetchLeads(searchInput.value);
});

logoutBtn.addEventListener('click', () => {
  resetCredentials();
  cachedLeads = [];
  renderLeads();
  // ADICIONADO: Ocultar painel ao fazer logout
  adminLayout.style.display = 'none';
  openAuthDialog();
});

exportBtn.addEventListener('click', async () => {
  try {
    const params = new URLSearchParams();
    if (searchInput.value) params.set('search', searchInput.value);
    const query = params.toString();
    const url = query ? `/api/leads/export?${query}` : '/api/leads/export';
    const response = await authorizedFetch(url);
    if (!response.ok) {
      throw new Error('Não foi possível exportar os leads.');
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    handleError(error);
  }
});

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
    // ADICIONADO: Exibir painel após login bem-sucedido
    adminLayout.style.display = 'grid'; // Ou 'block', dependendo do seu CSS
    await fetchLeads(searchInput.value);
  } catch (error) {
    authError.textContent = error.message || 'Falha na autenticação.';
    authError.style.display = 'block';
  }
});

cancelAuthBtn.addEventListener('click', () => {
  closeAuthDialog();
});

// ALTERADO: Lógica inicial da página
if (credentials) {
  // Exibe o painel e tenta buscar os leads
  adminLayout.style.display = 'grid'; // Ou 'block'
  fetchLeads().catch(() => {
    // Se a busca falhar (ex: token expirado), oculta o painel e pede login
    adminLayout.style.display = 'none';
    openAuthDialog(true);
  });
} else {
  // Se não houver credenciais, apenas pede login
  openAuthDialog();
}