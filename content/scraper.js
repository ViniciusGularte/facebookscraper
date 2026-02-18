// content/scraper.js
(() => {
  // suporta: https://www.facebook.com/groups/<slug|gid>
  //          https://web.facebook.com/groups/<slug|gid>
  //          https://m.facebook.com/groups/<slug|gid>
  const GROUP_REGEX =
    /^https:\/\/(www|web|m)\.facebook\.com\/groups\/([^\/\?\#]+)/;

  // ------------------------
  // infra
  // ------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const send = (msg, timeoutMs = 8000) =>
    new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, code: "TIMEOUT" });
      }, timeoutMs);

      chrome.runtime.sendMessage(msg, (res) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(res);
      });
    });

  function currentSlug() {
    const m = String(location.href || "").match(GROUP_REGEX);
    return m ? m[2] : null;
  }

  function LOG_PREFIX() {
    return `[FB Scraper][${currentSlug() || "?"}]`;
  }
  const log = (...a) => console.log(LOG_PREFIX(), ...a);
  const err = (...a) => console.error(LOG_PREFIX(), ...a);

  // ------------------------
  // match / parsing helpers
  // ------------------------
  function matchText(text, profile) {
    const t = (text ?? "").toLowerCase();
    const inc = Array.isArray(profile?.include) ? profile.include : [];
    const exc = Array.isArray(profile?.exclude) ? profile.exclude : [];

    // include: precisa ter pelo menos 1 (se não tiver include, nunca dá match)
    const hasInclude = inc.some((k) => t.includes(String(k).toLowerCase()));
    const hasExclude = exc.some((k) => t.includes(String(k).toLowerCase()));
    return hasInclude && !hasExclude;
  }

  function toAbsUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return href;
    }
  }

  function cleanUrl(u) {
    if (!u) return null;
    try {
      const url = new URL(u, location.origin);
      [
        "__cft__",
        "__tn__",
        "ref",
        "refid",
        "acontext",
        "comment_id",
        "notif_t",
        "notif_id",
        "rdid",
        "share_url",
        "fbclid",
      ].forEach((k) => url.searchParams.delete(k));
      url.hash = "";
      return url.toString();
    } catch {
      return String(u).split("?")[0].split("&")[0];
    }
  }

  function normalizeFbPostUrl(href) {
    const abs = toAbsUrl(href);
    if (!abs) return null;

    try {
      const u = new URL(abs);

      [
        "__cft__",
        "__tn__",
        "ref",
        "refid",
        "acontext",
        "notif_id",
        "notif_t",
        "rdid",
        "share_url",
        "fbclid",
      ].forEach((k) => u.searchParams.delete(k));

      // /groups/<gid|slug>/posts/<pid>/
      if (u.pathname.includes("/groups/") && u.pathname.includes("/posts/")) {
        const p = `${u.origin}${u.pathname}`.replace(/\/$/, "") + "/";
        return p;
      }

      // permalink.php?story_fbid=&id=
      if (u.pathname.endsWith("/permalink.php")) {
        const story = u.searchParams.get("story_fbid");
        const id = u.searchParams.get("id");
        const clean = new URL(u.origin + u.pathname);
        if (story) clean.searchParams.set("story_fbid", story);
        if (id) clean.searchParams.set("id", id);
        return clean.toString();
      }

      // story_fbid&id em qualquer lugar
      if (u.searchParams.get("story_fbid") && u.searchParams.get("id")) {
        const clean = new URL(u.origin + "/permalink.php");
        clean.searchParams.set("story_fbid", u.searchParams.get("story_fbid"));
        clean.searchParams.set("id", u.searchParams.get("id"));
        return clean.toString();
      }

      u.hash = "";
      return u.toString();
    } catch {
      return cleanUrl(abs);
    }
  }

  function getPostRoot(el) {
    return el?.closest?.("div[aria-posinset]") || el;
  }

  function pickAuthor(el) {
    const root = getPostRoot(el);

    const header = root.querySelector(
      '[data-ad-rendering-role="profile_name"]',
    );

    const a =
      header?.querySelector(
        'a[role="link"][href*="/groups/"][href*="/user/"]',
      ) ||
      header?.querySelector('a[role="link"][href*="profile.php"]') ||
      header?.querySelector('a[role="link"][href]') ||
      root.querySelector('a[role="link"][href*="/groups/"][href*="/user/"]') ||
      root.querySelector('a[role="link"][href*="profile.php"]');

    const nameNode = a?.querySelector("span") || a?.querySelector("b") || a;
    const name =
      (nameNode?.textContent || "").replace(/\s+/g, " ").trim() || "?";

    return {
      name,
      url: a ? cleanUrl(toAbsUrl(a.getAttribute("href") || a.href)) : null,
    };
  }

  function findWeirdTimestampAnchor(root) {
    if (!root) return null;
    const candidates = Array.from(
      root.querySelectorAll(
        'a[role="link"][target="_blank"], a[target="_blank"]',
      ),
    );
    return (
      candidates.find((a) => {
        const h = (a.getAttribute("href") || "").trim();
        return h.startsWith("?__cft__") || h.includes("#?igf");
      }) || null
    );
  }

  async function materializeHref(a, timeoutMs = 1200) {
    if (!a) return null;

    const beforeAttr = a.getAttribute("href") || "";
    const beforeProp = a.href || "";

    const isGood = (u) =>
      u &&
      (u.includes("/posts/") ||
        u.includes("permalink.php") ||
        u.includes("story_fbid="));
    if (isGood(beforeProp)) return beforeProp;

    const changed = new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        const nowProp = a.href || "";
        const nowAttr = a.getAttribute("href") || "";
        if (
          (nowAttr && nowAttr !== beforeAttr) ||
          (nowProp && nowProp !== beforeProp)
        ) {
          obs.disconnect();
          resolve(nowProp || nowAttr);
        }
      });
      obs.observe(a, { attributes: true, attributeFilter: ["href"] });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });

    try {
      a.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {}
    try {
      a.focus({ preventScroll: true });
    } catch {}

    a.dispatchEvent(
      new MouseEvent("mouseover", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    a.dispatchEvent(
      new MouseEvent("mouseenter", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    a.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    a.dispatchEvent(
      new MouseEvent("pointerover", { bubbles: true, cancelable: true }),
    );
    a.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true, cancelable: true }),
    );

    const got = await changed;

    const afterProp = a.href || "";
    const afterAttr = a.getAttribute("href") || "";

    return afterProp || got || afterAttr || null;
  }

  async function getPostPermalink(el) {
    const root = getPostRoot(el) || el;

    const direct = Array.from(root.querySelectorAll("a[role='link'], a"))
      .map((a) => a.href)
      .find(
        (h) =>
          h &&
          h.includes("/groups/") &&
          (h.includes("/posts/") ||
            h.includes("permalink.php") ||
            h.includes("story_fbid=")),
      );
    if (direct) return normalizeFbPostUrl(direct);

    const weird = findWeirdTimestampAnchor(root);
    if (!weird) return null;

    const href2 = await materializeHref(weird, 1500);
    if (!href2) return null;

    return normalizeFbPostUrl(href2);
  }

  function extractPostLite(el) {
    const root = getPostRoot(el);

    const textoEl = root.querySelector(
      '[data-ad-rendering-role="story_message"]',
    );
    const text = textoEl?.innerText?.trim() || "";

    const author = pickAuthor(el);

    return {
      texto: text,
      autor: author.name,
      autorUrl: author.url,
      timestamp: Date.now(),
    };
  }

  async function extractPostFull(el, slug) {
    await sleep(120 + Math.random() * 250);

    const lite = extractPostLite(el);
    const postUrl = await getPostPermalink(el);

    // mantém o groupUrl sempre no host "www" (pra padrão)
    const groupUrl = `https://www.facebook.com/groups/${slug}/`;

    return {
      ...lite,
      postUrl,
      groupUrl,
    };
  }

  async function waitForFeed(maxWait = 25000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const els = document.querySelectorAll("div[aria-posinset]");
      if (els.length >= 3) return els;
      await sleep(900 + Math.random() * 1700);
    }
    return [];
  }

  async function gentleScroll({ steps = 3, minPx = 450, maxPx = 850 } = {}) {
    for (let i = 0; i < steps; i++) {
      const px = Math.floor(minPx + Math.random() * (maxPx - minPx));
      window.scrollBy({ top: px, behavior: "smooth" });
      await sleep(1200 + Math.random() * 1800);
    }
  }

  // ------------------------
  // dedupe + gate/profile
  // ------------------------
  const seen = new Set();

  function keyForText(texto) {
    return `t:${(texto || "").slice(0, 120).toLowerCase()}`;
  }
  function keyForUrl(url) {
    return url ? `u:${url}` : null;
  }

  async function gateShouldRun(slug) {
    const status = await send({ type: "GROUP_CAN_INJECT", slug });
    if (!status?.ok || !status?.existing?.enabled) {
      log("Gate falhou:", status?.code || "disabled/not_saved");
      return { ok: false, status };
    }
    return { ok: true, status };
  }

  async function getActiveProfile() {
    const { db_v1, profiles_v1 } = await chrome.storage.local.get([
      "db_v1",
      "profiles_v1",
    ]);
    const activeId = db_v1?.settings?.activeProfileId || "default";
    const profile = profiles_v1?.[activeId];
    if (!profile) return null;
    return profile;
  }

  // ------------------------
  // main scan
  // ------------------------
  async function processVisiblePosts(profile, slug) {
    const posts = Array.from(
      document.querySelectorAll("div[aria-posinset]"),
    ).slice(0, 40);

    log("Posts visíveis:", posts.length);

    let matches = 0;
    let evaluated = 0;

    for (const el of posts) {
      const lite = extractPostLite(el);
      if (!lite.texto) continue;

      evaluated++;

      if (!matchText(lite.texto, profile)) continue;

      const kText = keyForText(lite.texto);
      if (seen.has(kText)) continue;

      const full = await extractPostFull(el, slug);

      const kUrl = keyForUrl(full.postUrl);
      if (kUrl && seen.has(kUrl)) {
        seen.add(kText);
        continue;
      }

      seen.add(kText);
      if (kUrl) seen.add(kUrl);

      matches++;

      chrome.runtime.sendMessage({
        type: "OPPORTUNITY_FOUND",
        payload: {
          slug,
          groupUrl: full.groupUrl,
          profileName: profile.name,
          post: {
            texto: full.texto,
            autor: full.autor,
            autorUrl: full.autorUrl || null,
            postUrl: full.postUrl || null,
            timestamp: full.timestamp,
          },
        },
      });
    }

    return { matches, evaluated, scanned: posts.length };
  }

  async function runOnce({ runId, roundMax = 3 } = {}) {
    const slug = currentSlug();
    if (!slug) {
      log("Não está em /groups/. Abort.");
      return { ok: false, code: "NOT_IN_GROUP" };
    }

    const gate = await gateShouldRun(slug);
    if (!gate.ok) return { ok: false, code: "GATE_BLOCK", gate };

    const profile = await getActiveProfile();
    if (!profile) {
      log("Sem profile ativo.");
      return { ok: false, code: "NO_PROFILE" };
    }

    log("Rodando scrape. runId:", runId || "-", "| profile:", profile.name);

    // jitter inicial
    await sleep(1500 + Math.random() * 2500);

    await gentleScroll({ steps: 2 });

    let feed = await waitForFeed(25000);
    if (!feed.length) {
      log("Feed vazio. Tentando scroll extra...");
      await gentleScroll({ steps: 2 });
      feed = await waitForFeed(20000);
      if (!feed.length) {
        log("Feed ainda vazio. Abort.");
        return { ok: false, code: "EMPTY_FEED" };
      }
    }

    let totalMatches = 0;
    let totalEvaluated = 0;
    let totalScanned = 0;

    for (let round = 1; round <= roundMax; round++) {
      log("Round:", round);

      const r = await processVisiblePosts(profile, slug);
      totalMatches += r.matches;
      totalEvaluated += r.evaluated;
      totalScanned += r.scanned;

      if (r.matches > 0) {
        await gentleScroll({ steps: 2 });
        await sleep(900 + Math.random() * 900);
        continue;
      }

      if (round < roundMax) {
        await gentleScroll({ steps: 1 });
        await sleep(700 + Math.random() * 700);
      }
    }

    log("Finalizado. totalMatches:", totalMatches);

    return {
      ok: true,
      slug,
      runId: runId || null,
      stats: {
        totalMatches,
        totalEvaluated,
        totalScanned,
      },
    };
  }

  // ------------------------
  // control: only run when runner arms it
  // ------------------------
  let running = false;
  let armed = false;
  let activeRunId = null;

  async function startRun(runId) {
    if (running) return { ok: true, code: "ALREADY_RUNNING" };
    running = true;
    armed = true;
    activeRunId = runId || null;

    try {
      const res = await runOnce({ runId: activeRunId, roundMax: 3 });

      // avisa o background que terminou esse grupo (para trocar a aba/URL)
      chrome.runtime.sendMessage({
        type: "SCRAPER_DONE",
        payload: {
          runId: activeRunId,
          slug: res?.slug || currentSlug() || null,
          ok: !!res?.ok,
          code: res?.code || null,
          stats: res?.stats || null,
        },
      });

      return res;
    } catch (e) {
      err("Erro fatal:", e);
      chrome.runtime.sendMessage({
        type: "SCRAPER_DONE",
        payload: {
          runId: activeRunId,
          slug: currentSlug() || null,
          ok: false,
          code: "FATAL",
        },
      });
      return { ok: false, code: "FATAL" };
    } finally {
      running = false;
      // mantém armed=true se você quiser permitir retrigger pelo runner
      // se quiser auto-desarmar, troca pra: armed = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "SCRAPER_START") {
      // opcional: o runner pode mandar { runId }
      startRun(msg.runId);
      reply?.({ ok: true });
      return true;
    }

    if (msg.type === "SCRAPER_STOP") {
      armed = false;
      activeRunId = null;
      reply?.({ ok: true });
      return true;
    }

    if (msg.type === "SCRAPER_STATUS") {
      reply?.({
        ok: true,
        running,
        armed,
        runId: activeRunId,
        href: location.href,
        slug: currentSlug(),
      });
      return true;
    }
  });

  // Nada de auto-run aqui.
})();
