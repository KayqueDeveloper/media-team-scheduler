import { createClient } from '@supabase/supabase-js';

let authClient = null;
let authClientConfig = null;
let adminClient = null;
let adminClientConfig = null;

function getProjectUrl() {
  return process.env.SUPABASE_URL?.trim() || '';
}

function getPublishableKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim()
    || '';
}

function getSecretKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || '';
}

export function isSupabaseAuthConfigured() {
  return Boolean(getProjectUrl() && getPublishableKey());
}

export function isSupabaseAdminConfigured() {
  return Boolean(getProjectUrl() && getSecretKey());
}

export function getSupabaseAuthClient() {
  const url = getProjectUrl();
  const key = getPublishableKey();
  if (!url || !key) return null;

  const config = `${url}:${key}`;
  if (!authClient || authClientConfig !== config) {
    authClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    authClientConfig = config;
  }
  return authClient;
}

export function getSupabaseAdminClient() {
  const url = getProjectUrl();
  const key = getSecretKey();
  if (!url || !key) return null;

  const config = `${url}:${key}`;
  if (!adminClient || adminClientConfig !== config) {
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    adminClientConfig = config;
  }
  return adminClient;
}

export async function createSupabaseUser({ email, password, name }) {
  const client = getSupabaseAdminClient();
  if (!client) {
    const error = new Error('SUPABASE_SECRET_KEY is required to provision users from the API.');
    error.code = 'SUPABASE_ADMIN_NOT_CONFIGURED';
    throw error;
  }

  const { data, error } = await client.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: String(name || '').trim() }
  });
  if (error) throw error;
  return data.user;
}

export async function ensureSupabaseUser({ email, password, name }) {
  try {
    return await createSupabaseUser({ email, password, name });
  } catch (error) {
    if (/already registered|already exists|email.*taken/i.test(String(error.message))) return null;
    throw error;
  }
}
