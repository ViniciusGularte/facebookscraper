// src/ui/lib/i18n.mjs
const STORAGE_KEY = "lang";

const DICTS = {
  "pt-BR": {
    // common
    "app.name": "GrabClientsNow",
    "app.tagline": "Oportunidades em tempo real a partir de posts em grupos.",
    "nav.leads": "Oportunidades",
    "nav.groups": "Grupos",
    "nav.profiles": "Perfis",
    "btn.refresh": "Atualizar",
    "btn.exportCsv": "Exportar CSV",
    "btn.clear": "Limpar",
    "btn.support": "Suporte",
    "btn.logout": "Sair",
    "btn.close": "Fechar",
    "btn.clearForm": "Limpar",
    "btn.save": "Salvar",
    "btn.use": "Usar",
    "btn.edit": "Editar",
    "btn.delete": "Deletar",
    "btn.open": "Abrir",
    "btn.prev": "Anterior",
    "btn.next": "Próxima",
    "btn.goGroups": "Ir para Grupos",
    "btn.turnOnMonitoring": "Ligar monitoramento",
    "btn.toggleMonitoring": "Ligar/Desligar Monitoramento",
    "lang.label": "Idioma",

    // auth/login
    "auth.title": "Entrar",
    "auth.email": "Email",
    "auth.password": "Senha",
    "auth.login": "Entrar",
    "auth.signup": "Cadastrar",
    "auth.loginFail": "Falha no login.",
    "auth.signupFail": "Falha no cadastro.",
    "auth.signupOk": "Cadastro criado. Pode exigir confirmação de email.",

    // blocked
    "blocked.title": "Você precisa estar logado",
    "blocked.sub": "Abra a extensão e faça login.",
    "blocked.emptyTitle": "Sem sessão ativa.",
    "blocked.emptySub":
      "Faça login para carregar perfis, grupos e histórico de oportunidades.",

    // overview
    "overview.title": "Visão do dia",
    "overview.sub": "Resumo operacional",
    "m.activeProfile": "Perfil ativo",
    "m.activeGroups": "Grupos ativos",
    "m.leadsToday": "Oportunidades hoje",
    "m.monitoring": "Monitoramento",
    "chart.title": "Oportunidades nos últimos 7 dias",
    "chart.emptyTitle": "Sem dados ainda.",
    "chart.emptySub": "Adicione grupos e ligue o monitoramento para começar.",
    "hint.start": "Sugestão: comece em",
    "hint.step": "→ ative 3–10 grupos → ligue o",

    // top groups
    "top.title": "Top Grupos",
    "top.sub": "Mais Oportunidades (histórico local)",
    "top.emptyTitle": "Sem dados ainda",
    "top.emptySub":
      "Assim que aparecerem leads, os grupos que mais geram vão aparecer aqui.",
    "top.nolink": "Sem link salvo",
    "top.leads": "leads",

    // leads
    "leads.title": "Oportunidades",
    "leads.sub": "Posts de grupos que deram match com seu perfil.",
    "leads.emptyTitle": "Nenhuma oportunidade ainda",
    "leads.emptySub1": "1) Ative 3–10 grupos",
    "leads.emptySub2": "2) Ligue o monitoramento",
    "leads.emptySub3": "3) Deixe o Facebook aberto",
    "leads.seeMore": "Ver mais",
    "leads.seeLess": "Ver menos",
    "leads.link.post": "Post",
    "leads.link.profile": "Perfil",
    "leads.link.group": "Grupo",
    "leads.crm.status": "Status",
    "leads.crm.note": "Nota",
    "leads.crm.notePh": "Ex: mandei WhatsApp, voltar amanhã",
    "leads.pagerInfo": "Mostrando {a}–{b} de {t}",

    // crm save pill
    "save.idle": "—",
    "save.saving": "Salvando…",
    "save.ok": "Salvo",
    "save.err": "Erro",

    // statuses
    "st.new": "Novo",
    "st.contacted": "Contatado",
    "st.followup": "Follow-up",
    "st.closed": "Fechado",
    "st.ignored": "Ignorado",

    // groups
    "groups.title": "Grupos",
    "groups.subActive": "Ativos:",
    "groups.emptyTitle": "Nenhum grupo salvo",
    "groups.emptySub":
      "Entre nos grupos do seu nicho e ative aqui. Depois ligue o monitoramento.",
    "groups.step1t": "Entre no grupo",
    "groups.step1s": "precisa ser membro",
    "groups.step2t": "Salve e ative",
    "groups.step2s": "até 10 ativos",
    "groups.step3t": "Monitore",
    "groups.step3s": "deixe o FB aberto",
    "badge.active": "Ativo",
    "badge.inactive": "Inativo",
    "badge.base": "Base",

    // profiles
    "profiles.title": "Perfis",
    "profiles.sub": "Perfil = palavras para procurar/ignorar",
    "profiles.new": "Novo Perfil",
    "profiles.modal.newTitle": "Novo Perfil",
    "profiles.modal.editTitle": "Editar Perfil",
    "profiles.modal.subNew": "Criar / editar",
    "profiles.modal.subEdit": "Editando: {id}",
    "profiles.idLabel": "ID do perfil",
    "profiles.idAuto": "Gerado automaticamente:",
    "profiles.idHint": "Baseado no nome. Você não precisa preencher ID.",
    "profiles.nameLabel": "Nome do perfil",
    "profiles.namePh": "Ex: Psicólogo (Clínico)",
    "profiles.nameHint":
      "Dica: use o nicho + cidade (ex: “Designer Pelotas”, “Terapia Online”).",
    "profiles.incLabel": "Palavras para encontrar",
    "profiles.incHint":
      "Separe por vírgula ou Enter. Ex: orçamento, preciso de, indicação",
    "profiles.excLabel": "Palavras para ignorar",
    "profiles.excHint":
      "Use para filtrar ruído. Ex: curso, formação, vaga, emprego",
    "profiles.incPh":
      "orçamento, preciso de, alguém indica\nconsulta, atendimento, online",
    "profiles.excPh": "curso, formação, vaga, emprego",
    "profiles.msg.fillName": "Preencha o Nome do perfil.",
    "profiles.msg.saveErr": "Erro ao salvar.",
    "profiles.msg.saved": "Salvo.",
    "profiles.msg.needNameForId": "Defina um nome para gerar o ID.",
    "profiles.msg.activateErr": "Erro ao ativar perfil.",
    "profiles.msg.activeNow": "Perfil ativo: {id}",
  },

  en: {
    "app.name": "GrabClientsNow",
    "app.tagline": "Real-time opportunities from posts in groups.",
    "nav.leads": "Leads",
    "nav.groups": "Groups",
    "nav.profiles": "Profiles",
    "btn.refresh": "Refresh",
    "btn.exportCsv": "Export CSV",
    "btn.clear": "Clear",
    "btn.support": "Support",
    "btn.logout": "Sign out",
    "btn.close": "Close",
    "btn.clearForm": "Clear",
    "btn.save": "Save",
    "btn.use": "Use",
    "btn.edit": "Edit",
    "btn.delete": "Delete",
    "btn.open": "Open",
    "btn.prev": "Previous",
    "btn.next": "Next",
    "btn.goGroups": "Go to Groups",
    "btn.turnOnMonitoring": "Turn on monitoring",
    "btn.toggleMonitoring": "Toggle Monitoring",
    "lang.label": "Language",

    "auth.title": "Sign in",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.login": "Sign in",
    "auth.signup": "Sign up",
    "auth.loginFail": "Login failed.",
    "auth.signupFail": "Sign up failed.",
    "auth.signupOk": "Account created. Email confirmation may be required.",

    "blocked.title": "You need to be signed in",
    "blocked.sub": "Open the extension and sign in.",
    "blocked.emptyTitle": "No active session.",
    "blocked.emptySub": "Sign in to load profiles, groups, and lead history.",

    "overview.title": "Today overview",
    "overview.sub": "Operational summary",
    "m.activeProfile": "Active profile",
    "m.activeGroups": "Active groups",
    "m.leadsToday": "Leads today",
    "m.monitoring": "Monitoring",
    "chart.title": "Leads in the last 7 days",
    "chart.emptyTitle": "No data yet.",
    "chart.emptySub": "Add groups and turn on monitoring to start.",
    "hint.start": "Tip: start in",
    "hint.step": "→ enable 3–10 groups → turn on",

    "top.title": "Top Groups",
    "top.sub": "Most leads (local history)",
    "top.emptyTitle": "No data yet",
    "top.emptySub":
      "As leads come in, the groups generating the most will show up here.",
    "top.nolink": "No saved link",
    "top.leads": "leads",

    "leads.title": "Leads",
    "leads.sub": "Group posts that matched your profile.",
    "leads.emptyTitle": "No leads yet",
    "leads.emptySub1": "1) Enable 3–10 groups",
    "leads.emptySub2": "2) Turn on monitoring",
    "leads.emptySub3": "3) Keep Facebook open",
    "leads.seeMore": "See more",
    "leads.seeLess": "See less",
    "leads.link.post": "Post",
    "leads.link.profile": "Profile",
    "leads.link.group": "Group",
    "leads.crm.status": "Status",
    "leads.crm.note": "Note",
    "leads.crm.notePh": "E.g. sent WhatsApp, follow up tomorrow",
    "leads.pagerInfo": "Showing {a}–{b} of {t}",

    "save.idle": "—",
    "save.saving": "Saving…",
    "save.ok": "Saved",
    "save.err": "Error",

    "st.new": "New",
    "st.contacted": "Contacted",
    "st.followup": "Follow-up",
    "st.closed": "Closed",
    "st.ignored": "Ignored",

    "groups.title": "Groups",
    "groups.subActive": "Active:",
    "groups.emptyTitle": "No saved groups",
    "groups.emptySub":
      "Join your niche groups and enable them here. Then turn on monitoring.",
    "groups.step1t": "Join the group",
    "groups.step1s": "must be a member",
    "groups.step2t": "Save and enable",
    "groups.step2s": "up to 10 active",
    "groups.step3t": "Monitor",
    "groups.step3s": "keep FB open",
    "badge.active": "Active",
    "badge.inactive": "Inactive",
    "badge.base": "Base",

    "profiles.title": "Profiles",
    "profiles.sub": "Profile = keywords to find/ignore",
    "profiles.new": "New Profile",
    "profiles.modal.newTitle": "New Profile",
    "profiles.modal.editTitle": "Edit Profile",
    "profiles.modal.subNew": "Create / edit",
    "profiles.modal.subEdit": "Editing: {id}",
    "profiles.idLabel": "Profile ID",
    "profiles.idAuto": "Auto-generated:",
    "profiles.idHint": "Based on the name. You don’t need to fill an ID.",
    "profiles.nameLabel": "Profile name",
    "profiles.namePh": "E.g. Therapist (Online)",
    "profiles.nameHint":
      "Tip: niche + city (e.g. “Designer Austin”, “Therapy Online”).",
    "profiles.incLabel": "Keywords to find",
    "profiles.incHint":
      "Separate by comma or Enter. E.g. quote, need, recommendation",
    "profiles.excLabel": "Keywords to ignore",
    "profiles.excHint":
      "Use to filter noise. E.g. course, training, job, hiring",
    "profiles.incPh":
      "quote, need, recommend\nappointment, consultation, online",
    "profiles.excPh": "course, training, job, hiring",
    "profiles.msg.fillName": "Please fill the profile name.",
    "profiles.msg.saveErr": "Failed to save.",
    "profiles.msg.saved": "Saved.",
    "profiles.msg.needNameForId": "Set a name to generate the ID.",
    "profiles.msg.activateErr": "Failed to activate profile.",
    "profiles.msg.activeNow": "Active profile: {id}",
  },

  es: {
    "app.name": "GrabClientsNow",
    "app.tagline":
      "Oportunidades en tiempo real a partir de publicaciones en grupos.",
    "nav.leads": "Oportunidades",
    "nav.groups": "Grupos",
    "nav.profiles": "Perfiles",
    "btn.refresh": "Actualizar",
    "btn.exportCsv": "Exportar CSV",
    "btn.clear": "Limpiar",
    "btn.support": "Soporte",
    "btn.logout": "Salir",
    "btn.close": "Cerrar",
    "btn.clearForm": "Limpiar",
    "btn.save": "Guardar",
    "btn.use": "Usar",
    "btn.edit": "Editar",
    "btn.delete": "Eliminar",
    "btn.open": "Abrir",
    "btn.prev": "Anterior",
    "btn.next": "Siguiente",
    "btn.goGroups": "Ir a Grupos",
    "btn.turnOnMonitoring": "Activar monitoreo",
    "btn.toggleMonitoring": "Activar/Desactivar Monitoreo",
    "lang.label": "Idioma",

    "auth.title": "Ingresar",
    "auth.email": "Email",
    "auth.password": "Contraseña",
    "auth.login": "Ingresar",
    "auth.signup": "Registrarse",
    "auth.loginFail": "Error al iniciar sesión.",
    "auth.signupFail": "Error al registrarse.",
    "auth.signupOk": "Cuenta creada. Puede requerir confirmación por email.",

    "blocked.title": "Necesitas iniciar sesión",
    "blocked.sub": "Abre la extensión e inicia sesión.",
    "blocked.emptyTitle": "Sin sesión activa.",
    "blocked.emptySub":
      "Inicia sesión para cargar perfiles, grupos e historial de oportunidades.",

    "overview.title": "Resumen del día",
    "overview.sub": "Resumen operacional",
    "m.activeProfile": "Perfil activo",
    "m.activeGroups": "Grupos activos",
    "m.leadsToday": "Oportunidades hoy",
    "m.monitoring": "Monitoreo",
    "chart.title": "Oportunidades en los últimos 7 días",
    "chart.emptyTitle": "Aún sin datos.",
    "chart.emptySub": "Agrega grupos y activa el monitoreo para comenzar.",
    "hint.start": "Sugerencia: empieza en",
    "hint.step": "→ activa 3–10 grupos → enciende el",

    "top.title": "Top Grupos",
    "top.sub": "Más oportunidades (historial local)",
    "top.emptyTitle": "Aún sin datos",
    "top.emptySub":
      "Cuando aparezcan oportunidades, los grupos que más generen se verán aquí.",
    "top.nolink": "Sin enlace guardado",
    "top.leads": "leads",

    "leads.title": "Oportunidades",
    "leads.sub": "Publicaciones que hicieron match con tu perfil.",
    "leads.emptyTitle": "Aún no hay oportunidades",
    "leads.emptySub1": "1) Activa 3–10 grupos",
    "leads.emptySub2": "2) Enciende el monitoreo",
    "leads.emptySub3": "3) Deja Facebook abierto",
    "leads.seeMore": "Ver más",
    "leads.seeLess": "Ver menos",
    "leads.link.post": "Post",
    "leads.link.profile": "Perfil",
    "leads.link.group": "Grupo",
    "leads.crm.status": "Estado",
    "leads.crm.note": "Nota",
    "leads.crm.notePh": "Ej: envié WhatsApp, volver mañana",
    "leads.pagerInfo": "Mostrando {a}–{b} de {t}",

    "save.idle": "—",
    "save.saving": "Guardando…",
    "save.ok": "Guardado",
    "save.err": "Error",

    "st.new": "Nuevo",
    "st.contacted": "Contactado",
    "st.followup": "Seguimiento",
    "st.closed": "Cerrado",
    "st.ignored": "Ignorado",

    "groups.title": "Grupos",
    "groups.subActive": "Activos:",
    "groups.emptyTitle": "Ningún grupo guardado",
    "groups.emptySub":
      "Únete a los grupos de tu nicho y actívalos aquí. Luego enciende el monitoreo.",
    "groups.step1t": "Únete al grupo",
    "groups.step1s": "debes ser miembro",
    "groups.step2t": "Guarda y activa",
    "groups.step2s": "hasta 10 activos",
    "groups.step3t": "Monitorea",
    "groups.step3s": "deja FB abierto",
    "badge.active": "Activo",
    "badge.inactive": "Inactivo",
    "badge.base": "Base",

    "profiles.title": "Perfiles",
    "profiles.sub": "Perfil = palabras para buscar/ignorar",
    "profiles.new": "Nuevo Perfil",
    "profiles.modal.newTitle": "Nuevo Perfil",
    "profiles.modal.editTitle": "Editar Perfil",
    "profiles.modal.subNew": "Crear / editar",
    "profiles.modal.subEdit": "Editando: {id}",
    "profiles.idLabel": "ID del perfil",
    "profiles.idAuto": "Generado automáticamente:",
    "profiles.idHint": "Basado en el nombre. No necesitas completar el ID.",
    "profiles.nameLabel": "Nombre del perfil",
    "profiles.namePh": "Ej: Psicólogo (Clínico)",
    "profiles.nameHint":
      "Tip: nicho + ciudad (ej: “Diseñador Madrid”, “Terapia Online”).",
    "profiles.incLabel": "Palabras para encontrar",
    "profiles.incHint":
      "Separa por coma o Enter. Ej: presupuesto, necesito, recomendación",
    "profiles.excLabel": "Palabras para ignorar",
    "profiles.excHint":
      "Úsalo para filtrar ruido. Ej: curso, formación, empleo, vacante",
    "profiles.incPh":
      "presupuesto, necesito, alguien recomienda\nconsulta, atención, online",
    "profiles.excPh": "curso, formación, empleo, vacante",
    "profiles.msg.fillName": "Completa el nombre del perfil.",
    "profiles.msg.saveErr": "Error al guardar.",
    "profiles.msg.saved": "Guardado.",
    "profiles.msg.needNameForId": "Define un nombre para generar el ID.",
    "profiles.msg.activateErr": "Error al activar el perfil.",
    "profiles.msg.activeNow": "Perfil activo: {id}",
  },
};

function normalizeLang(v) {
  const s = String(v || "").trim();
  if (s === "pt" || s === "pt-BR") return "pt-BR";
  if (s === "en" || s === "en-US" || s === "en-GB") return "en";
  if (s === "es" || s === "es-ES" || s === "es-419") return "es";
  // fallback: prefix
  if (s.toLowerCase().startsWith("pt")) return "pt-BR";
  if (s.toLowerCase().startsWith("es")) return "es";
  if (s.toLowerCase().startsWith("en")) return "en";
  return "pt-BR";
}

export async function getLang() {
  const r = await chrome.storage.local.get({ [STORAGE_KEY]: "" });
  if (r && r[STORAGE_KEY]) return normalizeLang(r[STORAGE_KEY]);

  // fallback: browser UI language
  const nav = normalizeLang(navigator.language || navigator.userLanguage || "");
  return nav;
}

export async function setLang(lang) {
  const v = normalizeLang(lang);
  await chrome.storage.local.set({ [STORAGE_KEY]: v });
  return v;
}

export function tFactory(lang) {
  const L = DICTS[normalizeLang(lang)] || DICTS["pt-BR"];
  return (key, vars) => {
    const raw = L[key] ?? DICTS["pt-BR"][key] ?? key;
    if (!vars) return String(raw);
    return String(raw).replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] == null ? "" : String(vars[k]),
    );
  };
}

export function applyDomI18n(t) {
  // text nodes
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });

  // placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });

  // titles
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (!key) return;
    el.setAttribute("title", t(key));
  });

  // aria-label
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });
}

export async function initI18n() {
  const lang = await getLang();
  const t = tFactory(lang);
  return { lang, t };
}
