(() => {
  const GROUP_REGEX =
    /^https:\/\/(www|web|m)\.facebook\.com\/groups\/([^\/\?\#]+)/;

  const m = location.href.match(GROUP_REGEX);
  if (!m) return;

  const slug = m[2];
  const LOG_PREFIX = `[FB Scraper][${slug}]`;
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const err = (...a) => console.error(LOG_PREFIX, ...a);

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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function matchText(text, profile) {
    const t = (text ?? "").toLowerCase();
    const hasInclude = (profile.include ?? []).some((k) =>
      t.includes(String(k).toLowerCase()),
    );
    const hasExclude = (profile.exclude ?? []).some((k) =>
      t.includes(String(k).toLowerCase()),
    );
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

      // Caso 1: /groups/<gid|slug>/posts/<pid>/
      if (u.pathname.includes("/groups/") && u.pathname.includes("/posts/")) {
        const p = `${u.origin}${u.pathname}`.replace(/\/$/, "") + "/";
        return p;
      }

      // Caso 2: permalink.php?story_fbid=&id=
      if (u.pathname.endsWith("/permalink.php")) {
        const story = u.searchParams.get("story_fbid");
        const id = u.searchParams.get("id");
        const clean = new URL(u.origin + u.pathname);
        if (story) clean.searchParams.set("story_fbid", story);
        if (id) clean.searchParams.set("id", id);
        return clean.toString();
      }

      // Caso 3: story_fbid em qualquer lugar
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
    // fica no item do feed (mais estável)
    return el?.closest?.("div[aria-posinset]") || el;
  }

  // ✅ Autor em grupo: /groups/<gid>/user/<uid>/  OU profile.php
  function pickAuthor(el) {
    const root = getPostRoot(el);

    // 1) Ancora o bloco certo: profile_name
    const header = root.querySelector(
      '[data-ad-rendering-role="profile_name"]',
    );

    // 2) Pega o <a> do autor dentro desse bloco
    const a =
      header?.querySelector(
        'a[role="link"][href*="/groups/"][href*="/user/"]',
      ) ||
      header?.querySelector('a[role="link"][href*="profile.php"]') ||
      header?.querySelector('a[role="link"][href]') ||
      root.querySelector('a[role="link"][href*="/groups/"][href*="/user/"]') ||
      root.querySelector('a[role="link"][href*="profile.php"]');

    // 3) Nome: pegar do span/b dentro do <a> (mais confiável)
    const nameNode = a?.querySelector("span") || a?.querySelector("b") || a;
    const name =
      (nameNode?.textContent || "").replace(/\s+/g, " ").trim() || "?";

    return {
      name,
      url: a ? cleanUrl(toAbsUrl(a.getAttribute("href") || a.href)) : null,
    };
  }

  function findPostPermalinkIn(node) {
    if (!node) return null;

    // 1) primeiro: pega QUALQUER <a> com /groups/.../posts/ (sem role="link")
    const a1 = node.querySelector('a[href*="/groups/"][href*="/posts/"]');
    if (a1) return a1.getAttribute("href") || a1.href;

    // 2) fallback: permalink.php
    const a2 = node.querySelector('a[href*="permalink.php"]');
    if (a2) return a2.getAttribute("href") || a2.href;

    // 3) fallback: story_fbid
    const a3 = node.querySelector('a[href*="story_fbid="][href*="id="]');
    if (a3) return a3.getAttribute("href") || a3.href;

    return null;
  }

  function getBestHref(a) {
    if (!a) return null;

    // prioridade: a.href (DOM property) -> normalmente já resolve/normaliza
    const prop = a.href;
    if (prop && prop !== location.href) return prop;

    // fallback: atributo cru
    const raw = a.getAttribute("href");
    if (!raw) return null;

    // resolve relativo
    try {
      return new URL(raw, location.href).toString();
    } catch {
      return raw;
    }
  }
  async function materializeHref(a, timeoutMs = 1200) {
    if (!a) return null;

    const beforeAttr = a.getAttribute("href") || "";
    const beforeProp = a.href || "";

    // já tá bom?
    const isGood = (u) =>
      u &&
      (u.includes("/posts/") ||
        u.includes("permalink.php") ||
        u.includes("story_fbid="));
    if (isGood(beforeProp)) return beforeProp;

    // espera o href mudar
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

    // tenta “ativar” igual hover/focus real
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

    // lê de novo (às vezes muda sem disparar observer por troca de nó)
    const afterProp = a.href || "";
    const afterAttr = a.getAttribute("href") || "";

    return afterProp || got || afterAttr || null;
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

  async function getPostPermalink(el) {
    const root = getPostRoot(el) || el;

    // 1) tenta achar link bom “normal”
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

    // 2) pega o anchor “quebrado” e materializa
    const weird = findWeirdTimestampAnchor(root);
    if (!weird) return null;

    const href2 = await materializeHref(weird, 1500);
    if (!href2) return null;

    return normalizeFbPostUrl(href2);
  }

  async function extractPost(el) {
    await sleep(200 + Math.random() * 600);

    const root = getPostRoot(el);

    const hrefs = Array.from(root.querySelectorAll('a[role="link"]'))
      .map((a) => a.getAttribute("href") || a.href)
      .filter(Boolean);

    log("A count:", hrefs.length);
    log(
      "A posts:",
      hrefs.filter((h) => String(h).includes("/posts/")).slice(0, 5),
    );
    log(
      "A permalink:",
      hrefs
        .filter(
          (h) =>
            String(h).includes("permalink.php") ||
            String(h).includes("story_fbid="),
        )
        .slice(0, 5),
    );
    log("A sample:", hrefs.slice(0, 10));

    const textoEl = root.querySelector(
      '[data-ad-rendering-role="story_message"]',
    );
    const text = textoEl?.innerText?.trim() || "";

    const author = pickAuthor(el);
    const postUrl = await getPostPermalink(el);

    const groupUrl = `https://www.facebook.com/groups/${slug}/`;

    // Debug útil (pode comentar depois)
    log("author:", author?.name, "|", author?.url);
    log("postUrl:", postUrl);

    return {
      texto: text,
      autor: author.name,
      autorUrl: author.url,
      postUrl,
      groupUrl,
      timestamp: Date.now(),
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

  const seen = new Set();
  function keyFor(post) {
    if (post.postUrl) return `u:${post.postUrl}`;
    return `t:${(post.texto || "").slice(0, 120).toLowerCase()}`;
  }

  async function gateShouldRun() {
    const status = await send({ type: "GROUP_CAN_INJECT", slug });
    if (!status?.ok || !status?.existing?.enabled) {
      log("Gate falhou:", status?.code || "disabled/not_saved");
      return false;
    }
    return true;
  }

  async function getActiveProfile() {
    const { db_v1, profiles_v1 } = await chrome.storage.local.get([
      "db_v1",
      "profiles_v1",
    ]);
    const activeId = db_v1?.settings?.activeProfileId || "default";
    const profile = profiles_v1?.[activeId];
    if (!profile) {
      log("Sem perfil ativo:", activeId);
      return null;
    }
    return profile;
  }

  async function processVisiblePosts(profile) {
    const posts = Array.from(
      document.querySelectorAll("div[aria-posinset]"),
    ).slice(0, 40);

    log("Posts visíveis:", posts.length);

    let matches = 0;

    for (const el of posts) {
      const post = await extractPost(el);
      if (!post.texto) continue;
      if (!matchText(post.texto, profile)) continue;

      const k = keyFor(post);
      if (seen.has(k)) continue;
      seen.add(k);

      matches++;

      log(
        "MATCH:",
        post.autor,
        "|",
        post.texto.slice(0, 80),
        "| url:",
        post.postUrl,
      );

      chrome.runtime.sendMessage({
        type: "OPPORTUNITY_FOUND",
        payload: {
          slug,
          groupUrl: post.groupUrl,
          profileName: profile.name,
          post: {
            texto: post.texto,
            autor: post.autor,
            autorUrl: post.autorUrl || null,
            postUrl: post.postUrl || null,
            timestamp: post.timestamp,
          },
        },
      });
    }

    return matches;
  }

  async function runOnce() {
    if (!(await gateShouldRun())) return;

    const profile = await getActiveProfile();
    if (!profile) return;

    log("Perfil ativo:", profile.name);

    await sleep(4000 + Math.random() * 7000);

    await gentleScroll({ steps: 2 });

    let feed = await waitForFeed(25000);
    if (!feed.length) {
      log("Feed vazio. Tentando scroll extra e re-tentar...");
      await gentleScroll({ steps: 2 });
      feed = await waitForFeed(20000);
      if (!feed.length) {
        log("Feed ainda vazio. Abort.");
        return;
      }
    }

    const maxRounds = 3;
    let totalMatches = 0;

    for (let round = 1; round <= maxRounds; round++) {
      log("Round:", round);

      const m = await processVisiblePosts(profile);
      totalMatches += m;

      if (m > 0) {
        await gentleScroll({ steps: 2 });
        await sleep(1200 + Math.random() * 1200);
        continue;
      }

      if (round < maxRounds) {
        await gentleScroll({ steps: 1 });
        await sleep(900 + Math.random() * 900);
      }
    }

    log("Finalizado. Total matches:", totalMatches);
    await sleep(2000 + Math.random() * 4000);
  }

  runOnce().catch((e) => err("Erro fatal:", e));
})();
