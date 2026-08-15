// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import { supabase } from '../supabaseClient.js';

const DEFAULT_API_BASE_URL = '/api';

export class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_API_BASE_URL).replace(/\/$/, '');
}

function valueFrom(source, ...keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'sim'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function normalizeProficiencies(raw = {}) {
  if (Array.isArray(raw)) {
    return raw.reduce((result, item) => {
      if (item?.role) result[item.role] = Number(item.level) || 0;
      return result;
    }, {});
  }
  return Object.fromEntries(
    Object.entries(raw || {}).map(([role, level]) => [role, Number(level) || 0])
  );
}

export function normalizeVolunteer(raw) {
  return {
    ...raw,
    id: String(raw.id),
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    active: normalizeBoolean(valueFrom(raw, 'active', 'is_active'), true),
    allowedShift: valueFrom(raw, 'allowedShift', 'allowed_shift') || 'ALL',
    maxMonthlyFrequency: Number(valueFrom(raw, 'maxMonthlyFrequency', 'max_monthly_frequency', 'maxShiftsPerMonth')) || 2,
    proficiencies: normalizeProficiencies(raw.proficiencies)
  };
}

export function normalizeUnavailability(raw) {
  return {
    ...raw,
    id: String(raw.id),
    volunteerId: String(valueFrom(raw, 'volunteerId', 'volunteer_id')),
    date: raw.date,
    shift: raw.shift || 'ALL',
    reason: raw.reason || 'Sem motivo especificado'
  };
}

export function normalizeExchange(raw) {
  return {
    ...raw,
    id: String(raw.id),
    assignmentId: String(valueFrom(raw, 'assignmentId', 'assignment_id')),
    targetAssignmentId: String(valueFrom(raw, 'targetAssignmentId', 'target_assignment_id')),
    requesterId: String(valueFrom(raw, 'requesterId', 'requester_id')),
    targetVolunteerId: String(valueFrom(raw, 'targetVolunteerId', 'target_volunteer_id')),
    status: raw.status || 'PENDING',
    requesterName: raw.requesterName || raw.requester_name || '',
    targetVolunteerName: raw.targetVolunteerName || raw.target_volunteer_name || ''
  };
}

export function assignmentsToMatrix(assignments = []) {
  return assignments.reduce((matrix, raw) => {
    const date = raw.date;
    const shift = raw.shift;
    const role = raw.role;
    const volunteerId = valueFrom(raw, 'volunteerId', 'volunteer_id');
    if (!date || !shift || !role || volunteerId === undefined) return matrix;

    matrix[date] ??= {};
    matrix[date][shift] ??= {};
    matrix[date][shift][role] ??= { main: '', trainee: '' };
    const isTrainee = normalizeBoolean(valueFrom(raw, 'isTrainee', 'is_trainee'));
    matrix[date][shift][role][isTrainee ? 'trainee' : 'main'] = String(volunteerId);
    return matrix;
  }, {});
}

function normalizeMatrix(raw = {}) {
  const matrix = {};
  for (const [date, shifts] of Object.entries(raw || {})) {
    matrix[date] = {};
    for (const [shift, roles] of Object.entries(shifts || {})) {
      matrix[date][shift] = {};
      for (const [role, assignment] of Object.entries(roles || {})) {
        if (assignment && typeof assignment === 'object') {
          matrix[date][shift][role] = {
            main: assignment.main ? String(assignment.main) : '',
            trainee: assignment.trainee ? String(assignment.trainee) : ''
          };
        } else {
          matrix[date][shift][role] = { main: assignment ? String(assignment) : '', trainee: '' };
        }
      }
    }
  }
  return matrix;
}

export function matrixToAssignments(matrix = {}) {
  const assignments = [];
  for (const [date, shifts] of Object.entries(matrix)) {
    for (const [shift, roles] of Object.entries(shifts || {})) {
      for (const [role, raw] of Object.entries(roles || {})) {
        const slot = raw && typeof raw === 'object'
          ? { main: raw.main || '', trainee: raw.trainee || '' }
          : { main: raw || '', trainee: '' };
        if (slot.main) {
          assignments.push({ date, shift, role, volunteerId: String(slot.main), isTrainee: false });
        }
        if (slot.trainee) {
          assignments.push({ date, shift, role, volunteerId: String(slot.trainee), isTrainee: true });
        }
      }
    }
  }
  return assignments;
}

export function normalizeScheduleResponse(payload, { year, month } = {}) {
  const wrapper = payload || {};
  const raw = wrapper.schedule || wrapper;
  const matrixSource = valueFrom(wrapper, 'bySunday', 'matrix') || valueFrom(raw, 'bySunday', 'matrix');
  const assignments = valueFrom(raw, 'assignments') || valueFrom(wrapper, 'assignments') || [];
  const status = String(valueFrom(raw, 'status') || 'DRAFT').toLowerCase();
  return {
    id: raw.id === undefined || raw.id === null ? null : String(raw.id),
    year: Number(valueFrom(raw, 'year') ?? year),
    month: Number(valueFrom(raw, 'month') ?? month),
    status: status === 'published' ? 'published' : 'draft',
    matrix: matrixSource ? normalizeMatrix(matrixSource) : assignmentsToMatrix(assignments),
    assignments,
    lockedSlots: [...(valueFrom(raw, 'lockedSlots', 'locked_slots', 'locks') || valueFrom(wrapper, 'lockedSlots', 'locked_slots', 'locks') || [])],
    warnings: [...(valueFrom(wrapper, 'warnings') || valueFrom(raw, 'warnings') || [])],
    publishedVersion: valueFrom(raw, 'publishedVersion', 'published_version', 'version') || null
  };
}

export function normalizeScheduleVersion(raw) {
  const assignments = raw?.assignments || [];
  const volunteerNames = Object.fromEntries(assignments
    .filter(assignment => valueFrom(assignment, 'volunteerName', 'volunteer_name'))
    .map(assignment => [
      String(valueFrom(assignment, 'volunteerId', 'volunteer_id')),
      { name: valueFrom(assignment, 'volunteerName', 'volunteer_name') }
    ]));
  return {
    id: raw?.id == null ? null : String(raw.id),
    version: Number(raw?.version) || 0,
    publishedAt: valueFrom(raw, 'publishedAt', 'published_at') || null,
    warnings: [...(raw?.warnings || [])],
    assignments,
    matrix: assignmentsToMatrix(assignments),
    volunteerNames
  };
}

function shouldTryLegacyEndpoint(error) {
  return error instanceof ApiError && [404, 405].includes(error.status);
}

export function createApiClient({
  baseUrl = import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
  fetchImpl = globalThis.fetch,
  authClient = supabase
} = {}) {
  const apiBaseUrl = normalizeBaseUrl(baseUrl);

  async function getAccessToken() {
    if (!authClient) return null;
    const { data, error } = await authClient.auth.getSession();
    if (error) throw new ApiError(error.message, { status: 401, payload: error });
    return data.session?.access_token || null;
  }

  async function request(path, { method = 'GET', body, signal, authenticated = true } = {}) {
    if (!fetchImpl) throw new ApiError('O navegador não oferece suporte a requisições HTTP.');
    const accessToken = authenticated ? await getAccessToken() : null;
    const headers = new Headers();
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    let response;
    try {
      response = await fetchImpl(`${apiBaseUrl}${path}`, {
        method,
        signal,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está em execução.', { payload: error });
    }

    const contentType = response.headers?.get?.('content-type') || '';
    const payload = response.status === 204
      ? null
      : contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
      const message = payload?.error || payload?.message || (typeof payload === 'string' && payload) || `A API retornou o estado ${response.status}.`;
      throw new ApiError(message, { status: response.status, payload });
    }
    return payload;
  }

  async function getVolunteers({ signal } = {}) {
    const payload = await request('/volunteers', { signal });
    const list = Array.isArray(payload) ? payload : payload?.volunteers || [];
    return list.map(normalizeVolunteer);
  }

  async function getUnavailabilities(year, month, { signal } = {}) {
    const query = new URLSearchParams({ year: String(year), month: String(month) });
    const payload = await request(`/unavailabilities?${query}`, { signal });
    const list = Array.isArray(payload) ? payload : payload?.unavailabilities || [];
    return list
      .map(normalizeUnavailability)
      .filter(item => item.date?.startsWith(`${year}-${String(month).padStart(2, '0')}`));
  }

  async function getSchedule(year, month, { signal } = {}) {
    const query = new URLSearchParams({ year: String(year), month: String(month) });
    const payload = await request(`/schedule?${query}`, { signal });
    return normalizeScheduleResponse(payload, { year, month });
  }

  async function getScheduleVersions(id, { signal } = {}) {
    if (!id) return [];
    const payload = await request(`/schedule/${id}/versions`, { signal });
    const versions = Array.isArray(payload) ? payload : payload?.versions || [];
    return versions.map(normalizeScheduleVersion);
  }

  return {
    async getServiceConfirmation(token, { signal } = {}) {
      const payload = await request(`/service-confirmations/${encodeURIComponent(token)}`, {
        signal,
        authenticated: false
      });
      return {
        confirmation: payload.confirmation,
        candidates: (payload.candidates || []).map(candidate => ({
          ...candidate,
          assignmentId: String(valueFrom(candidate, 'assignmentId', 'assignment_id')),
          volunteerId: String(valueFrom(candidate, 'volunteerId', 'volunteer_id'))
        }))
      };
    },
    async confirmService(token) {
      const payload = await request(`/service-confirmations/${encodeURIComponent(token)}/confirm`, {
        method: 'POST',
        authenticated: false
      });
      return payload.confirmation;
    },
    async requestServiceExchange(token, data) {
      const payload = await request(`/service-confirmations/${encodeURIComponent(token)}/exchange`, {
        method: 'POST',
        authenticated: false,
        body: data
      });
      return normalizeExchange(payload.exchange);
    },
    async register({ name, email, phone, password }) {
      return request('/auth/register', {
        method: 'POST',
        authenticated: false,
        body: { name, email, phone, password }
      });
    },
    async getCurrentUser({ signal } = {}) {
      if (!authClient) return null;
      const { data, error } = await authClient.auth.getSession();
      if (error) throw new ApiError(error.message, { status: 401, payload: error });
      if (!data.session) return null;
      const payload = await request('/auth/me', { signal });
      return payload.user || null;
    },
    async login(email, password) {
      if (!authClient) {
        throw new ApiError('Supabase Auth não está configurado.', { status: 503 });
      }
      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError(error.message, { status: 401, payload: error });
      return this.getCurrentUser();
    },
    async logout() {
      if (!authClient) return;
      const { error } = await authClient.auth.signOut();
      if (error) throw new ApiError(error.message, { status: 0, payload: error });
    },
    async requestPasswordReset(email) {
      if (!authClient) throw new ApiError('Supabase Auth não está configurado.', { status: 503 });
      const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/redefinir-senha`;
      const { error } = await authClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) throw new ApiError(error.message, { status: 400, payload: error });
      return true;
    },
    async updatePassword(password) {
      if (!authClient) throw new ApiError('Supabase Auth não está configurado.', { status: 503 });
      const { error } = await authClient.auth.updateUser({ password });
      if (error) throw new ApiError(error.message, { status: 400, payload: error });
      return true;
    },
    subscribeToAuthState(onUser, onError = () => {}) {
      if (!authClient) return () => {};
      const { data } = authClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          onUser(null);
          return;
        }
        // Keep the callback synchronous and resolve the application profile in
        // a microtask, as recommended for onAuthStateChange listeners.
        queueMicrotask(() => {
          this.getCurrentUser().then(onUser).catch(onError);
        });
      });
      return () => data.subscription.unsubscribe();
    },
    async getMySchedule(year, month, { signal } = {}) {
      const query = new URLSearchParams({ year: String(year), month: String(month) });
      const payload = await request(`/me/schedule?${query}`, { signal });
      return (payload.assignments || []).map(item => ({
        ...item,
        volunteerId: String(valueFrom(item, 'volunteerId', 'volunteer_id')),
        isTrainee: normalizeBoolean(valueFrom(item, 'isTrainee', 'is_trainee'))
      }));
    },
    async getVolunteerDirectory({ signal } = {}) {
      const payload = await request('/me/directory', { signal });
      return payload.volunteers || [];
    },
    async getMyUnavailabilities({ signal } = {}) {
      const payload = await request('/me/unavailabilities', { signal });
      return (payload.unavailabilities || []).map(normalizeUnavailability);
    },
    async createMyUnavailability(data) {
      return normalizeUnavailability(await request('/me/unavailabilities', { method: 'POST', body: data }));
    },
    async updateMyUnavailability(id, data) {
      return normalizeUnavailability(await request(`/me/unavailabilities/${id}`, { method: 'PATCH', body: data }));
    },
    async deleteMyUnavailability(id) {
      return request(`/me/unavailabilities/${id}`, { method: 'DELETE' });
    },
    async getMyExchanges({ signal } = {}) {
      const payload = await request('/me/exchanges', { signal });
      return (payload.exchanges || []).map(normalizeExchange);
    },
    async getExchangeCandidates(assignmentId, { signal } = {}) {
      const query = new URLSearchParams({ assignmentId: String(assignmentId) });
      const payload = await request(`/exchanges/candidates?${query}`, { signal });
      return (payload.candidates || []).map(candidate => ({
        ...candidate,
        assignmentId: String(valueFrom(candidate, 'assignmentId', 'assignment_id')),
        volunteerId: String(valueFrom(candidate, 'volunteerId', 'volunteer_id'))
      }));
    },
    async createExchange(data) {
      const payload = await request('/exchanges', { method: 'POST', body: data });
      return normalizeExchange(payload.exchange);
    },
    async acceptExchange(id) {
      const payload = await request(`/exchanges/${id}/accept`, { method: 'POST' });
      return normalizeExchange(payload.exchange);
    },
    async rejectExchange(id, rejectionReason) {
      const payload = await request(`/exchanges/${id}/reject`, { method: 'POST', body: { rejectionReason } });
      return normalizeExchange(payload.exchange);
    },
    async cancelExchange(id) {
      const payload = await request(`/exchanges/${id}/cancel`, { method: 'POST' });
      return normalizeExchange(payload.exchange);
    },
    async getMyNotifications({ signal } = {}) {
      const payload = await request('/me/notifications', { signal });
      return payload.notifications || [];
    },
    async markNotificationRead(id) {
      const payload = await request(`/me/notifications/${id}/read`, { method: 'POST' });
      return payload.notification;
    },
    async markAllNotificationsRead() {
      return request('/me/notifications/read-all', { method: 'POST' });
    },
    async getAdminExchanges({ signal } = {}) {
      const payload = await request('/admin/exchanges', { signal });
      return (payload.exchanges || []).map(normalizeExchange);
    },
    async getAdminServiceConfirmations(year, month, { signal } = {}) {
      const query = new URLSearchParams({ year: String(year), month: String(month) });
      const payload = await request(`/admin/service-confirmations?${query}`, { signal });
      return payload.confirmations || [];
    },
    async getPendingRegistrations({ signal } = {}) {
      const payload = await request('/admin/registrations', { signal });
      return (payload.registrations || []).map(item => ({
        ...item,
        id: String(item.id),
        volunteerId: String(item.volunteerId)
      }));
    },
    async updatePendingRegistration(id, changes) {
      const payload = await request(`/admin/registrations/${id}`, { method: 'PATCH', body: changes });
      return { ...payload.registration, id: String(payload.registration.id), volunteerId: String(payload.registration.volunteerId) };
    },
    async approvePendingRegistration(id) {
      const payload = await request(`/admin/registrations/${id}/approve`, { method: 'POST' });
      return { ...payload, volunteer: normalizeVolunteer(payload.volunteer) };
    },
    async rejectPendingRegistration(id) {
      return request(`/admin/registrations/${id}`, { method: 'DELETE' });
    },
    async loadMonth(year, month, { signal } = {}) {
      const volunteersPromise = getVolunteers({ signal });
      const unavailabilitiesPromise = getUnavailabilities(year, month, { signal });
      const schedulePromise = getSchedule(year, month, { signal });
      const [volunteers, unavailabilities, schedule] = await Promise.all([
        volunteersPromise,
        unavailabilitiesPromise,
        schedulePromise
      ]);
      const versions = schedule.id ? await getScheduleVersions(schedule.id, { signal }) : [];
      return { volunteers, unavailabilities, schedule, versions };
    },
    getVolunteers,
    getUnavailabilities,
    getSchedule,
    getScheduleVersions,
    async createVolunteer(volunteer) {
      return normalizeVolunteer(await request('/volunteers', { method: 'POST', body: volunteer }));
    },
    async updateVolunteer(id, changes) {
      return normalizeVolunteer(await request(`/volunteers/${id}`, { method: 'PUT', body: changes }));
    },
    async updateProficiencies(id, proficiencies) {
      try {
        return await request(`/volunteers/${id}/proficiencies`, {
          method: 'PUT',
          body: { proficiencies }
        });
      } catch (error) {
        if (!shouldTryLegacyEndpoint(error)) throw error;
        return request(`/volunteers/${id}/proficiency`, {
          method: 'POST',
          body: { proficiencies }
        });
      }
    },
    async createUnavailability(unavailability) {
      return normalizeUnavailability(await request('/unavailabilities', {
        method: 'POST',
        body: unavailability
      }));
    },
    async deleteUnavailability(id) {
      return request(`/unavailabilities/${id}`, { method: 'DELETE' });
    },
    async saveSchedule(id, { year, month, matrix, lockedSlots, warnings = [] }) {
      const payload = await request(`/schedule/${id}`, {
        method: 'PUT',
        body: {
          year,
          month,
          assignments: matrixToAssignments(matrix),
          lockedSlots,
          ...(warnings.length ? { warnings } : {})
        }
      });
      return normalizeScheduleResponse(payload, { year, month });
    },
    async generateSchedule({ year, month, lockedSlots = [], matrix = {} }) {
      const payload = await request('/schedule/generate', {
        method: 'POST',
        body: {
          year,
          month,
          lockedSlots,
          lockedAssignments: matrixToAssignments(matrix).filter(item =>
            !item.isTrainee && lockedSlots.includes(`${item.date}:${item.shift}:${item.role}`)
          )
        }
      });
      return normalizeScheduleResponse(payload, { year, month });
    },
    async publishSchedule(id, { warnings = [], confirmedWarnings = false } = {}) {
      try {
        return normalizeScheduleResponse(await request(`/schedule/${id}/publish`, {
          method: 'POST',
          body: { warnings, confirmedWarnings }
        }));
      } catch (error) {
        if (!shouldTryLegacyEndpoint(error)) throw error;
        return normalizeScheduleResponse(await request(`/schedule/${id}/status`, {
          method: 'PUT',
          body: { status: 'PUBLISHED', warnings, confirmedWarnings }
        }));
      }
    },
    async reopenSchedule(id) {
      try {
        return normalizeScheduleResponse(await request(`/schedule/${id}/reopen`, { method: 'POST' }));
      } catch (error) {
        if (!shouldTryLegacyEndpoint(error)) throw error;
        return normalizeScheduleResponse(await request(`/schedule/${id}/status`, {
          method: 'PUT',
          body: { status: 'DRAFT' }
        }));
      }
    }
  };
}

export const api = createApiClient();
