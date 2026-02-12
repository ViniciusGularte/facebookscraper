(() => {
  const GROUP_REGEX = /^https:\/\/www\.facebook\.com\/groups\/([^\/\?\#]+)/;
  const WIDGET_ID = "ext-fb-notifs-widget";

  const send = (msg) =>
    new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  let currentSlug = null;
  let mounting = false;

  function getSlugFromUrl(href) {
    const m = String(href || "").match(GROUP_REGEX);
    return m ? m[1] : null;
  }

  function removeWidget() {
    document.getElementById(WIDGET_ID)?.remove();
  }

  function setBusy(btn, busy) {
    btn.disabled = !!busy;
    btn.style.opacity = busy ? "0.7" : "1";
    btn.style.cursor = busy ? "not-allowed" : "pointer";
  }

  function setStateUI(btn, enabled) {
    btn.textContent = enabled ? "Desativar" : "Ativar";
    btn.style.background = enabled ? "#374151" : "#16a34a";
  }

  function makeWidget({ slug }) {
    const root = document.createElement("div");
    root.id = WIDGET_ID;
    root.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "width: 300px",
      "background: rgba(17,24,39,.92)",
      "color: white",
      "border: 1px solid rgba(255,255,255,.12)",
      "border-radius: 14px",
      "box-shadow: 0 12px 30px rgba(0,0,0,.35)",
      "padding: 12px",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "Notificações do Grupo";
    title.style.cssText = "font-weight:800;font-size:14px;margin-bottom:6px;";

    const subtitle = document.createElement("div");
    subtitle.textContent = `/${slug}`;
    subtitle.style.cssText =
      "opacity:.85;font-size:12px;margin-bottom:10px;word-break:break-all;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.style.cssText = [
      "flex:1",
      "border:none",
      "color:white",
      "padding:10px 12px",
      "border-radius:12px",
      "font-weight:800",
      "cursor:pointer",
    ].join(";");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.style.cssText = [
      "width:40px",
      "background:rgba(255,255,255,.08)",
      "border:1px solid rgba(255,255,255,.12)",
      "color:white",
      "padding:10px 0",
      "border-radius:12px",
      "font-size:18px",
      "cursor:pointer",
    ].join(";");

    const msg = document.createElement("div");
    msg.style.cssText =
      "margin-top:10px;font-size:12px;opacity:.9;min-height:16px;";

    closeBtn.addEventListener("click", () => removeWidget());

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(row);
    row.appendChild(mainBtn);
    row.appendChild(closeBtn);
    card.appendChild(msg);
    root.appendChild(card);

    return { root, mainBtn, msg, subtitle };
  }

  async function mountForSlug(slug) {
    if (mounting) return;
    mounting = true;

    try {
      // se já existe e é do mesmo slug, não faz nada
      if (document.getElementById(WIDGET_ID) && currentSlug === slug) return;

      removeWidget();
      currentSlug = slug;

      const url = `https://www.facebook.com/groups/${slug}`;

      const status = await send({ type: "GROUP_CAN_INJECT", slug });

      // não logado => não mostra
      if (!status?.ok) {
        removeWidget();
        return;
      }

      // regra: se não permitido e não existe => não mostra
      if (!status.allowed && !status.existing) {
        removeWidget();
        return;
      }

      const { root, mainBtn, msg, subtitle } = makeWidget({ slug });
      document.documentElement.appendChild(root);

      // estado inicial
      let enabled = !!status.existing?.enabled;
      setStateUI(mainBtn, enabled);

      // se por algum motivo o FB mudar URL sem tick ainda, mantém texto coerente
      subtitle.textContent = `/${slug}`;

      mainBtn.addEventListener("click", async () => {
        setBusy(mainBtn, true);
        msg.textContent = "";

        // revalida no clique
        const fresh = await send({ type: "GROUP_CAN_INJECT", slug });
        if (!fresh?.ok) {
          msg.textContent = "Faça login na extensão.";
          setBusy(mainBtn, false);
          removeWidget();
          return;
        }

        const enabledNow = !!fresh.existing?.enabled;

        // limite estourou e grupo não existe
        if (!enabledNow && !fresh.allowed && !fresh.existing) {
          msg.textContent = `Limite atingido (${fresh.limit}).`;
          setBusy(mainBtn, false);
          removeWidget(); // segue sua regra "não aparecer"
          return;
        }

        const res = enabledNow
          ? await send({ type: "GROUP_DISABLE", slug })
          : await send({ type: "GROUP_ENABLE", slug, url });

        if (!res?.ok) {
          msg.textContent = "Erro ao salvar.";
          setBusy(mainBtn, false);
          return;
        }

        enabled = !!res.group?.enabled;
        setStateUI(mainBtn, enabled);
        msg.textContent = enabled ? "Ativado." : "Desativado.";
        setBusy(mainBtn, false);
      });
    } finally {
      mounting = false;
    }
  }

  async function tick() {
    const slug = getSlugFromUrl(location.href);

    // saiu de /groups => remove
    if (!slug) {
      currentSlug = null;
      removeWidget();
      return;
    }

    // mudou de grupo => remonta
    if (slug !== currentSlug) {
      await mountForSlug(slug);
      return;
    }

    // se está no mesmo grupo mas widget sumiu (re-render), remonta
    if (!document.getElementById(WIDGET_ID)) {
      await mountForSlug(slug);
    }
  }

  // Hooks SPA
  const _pushState = history.pushState;
  history.pushState = function (...args) {
    const r = _pushState.apply(this, args);
    setTimeout(tick, 0);
    return r;
  };

  const _replaceState = history.replaceState;
  history.replaceState = function (...args) {
    const r = _replaceState.apply(this, args);
    setTimeout(tick, 0);
    return r;
  };

  window.addEventListener("popstate", () => setTimeout(tick, 0));

  // Fallback sólido
  setInterval(tick, 800);

  // Primeira execução
  tick();
})();
