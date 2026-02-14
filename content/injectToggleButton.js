(() => {
  const GROUP_REGEX = /^https:\/\/www\.facebook\.com\/groups\/([^\/\?\#]+)/;
  const WIDGET_ID = "ext-fb-notifs-widget";
  const STYLE_ID = "ext-fb-notifs-style";

  const send = (msg) =>
    new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  let currentSlug = null;
  let mounting = false;
  let hiddenByUser = false; // se o cara fechar, não reaparece até trocar de grupo

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
    ui.mainBtn.textContent = enabled
      ? "Monitorando este grupo"
      : "Ativar neste grupo";
    ui.pillV.textContent = enabled ? "ATIVO" : "INATIVO";
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

    // Top
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
    h.textContent = "Monitoramento do Grupo";

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
    closeBtn.title = "Fechar";
    closeBtn.innerHTML = `<span style="font-size:18px;line-height:0;">×</span>`;

    top.appendChild(titleWrap);
    top.appendChild(closeBtn);

    // Body
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
    pillK.textContent = "Status";

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

    // mount animation
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
      if (document.getElementById(WIDGET_ID) && currentSlug === slug) return;

      removeWidget();
      currentSlug = slug;
      hiddenByUser = false;

      const url = `https://www.facebook.com/groups/${slug}`;

      const status = await send({ type: "GROUP_CAN_INJECT", slug });

      // não logado => não mostra
      if (!status?.ok) {
        removeWidget();
        return;
      }

      // se não permitido e não existe => não mostra (tua regra)
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
          setMsg(ui, "Faça login na extensão.", "err");
          setBusy(ui.mainBtn, false);
          removeWidget();
          return;
        }

        const enabledNow = !!fresh.existing?.enabled;

        if (!enabledNow && !fresh.allowed && !fresh.existing) {
          setMsg(ui, `Limite atingido (${fresh.limit}).`, "err");
          setBusy(ui.mainBtn, false);
          removeWidget();
          return;
        }

        const res = enabledNow
          ? await send({ type: "GROUP_DISABLE", slug })
          : await send({ type: "GROUP_ENABLE", slug, url });

        if (!res?.ok) {
          setMsg(ui, "Erro ao salvar.", "err");
          setBusy(ui.mainBtn, false);
          return;
        }

        enabled = !!res.group?.enabled;
        setStateUI(ui, enabled);
        setMsg(
          ui,
          enabled ? "Ativado para este grupo." : "Desativado neste grupo.",
          "ok",
        );
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

    // se usuário fechou manualmente, só volta quando trocar de grupo
    if (hiddenByUser && slug === currentSlug) return;
    if (hiddenByUser && slug !== currentSlug) hiddenByUser = false;

    if (slug !== currentSlug) {
      await mountForSlug(slug);
      return;
    }

    // se está no mesmo grupo mas widget sumiu (re-render), remonta
    if (!document.getElementById(WIDGET_ID) && !hiddenByUser) {
      await mountForSlug(slug);
    }
  }

  // ----- SPA HOOKS + OBSERVER -----
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
      // FB mexe muito no DOM; debounce simples
      if (observeSpa._t) return;
      observeSpa._t = setTimeout(() => {
        observeSpa._t = null;
        tick();
      }, 250);
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  hookHistory();
  observeSpa();

  // fallback bem leve (não precisa 800ms)
  setInterval(tick, 1500);

  tick();
})();
