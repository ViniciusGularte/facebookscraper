import { CONFIG } from "./config.mjs";

const SESSION_KEY = "session_v1";

export async function getSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  return session ?? null;
}

async function setSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

function hasSupabaseConfigured() {
  return !!CONFIG.SUPABASE_URL && !!CONFIG.SUPABASE_ANON_KEY;
}

function isAdminBypass(email, password) {
  return email === CONFIG.ADMIN_BYPASS.email && password === CONFIG.ADMIN_BYPASS.password;
}

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
  };
}

async function supabaseSignInWithPassword(email, password) {
  const url = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AUTH_FAILED:${res.status}:${text}`);
  }

  const data = await res.json();
  const session = {
    user: { id: data.user?.id, email: data.user?.email },
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at
  };
  await setSession(session);
  return session;
}

async function supabaseSignUp(email, password) {
  const url = `${CONFIG.SUPABASE_URL}/auth/v1/signup`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SIGNUP_FAILED:${res.status}:${text}`);
  }

  const data = await res.json();

  if (data?.access_token) {
    const session = {
      user: { id: data.user?.id, email: data.user?.email },
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at
    };
    await setSession(session);
    return session;
  }

  return { user: { id: data.user?.id ?? "pending", email }, access_token: null };
}

async function supabaseRefresh(refresh_token) {
  const url = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token })
  });

  if (!res.ok) {
    await clearSession();
    return null;
  }

  const data = await res.json();
  const session = {
    user: { id: data.user?.id, email: data.user?.email },
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at
  };
  await setSession(session);
  return session;
}

export async function ensureValidSession() {
  const session = await getSession();
  if (!session?.user) return null;

  if (session.user.id === "admin") return session;

  if (!hasSupabaseConfigured()) return session;

  const now = Math.floor(Date.now() / 1000);
  const exp = session.expires_at ?? 0;

  if (exp && now < exp - 30) return session;
  if (!session.refresh_token) return session;

  return await supabaseRefresh(session.refresh_token);
}

export async function signIn(email, password) {
  if (isAdminBypass(email, password)) {
    const session = {
      user: { id: "admin", email: "admin" },
      access_token: "local-admin",
      refresh_token: null,
      expires_at: null
    };
    await setSession(session);
    return session;
  }

  if (!hasSupabaseConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  return await supabaseSignInWithPassword(email, password);
}

export async function signUp(email, password) {
  if (!hasSupabaseConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  return await supabaseSignUp(email, password);
}

export async function signOut() {
  await clearSession();
}
