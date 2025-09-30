const { TRACKING_FIELDS } = require('./storage');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^(?:\+?55)?(?:\s|-)?(?:\(?\d{2}\)?)(?:\s|-)?\d{4,5}(?:\s|-)?\d{4}$/;

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function validateLeadPayload(input, { partial = false } = {}) {
  const errors = [];
  const sanitized = { tracking: {} };

  const baseFields = ['name', 'email', 'phone', 'role', 'birthDate', 'message'];

  for (const field of baseFields) {
    const value = normalizeString(input[field]);
    if (value !== undefined) {
      sanitized[field] = value;
    }
    if (!partial || value !== undefined) {
      if (!value) {
        errors.push(`Campo ${field} é obrigatório.`);
        continue;
      }
      if (field === 'email' && !emailRegex.test(value)) {
        errors.push('Informe um e-mail válido.');
      }
      if (field === 'phone' && !phoneRegex.test(value)) {
        errors.push('Informe um telefone brasileiro válido.');
      }
      if (field === 'birthDate') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          errors.push('Informe uma data de nascimento válida.');
        } else if (date > new Date()) {
          errors.push('A data de nascimento não pode estar no futuro.');
        }
      }
    }
  }

  for (const field of TRACKING_FIELDS) {
    const value = normalizeString(input[field]);
    sanitized.tracking[field] = value || '';
  }

  if (!partial) {
    const missingTracking = TRACKING_FIELDS.filter((field) => sanitized.tracking[field] === undefined);
    if (missingTracking.length) {
      missingTracking.forEach((field) => {
        sanitized.tracking[field] = '';
      });
    }
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, value: sanitized };
}

module.exports = {
  validateLeadPayload
};
