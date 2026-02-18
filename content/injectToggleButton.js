(() => {
  const GROUP_REGEX =
    /^https:\/\/(?:www|web|m)\.facebook\.com\/groups\/([^\/\?\#]+)/i;
  const WIDGET_ID = "ext-fb-notifs-widget";
  const STYLE_ID = "ext-fb-notifs-style";
  const LANG_KEY = "lang";

  const send = (msg) =>
    new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  let currentSlug = null;
  let mounting = false;
  let hiddenByUser = false;
  let LANG = "pt-BR";

  const TXT = {
    "pt-BR": {
      title: "Monitoramento do Grupo",
      close: "Fechar",
      status: "Status",
      active: "ATIVO",
      inactive: "INATIVO",
      monitoringThis: "Monitorando este grupo",
      enableThis: "Ativar neste grupo",
      login: "Faça login na extensão.",
      limit: "Limite atingido ({n}).",
      saveErr: "Erro ao salvar.",
      enabled: "Ativado para este grupo.",
      disabled: "Desativado neste grupo.",
    },
    en: {
      title: "Group Monitoring",
      close: "Close",
      status: "Status",
      active: "ACTIVE",
      inactive: "INACTIVE",
      monitoringThis: "Monitoring this group",
      enableThis: "Enable for this group",
      login: "Please sign in to the extension.",
      limit: "Limit reached ({n}).",
      saveErr: "Failed to save.",
      enabled: "Enabled for this group.",
      disabled: "Disabled for this group.",
    },
    es: {
      title: "Monitoreo del Grupo",
      close: "Cerrar",
      status: "Estado",
      active: "ACTIVO",
      inactive: "INACTIVO",
      monitoringThis: "Monitoreando este grupo",
      enableThis: "Activar en este grupo",
      login: "Inicia sesión en la extensión.",
      limit: "Límite alcanzado ({n}).",
      saveErr: "Error al guardar.",
      enabled: "Activado para este grupo.",
      disabled: "Desactivado en este grupo.",
    },
  };

  function normLang(v) {
    const s = String(v || "").trim();
    if (s === "pt" || s === "pt-BR") return "pt-BR";
    if (s.toLowerCase().startsWith("pt")) return "pt-BR";
    if (s.toLowerCase().startsWith("es")) return "es";
    if (s.toLowerCase().startsWith("en")) return "en";
    if (s === "es") return "es";
    if (s === "en") return "en";
    return "pt-BR";
  }

  async function loadLang() {
    try {
      const r = await chrome.storage.local.get({ [LANG_KEY]: "" });
      LANG = normLang(r[LANG_KEY] || navigator.language || "");
    } catch {
      LANG = normLang(navigator.language || "");
    }
  }

  function t(key, vars) {
    const dict = TXT[LANG] || TXT["pt-BR"];
    const raw = dict[key] ?? TXT["pt-BR"][key] ?? key;
    if (!vars) return String(raw);
    return String(raw).replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] == null ? "" : String(vars[k]),
    );
  }

  function getSlugFromUrl(href) {
    const m = String(href || "").match(GROUP_REGEX);
    return m ? m[1] : null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${WIDGET_ID}{
  position:fixed; right:16px; bottom:16px; z-index:2147483647;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color:#1f2937;
}
#${WIDGET_ID} *{ box-sizing:border-box; }

.extJarvisCard{
  width: 320px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e3e8ef;
  box-shadow: 0 12px 28px rgba(16,24,40,.14);
  overflow:hidden;
  transform: translateY(8px) scale(.98);
  opacity: 0;
  transition: transform .18s ease, opacity .18s ease;
}
.extJarvisCard.isOn{
  transform: translateY(0) scale(1);
  opacity: 1;
}

.extJarvisTop{
  display:flex; align-items:center; justify-content:space-between;
  padding: 12px 12px 10px;
  border-bottom: 1px solid #e3e8ef;
  background: #ffffff;
}
.extJarvisTitle{
  display:flex; gap:10px; align-items:center; min-width:0;
}
.extDot{
  width: 10px; height:10px; border-radius:999px;
  background: #94a3b8;
}
.extDot.on{
  background: #2ea66f;
}
.extJarvisH{
  font-weight: 600;
  font-size: 13px;
  letter-spacing: .1px;
  color:#1f2937;
  line-height:1.1;
}
.extJarvisS{
  margin-top: 2px;
  font-size: 12px;
  color: #667085;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width: 220px;
}

.extIconBtn{
  width:38px; height:38px;
  border-radius: 12px;
  border: 1px solid #e3e8ef;
  background: #ffffff;
  color:#475467;
  cursor:pointer;
  display:grid; place-items:center;
  transition: transform .08s ease, background .12s ease, border-color .12s ease, box-shadow .12s ease;
  box-shadow: 0 1px 2px rgba(16,24,40,.04);
}
.extIconBtn:hover{
  background: #f1f4f8;
  border-color: #d6dde6;
  box-shadow: 0 8px 16px rgba(16,24,40,.10);
}
.extIconBtn:active{ transform: translateY(1px); }

.extJarvisBody{
  padding: 12px;
  background: #ffffff;
}
.extRow{
  display:flex; gap:10px; align-items:center;
}
.extMainBtn{
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: 1px solid #2ea66f;
  background: #2ea66f;
  color: #ffffff;
  font-weight: 600;
  cursor:pointer;
  transition: transform .08s ease, background .12s ease, border-color .12s ease, box-shadow .12s ease, opacity .12s ease;
  display:flex; align-items:center; justify-content:center;
  gap: 10px;
  box-shadow: 0 1px 2px rgba(16,24,40,.04);
}
.extMainBtn:hover{
  background: #1f8a58;
  border-color: #1f8a58;
  box-shadow: 0 10px 20px rgba(16,24,40,.12);
}
.extMainBtn:active{ transform: translateY(1px); }
.extMainBtn.off{
  background: #ffffff;
  border-color: #e3e8ef;
  color: #475467;
}
.extMainBtn.off:hover{
  background: #f1f4f8;
  border-color: #d6dde6;
}
.extMainBtn:disabled{ opacity:.65; cursor:not-allowed; }

.extPill{
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #e3e8ef;
  background: #ffffff;
  display:flex; flex-direction:column; justify-content:center;
  min-width: 92px;
  box-shadow: 0 1px 2px rgba(16,24,40,.04);
}
.extPillK{ font-size:11px; color: #667085; }
.extPillV{ font-size:12px; font-weight:600; color:#1f2937; }

.extMsg{
  margin-top: 10px;
  font-size: 12px;
  color: #667085;
  min-height: 16px;
}
.extMsg.ok{ color: #1f8a58; font-weight:600; }
.extMsg.err{ color: #be123c; font-weight:600; }

.extHint{
  margin-top: 8px;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px dashed #d6dde6;
  background: #ffffff;
  font-size: 12px;
  color: #667085;
  line-height: 1.35;
}

.extSpin{
  width: 14px; height:14px; border-radius:999px;
  border: 2px solid rgba(71,84,103,.25);
  border-top-color: rgba(46,166,111,.95);
  animation: extspin .7s linear infinite;
}
@keyframes extspin{ to{ transform: rotate(360deg); } }
`;
    document.documentElement.appendChild(style);
  }

  function removeWidget() {
    document.getElementById(WIDGET_ID)?.remove();
  }

  function setBusy(btn, busy) {
    btn.disabled = !!busy;
    const spin = btn.querySelector(".extSpin");
    if (busy && !spin) {
      const s = document.createElement("span");
      s.className = "extSpin";
      btn.prepend(s);
    } else if (!busy && spin) {
      spin.remove();
    }
  }

  function setStateUI(ui, enabled) {
    ui.dot.className = enabled ? "extDot on" : "extDot";
    ui.mainBtn.className = enabled ? "extMainBtn" : "extMainBtn off";
    ui.mainBtn.textContent = enabled ? t("monitoringThis") : t("enableThis");
    ui.pillV.textContent = enabled ? t("active") : t("inactive");
  }

  function setMsg(ui, text, type) {
    ui.msg.textContent = text || "";
    ui.msg.className =
      type === "ok" ? "extMsg ok" : type === "err" ? "extMsg err" : "extMsg";
  }

  function makeWidget({ slug }) {
    ensureStyle();

    const root = document.createElement("div");
    root.id = WIDGET_ID;

    const card = document.createElement("div");
    card.className = "extJarvisCard";

    const top = document.createElement("div");
    top.className = "extJarvisTop";

    const titleWrap = document.createElement("div");
    titleWrap.className = "extJarvisTitle";

    const dot = document.createElement("div");
    dot.className = "extDot";

    const textWrap = document.createElement("div");
    textWrap.style.minWidth = "0";

    const h = document.createElement("div");
    h.className = "extJarvisH";
    h.textContent = t("title");

    const s = document.createElement("div");
    s.className = "extJarvisS";
    s.textContent = `facebook.com/groups/${slug}`;

    textWrap.appendChild(h);
    textWrap.appendChild(s);

    titleWrap.appendChild(dot);
    titleWrap.appendChild(textWrap);

    const closeBtn = document.createElement("button");
    closeBtn.className = "extIconBtn";
    closeBtn.type = "button";
    closeBtn.title = t("close");
    closeBtn.innerHTML = `<span style="font-size:18px;line-height:0;">×</span>`;

    top.appendChild(titleWrap);
    top.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "extJarvisBody";

    const row = document.createElement("div");
    row.className = "extRow";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "extMainBtn";

    const pill = document.createElement("div");
    pill.className = "extPill";

    const pillK = document.createElement("div");
    pillK.className = "extPillK";
    pillK.textContent = t("status");

    const pillV = document.createElement("div");
    pillV.className = "extPillV";
    pillV.textContent = "—";

    pill.appendChild(pillK);
    pill.appendChild(pillV);

    row.appendChild(mainBtn);
    row.appendChild(pill);

    const msg = document.createElement("div");
    msg.className = "extMsg";

    body.appendChild(row);
    body.appendChild(msg);

    card.appendChild(top);
    card.appendChild(body);
    root.appendChild(card);

    requestAnimationFrame(() => card.classList.add("isOn"));

    closeBtn.addEventListener("click", () => {
      hiddenByUser = true;
      removeWidget();
    });

    return { root, card, mainBtn, msg, dot, pillV, subtitle: s };
  }

  async function mountForSlug(slug) {
    if (mounting) return;
    mounting = true;

    try {
      await loadLang();

      if (document.getElementById(WIDGET_ID) && currentSlug === slug) return;

      removeWidget();
      currentSlug = slug;
      hiddenByUser = false;

      const url = `https://www.facebook.com/groups/${slug}`;
      const status = await send({ type: "GROUP_CAN_INJECT", slug });

      if (!status?.ok) {
        removeWidget();
        return;
      }

      if (!status.allowed && !status.existing) {
        removeWidget();
        return;
      }

      const ui = makeWidget({ slug });
      document.documentElement.appendChild(ui.root);

      let enabled = !!status.existing?.enabled;
      setStateUI(ui, enabled);
      ui.subtitle.textContent = `facebook.com/groups/${slug}`;
      setMsg(ui, "", "");

      ui.mainBtn.addEventListener("click", async () => {
        setBusy(ui.mainBtn, true);
        setMsg(ui, "", "");

        const fresh = await send({ type: "GROUP_CAN_INJECT", slug });
        if (!fresh?.ok) {
          setMsg(ui, t("login"), "err");
          setBusy(ui.mainBtn, false);
          removeWidget();
          return;
        }

        const enabledNow = !!fresh.existing?.enabled;

        if (!enabledNow && !fresh.allowed && !fresh.existing) {
          setMsg(ui, t("limit", { n: fresh.limit }), "err");
          setBusy(ui.mainBtn, false);
          removeWidget();
          return;
        }

        const res = enabledNow
          ? await send({ type: "GROUP_DISABLE", slug })
          : await send({ type: "GROUP_ENABLE", slug, url });

        if (!res?.ok) {
          setMsg(ui, t("saveErr"), "err");
          setBusy(ui.mainBtn, false);
          return;
        }

        enabled = !!res.group?.enabled;
        setStateUI(ui, enabled);
        setMsg(ui, enabled ? t("enabled") : t("disabled"), "ok");
        setBusy(ui.mainBtn, false);
      });
    } finally {
      mounting = false;
    }
  }

  async function tick() {
    const slug = getSlugFromUrl(location.href);

    if (!slug) {
      currentSlug = null;
      hiddenByUser = false;
      removeWidget();
      return;
    }

    if (hiddenByUser && slug === currentSlug) return;
    if (hiddenByUser && slug !== currentSlug) hiddenByUser = false;

    if (slug !== currentSlug) {
      await mountForSlug(slug);
      return;
    }

    if (!document.getElementById(WIDGET_ID) && !hiddenByUser) {
      await mountForSlug(slug);
    }
  }

  function hookHistory() {
    const _pushState = history.pushState;
    history.pushState = function (...args) {
      const r = _pushState.apply(this, args);
      queueMicrotask(tick);
      return r;
    };

    const _replaceState = history.replaceState;
    history.replaceState = function (...args) {
      const r = _replaceState.apply(this, args);
      queueMicrotask(tick);
      return r;
    };

    window.addEventListener("popstate", () => queueMicrotask(tick));
  }

  function observeSpa() {
    const mo = new MutationObserver(() => {
      if (observeSpa._t) return;
      observeSpa._t = setTimeout(() => {
        observeSpa._t = null;
        tick();
      }, 250);
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  hookHistory();
  observeSpa();
  setInterval(tick, 1500);
  tick();
})();
