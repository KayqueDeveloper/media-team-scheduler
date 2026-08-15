// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
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

function getTransientSupabaseAuthClient() {
  const url = getProjectUrl();
  const key = getPublishableKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

export async function signUpSupabaseUser({ email, password, name, emailRedirectTo }, clientOverride = null) {
  const client = clientOverride || getTransientSupabaseAuthClient();
  if (!client) {
    const error = new Error('Supabase Auth is not configured.');
    error.code = 'SUPABASE_AUTH_NOT_CONFIGURED';
    throw error;
  }
  const { data, error } = await client.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: {
      data: { full_name: String(name || '').trim() },
      ...(emailRedirectTo ? { emailRedirectTo } : {})
    }
  });
  if (error) throw error;
  if (!data?.user) throw new Error('Supabase did not create the authentication account.');
  return data;
}

export async function findSupabaseUserByEmail(email, clientOverride = null) {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) return null;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find(user => String(user.email || '').trim().toLowerCase() === normalizedEmail);
    if (found) return found;
    if (users.length < perPage) return null;
  }
  throw new Error('Supabase user lookup exceeded the supported page limit.');
}

export async function getSupabaseUserById(id, clientOverride = null) {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.admin.getUserById(id);
  if (error) throw error;
  return data?.user || null;
}

export async function deleteSupabaseUser(id, clientOverride = null) {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) {
    const error = new Error('SUPABASE_SECRET_KEY is required to delete users.');
    error.code = 'SUPABASE_ADMIN_NOT_CONFIGURED';
    throw error;
  }
  const { error } = await client.auth.admin.deleteUser(id, false);
  if (error) throw error;
  return true;
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
