import {
  getAuthUserByEmail,
  markUserEmailConfirmed,
  setUserAuthIdentity
} from './db/authRepository.js';
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from './supabase.js';

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveSupabaseUser(req) {
  const token = getBearerToken(req);
  if (!token) return { status: 'unauthenticated' };

  const client = req.app.locals.supabaseAuthClient || getSupabaseAuthClient();
  if (!client) return { status: 'not_configured' };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { status: 'unauthenticated' };

  // The local profile is the source of application roles and volunteer links.
  // Supabase user metadata is deliberately not used for authorization.
  const profile = await getAuthUserByEmail(data.user.email);
  if (!profile) return { status: 'unlinked', supabaseUser: data.user };
  if (profile.authUserId && profile.authUserId !== data.user.id) {
    return { status: 'unlinked', supabaseUser: data.user };
  }

  const { authUserId, ...user } = profile;
  if (profile.approvalStatus === 'PENDING') {
    if (!data.user.email_confirmed_at) {
      return { status: 'email_unconfirmed', user, supabaseUser: data.user };
    }
    await markUserEmailConfirmed(profile.id, data.user.email_confirmed_at);
    return { status: 'pending_approval', user, supabaseUser: data.user };
  }
  if (!profile.active) return { status: 'disabled', user, supabaseUser: data.user };
  if (!authUserId) await setUserAuthIdentity(profile.id, data.user.id);
  return { status: 'authenticated', user, token, supabaseUser: data.user };
}

export async function resolveRequestAuth(req) {
  if (!req.app.locals.supabaseAuthClient && !isSupabaseAuthConfigured()) {
    return { status: 'not_configured' };
  }
  return resolveSupabaseUser(req);
}

export async function requireAuth(req, res, next) {
  try {
    const result = await resolveRequestAuth(req);
    if (result.status === 'not_configured') {
      return res.status(503).json({
        error: 'Supabase Auth is not configured.',
        code: 'SUPABASE_AUTH_NOT_CONFIGURED'
      });
    }
    if (result.status === 'unlinked') {
      return res.status(403).json({
        error: 'Authenticated account is not linked to an application profile.',
        code: 'AUTH_PROFILE_REQUIRED'
      });
    }
    if (result.status === 'email_unconfirmed') {
      return res.status(403).json({
        error: 'Confirme seu e-mail antes de continuar.',
        code: 'AUTH_EMAIL_NOT_CONFIRMED'
      });
    }
    if (result.status === 'pending_approval') {
      return res.status(403).json({
        error: 'Seu e-mail foi confirmado, mas seu cadastro ainda aguarda aprovação do líder.',
        code: 'AUTH_APPROVAL_PENDING'
      });
    }
    if (result.status === 'disabled') {
      return res.status(403).json({
        error: 'Sua conta está inativa. Fale com o líder da equipe.',
        code: 'AUTH_PROFILE_DISABLED'
      });
    }
    if (result.status !== 'authenticated') {
      return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    }
    req.user = result.user;
    req.authProvider = 'supabase';
    req.supabaseUser = result.supabaseUser;
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this resource.', code: 'FORBIDDEN' });
    }
    return next();
  };
}
