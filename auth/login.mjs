import { signIn } from "../lib/supabaseAuth.mjs";

function qs(id) {
  return document.getElementById(id);
}

const err = qs("err");
const ok = qs("ok");
const langSel = qs("lang");

const I18N = {
  "pt-BR": {
    "login.title": "Entrar",
    "login.subtitle": "Acesse sua conta para ver oportunidades.",
    "login.langLabel": "Idioma",
    "login.email": "Email",
    "login.password": "Senha",
    "login.signin": "Entrar",
    "login.noAccount": "Não tem cadastro?",
    "login.buyOnSite": "Compre / ative aqui",
    "msg.loginFail": "Falha no login.",
  },
  es: {
    "login.title": "Ingresar",
    "login.subtitle": "Accede a tu cuenta para ver oportunidades.",
    "login.langLabel": "Idioma",
    "login.email": "Email",
    "login.password": "Contraseña",
    "login.signin": "Ingresar",
    "login.noAccount": "¿No tienes cuenta?",
    "login.buyOnSite": "Compra / activa aquí",
    "msg.loginFail": "Error al iniciar sesión.",
  },
  en: {
    "login.title": "Sign in",
    "login.subtitle": "Access your account to see opportunities.",
    "login.langLabel": "Language",
    "login.email": "Email",
    "login.password": "Password",
    "login.signin": "Sign in",
    "login.noAccount": "No account yet?",
    "login.buyOnSite": "Buy / activate here",
    "msg.loginFail": "Login failed.",
  },
};

function getLangFromUrl() {
  const u = new URL(location.href);
  const l = (u.searchParams.get("lang") || "").trim().toLowerCase();
  if (l === "pt" || l === "ptbr" || l === "pt-br") return "pt-BR";
  if (l === "es") return "es";
  if (l === "en") return "en";
  return "";
}

async function loadLang() {
  const fromUrl = getLangFromUrl();
  if (fromUrl) return fromUrl;

  try {
    const { uiLang } = await chrome.storage.local.get({ uiLang: "pt-BR" });
    return uiLang || "pt-BR";
  } catch {
    return "pt-BR";
  }
}

function t(key, lang) {
  const dict = I18N[lang] || I18N["pt-BR"];
  return dict[key] || I18N["pt-BR"][key] || key;
}

function applyI18n(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.getAttribute("data-i18n");
    el.textContent = t(k, lang);
  });
}

function showErr(msg) {
  ok.classList.add("hidden");
  err.textContent = msg;
  err.classList.remove("hidden");
}
function showOk(msg) {
  err.classList.add("hidden");
  ok.textContent = msg;
  ok.classList.remove("hidden");
}

function getCreds() {
  return {
    email: qs("email").value.trim(),
    password: qs("password").value.trim(),
  };
}

async function setLang(lang) {
  try {
    await chrome.storage.local.set({ uiLang: lang });
  } catch {}
  applyI18n(lang);
}

async function boot() {
  const lang = await loadLang();
  langSel.value = lang;
  applyI18n(lang);

  langSel.addEventListener("change", async () => {
    await setLang(langSel.value || "pt-BR");
  });

  qs("loginBtn").addEventListener("click", async () => {
    const { email, password } = getCreds();
    try {
      await signIn(email, password);
      window.location.href = "../dashboard/dashboard.html";
    } catch {
      showErr(t("msg.loginFail", langSel.value || "pt-BR"));
    }
  });

  // Enter no password => login
  qs("password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      qs("loginBtn").click();
    }
  });

  // opcional: usar ok pra mensagens futuras (ex: "sessão expirada")
  showOk("");
}

boot();
