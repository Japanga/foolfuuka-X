(() => {
  "use strict";

  // FoolFuuka X must not run any archive/board integrations on 4chan.
  // Keep only this small notice active there, then exit before installing
  // styles, observers, navigation handlers, or post-processing features.
  const currentHost = location.hostname.toLowerCase();
  const isFourChan = currentHost === "4chan.org" || currentHost.endsWith(".4chan.org") ||
    currentHost === "4channel.org" || currentHost.endsWith(".4channel.org");
  const isDesuarchive = currentHost === "desuarchive.org" || currentHost.endsWith(".desuarchive.org");

  function showFfxSiteNotice(message, kind) {
    const show = () => {
      if (!document.body || document.getElementById("ffx-site-status-notice")) return;
      const notice = document.createElement("div");
      notice.id = "ffx-site-status-notice";
      notice.textContent = message;
      Object.assign(notice.style, {
        position: "fixed", top: "12px", right: "12px", zIndex: "2147483647",
        maxWidth: "min(440px, calc(100vw - 32px))", boxSizing: "border-box",
        padding: "11px 15px", borderRadius: "5px",
        border: kind === "warning" ? "1px solid #b94a48" : "1px solid #248b48",
        background: kind === "warning" ? "#7f2424" : "#176b35",
        color: "#fff", font: "bold 13px/1.4 Arial, sans-serif",
        boxShadow: "0 3px 14px #0008", opacity: "1",
        transition: "opacity .35s ease"
      });
      document.body.appendChild(notice);
      window.setTimeout(() => {
        notice.style.opacity = "0";
        window.setTimeout(() => notice.remove(), 400);
      }, 5000);
    };
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }

  if (isFourChan) {
    showFfxSiteNotice("FoolFuuka X has been temporarily disabled because you are browsing 4chan.org. All extension features are suspended on 4chan.", "warning");
    try { chrome.storage.local.set({ ffxSuspendedOnFourChan: true }); } catch (_) {}
    return;
  }

  if (isDesuarchive) {
    try {
      chrome.storage.local.get({ ffxSuspendedOnFourChan: false }, data => {
        if (data.ffxSuspendedOnFourChan) {
          showFfxSiteNotice("FoolFuuka X has been re-enabled on Desuarchive.", "success");
          chrome.storage.local.set({ ffxSuspendedOnFourChan: false });
        }
      });
    } catch (_) {}
  }


  // Floating image gallery: individual Desuarchive thread pages only.
  function initThreadGallery() {
    if (!isDesuarchive || !/^\/[a-z0-9]+\/thread\/\d+\/?$/i.test(location.pathname)) return;
    if (document.getElementById("ffx-thread-gallery")) return;

    const posts = [...document.querySelectorAll("article.post:not(.stub), .post:not(.stub)")];
    const items = [];
    const seen = new Set();

    for (const post of posts) {
      // FoolFuuka exposes the original file through `.thread_image_link`.
      // Only accept direct media-host URLs here: broad `a[href]` matching can
      // accidentally capture a reverse-image-search/redirect link instead.
      const candidates = [...post.querySelectorAll(
        "a.thread_image_link[href], a.fileThumb[href], a.post_image[href]"
      )];
      const isImageFile = url => /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:[?#].*)?$/i.test(url);
      const directMediaLink = candidates.find(a => {
        try {
          const u = new URL(a.href, location.href);
          return u.hostname === "desu-usergeneratedcontent.xyz" && isImageFile(u.href) && !seen.has(u.href);
        } catch (_) { return false; }
      });
      const thumb = directMediaLink?.querySelector("img") ||
        post.querySelector("a.thread_image_link img, a.fileThumb img, .post_image img, img");

      // Some layouts expose only the thumbnail URL. Convert its archive path
      // to the corresponding full-resolution `/image/` path on the media host.
      let fullResUrl = directMediaLink?.href || "";
      if (!fullResUrl && thumb) {
        try {
          const u = new URL(thumb.currentSrc || thumb.src, location.href);
          if (u.hostname === "desu-usergeneratedcontent.xyz" && /\/thumb\//i.test(u.pathname)) {
            u.pathname = u.pathname.replace(/\/thumb\//i, "/image/").replace(/s(?=\.[^.]+$)/i, "");
            fullResUrl = u.href;
          }
        } catch (_) {}
      }
      if (!fullResUrl || !isImageFile(fullResUrl) || seen.has(fullResUrl)) continue;
      seen.add(fullResUrl);
      const idNode = post.querySelector(
        ".post_number, .post_num, .post_no, .post_id, [id^='p'], a[href*='#p']"
      );
      const dateNode = post.querySelector(
        "time[datetime], time, .post_date, .post_time, .post_timestamp, .timestamp"
      );
      // FoolFuuka's rendered post body is commonly exposed as `.text`.
      // Prefer that exact content node: the broader legacy selectors can
      // resolve to an outer wrapper (or miss the body entirely) on some
      // Desuarchive thread layouts.
      const textNode = post.querySelector(".text");
      const legacyBodyNode = post.querySelector(
        ".post_message, .post_body, .post_content, blockquote, .post_comment, .post_text"
      );
      const bodyNode = textNode && (textNode.innerText || textNode.textContent || "").trim()
        ? textNode : legacyBodyNode;
      const postId = (idNode?.textContent || post.id || "").trim();
      const date = (dateNode?.getAttribute("datetime") || dateNode?.title ||
        dateNode?.textContent || "").trim();
      const postText = (bodyNode?.innerText || bodyNode?.textContent || "")
        .trim().replace(/\s+/g, " ");

      items.push({
        href: fullResUrl,
        thumb: thumb ? (thumb.currentSrc || thumb.src) : fullResUrl,
        postId, date, postText
      });
    }

    if (!items.length) return;

    const panel = document.createElement("section");
    panel.id = "ffx-thread-gallery";
    panel.setAttribute("aria-label", "Thread image gallery");
    Object.assign(panel.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483000",
      width: "min(330px, calc(100vw - 24px))", maxHeight: "min(38vh, 290px)",
      display: "flex", flexDirection: "column", color: "#fff",
      background: "rgba(0,0,0,.80)", border: "1px solid rgba(255,255,255,.22)",
      borderRadius: "9px", boxShadow: "0 5px 22px rgba(0,0,0,.48)",
      backdropFilter: "blur(7px)", overflow: "hidden",
      font: "12px/1.4 Arial,sans-serif"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 9px", cursor: "move", userSelect: "none",
      background: "rgba(255,255,255,.10)", fontWeight: "700", flex: "0 0 auto"
    });
    const heading = document.createElement("span");
    heading.textContent = `Thread gallery · ${items.length} images`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close gallery";
    Object.assign(close.style, {
      border: "0", background: "transparent", color: "#fff",
      fontSize: "20px", lineHeight: "18px", cursor: "pointer", padding: "0 2px"
    });
    close.addEventListener("click", () => {
      panel.remove();
      document.getElementById("ffx-gallery-tooltip")?.remove();
    });
    header.append(heading, close);

    // A fixed-size tile grid prevents thumbnail overlap and scrolls for long threads.
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid", gridTemplateColumns: "repeat(5, 52px)",
      gridAutoRows: "52px", justifyContent: "start", alignContent: "start",
      gap: "7px", padding: "9px", overflowY: "auto", overflowX: "hidden",
      flex: "1 1 auto", minHeight: "0", boxSizing: "border-box"
    });

    const tooltip = document.createElement("div");
    tooltip.id = "ffx-gallery-tooltip";
    Object.assign(tooltip.style, {
      position: "fixed", display: "none", zIndex: "2147483647",
      width: "min(320px, calc(100vw - 24px))", maxHeight: "min(220px, 40vh)",
      overflow: "auto", boxSizing: "border-box", padding: "10px 12px",
      borderRadius: "7px", color: "#fff", background: "rgba(12,12,12,.97)",
      border: "1px solid rgba(255,255,255,.28)",
      boxShadow: "0 5px 18px rgba(0,0,0,.65)", pointerEvents: "none",
      whiteSpace: "normal", overflowWrap: "anywhere",
      font: "12px/1.45 Arial,sans-serif"
    });

    const hideTooltip = () => { tooltip.style.display = "none"; };
    items.forEach((item, index) => {
      const tile = document.createElement("a");
      tile.href = item.href;
      tile.target = "_blank";
      tile.rel = "noopener noreferrer";
      tile.title = `Open image ${index + 1}`;
      Object.assign(tile.style, {
        display: "block", width: "52px", height: "52px",
        boxSizing: "border-box", overflow: "hidden", borderRadius: "5px",
        background: "rgba(255,255,255,.10)",
        border: "1px solid rgba(255,255,255,.22)"
      });
      const image = document.createElement("img");
      image.src = item.thumb;
      image.alt = `Post ${item.postId || index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";
      Object.assign(image.style, {
        display: "block", width: "100%", height: "100%", objectFit: "cover"
      });
      tile.appendChild(image);

      tile.addEventListener("mouseenter", () => {
        tooltip.replaceChildren();
        const title = document.createElement("div");
        title.textContent = item.postId ? `Post ${item.postId}` : `Image ${index + 1}`;
        title.style.cssText = "font-weight:bold;margin-bottom:4px;color:#fff";
        tooltip.appendChild(title);
        if (item.date) {
          const date = document.createElement("div");
          date.textContent = item.date;
          date.style.cssText = "color:#bbb;margin-bottom:6px";
          tooltip.appendChild(date);
        }
        const text = document.createElement("div");
        text.textContent = item.postText || "(No post text found)";
        text.style.cssText = "color:#eee;white-space:pre-wrap";
        tooltip.appendChild(text);
        tooltip.style.display = "block";
        const r = tile.getBoundingClientRect();
        const tw = Math.min(320, window.innerWidth - 24);
        let left = r.left + r.width / 2 - tw / 2;
        left = Math.max(12, Math.min(window.innerWidth - tw - 12, left));
        const estimatedHeight = Math.min(220, tooltip.scrollHeight || 100);
        let top = r.top - estimatedHeight - 10;
        if (top < 10) top = Math.min(window.innerHeight - estimatedHeight - 10, r.bottom + 10);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(10, top)}px`;
      });
      tile.addEventListener("mouseleave", hideTooltip);
      grid.appendChild(tile);
    });

    panel.append(header, grid);
    document.body.appendChild(panel);
    document.body.appendChild(tooltip);

    // Drag the panel by its header; constrain it to the visible viewport.
    let drag = null;
    header.addEventListener("pointerdown", event => {
      if (event.target === close) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener("pointermove", event => {
      if (!drag) return;
      const x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - drag.x));
      const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, event.clientY - drag.y));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    });
    const stopDrag = () => { drag = null; };
    header.addEventListener("pointerup", stopDrag);
    header.addEventListener("pointercancel", stopDrag);
  }

  const startGallery = () => { if (document.body) initThreadGallery(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startGallery, { once: true });
  } else {
    startGallery();
  }

  const STORAGE_KEY = "ghostFilterHiddenPosts";
  const KEYWORDS_KEY = "ghostFilterKeywords";
  const USERNAMES_KEY = "ghostFilterUsernames";
  const CATBOX_EMBED_KEY = "ffxCatboxInstantEmbed";
  const GHOST_ICON_MARKER = "data-ffx-ghost-icon";
  const HIDDEN_MARKER = "data-ghost-filter-key";
  const BUTTON_MARKER = "data-gf-hide-button-added";
  const DISMISSED_FILTER = "data-gf-filter-dismissed";
  const HIDE_REASON = "data-gf-hide-reason";
  const ORIGINAL_DISPLAY = "data-gf-original-display";
  const ORIGINAL_DISPLAY_PRIORITY = "data-gf-original-display-priority";

  let hidden = new Set();
  let keywords = [];
  let usernames = [];
  let catboxInstantEmbed = false;
  let scanQueued = false;
  let scanning = false;

  const style = document.createElement("style");
  style.id = "ghost-filter-styles";
  style.textContent = `
    .gf-hidden-placeholder {
      box-sizing: border-box; margin: 8px 0; padding: 8px 10px;
      border: 1px dashed #777; border-radius: 4px;
      color: #aaa; background: #292929;
      font: 12px/1.4 Arial, sans-serif;
    }
    .gf-hidden-placeholder button {
      margin-left: 8px; padding: 3px 8px;
      border: 1px solid #666; border-radius: 3px;
      background: #3b3b3b; color: #bbb;
      cursor: pointer; font: 12px Arial, sans-serif;
    }
    .ffx-developer-capcode { color: rgb(0, 0, 255) !important; font-weight: 700 !important; }
    .ffx-catbox-link { cursor: pointer !important; }
    /* When media is embedded, keep the anchor in the DOM for state/URL tracking but hide its visible text. */
    .ffx-catbox-link[data-ffx-catbox-embedded="1"] { display:none !important; }
    .ffx-catbox-embed { display:block !important; width:fit-content; max-width:100%; margin:8px 0; overflow:hidden; }
    .ffx-catbox-embed img, .ffx-catbox-embed video { display:block !important; width:auto !important; height:auto !important; max-width:min(100%, 640px) !important; max-height:480px !important; object-fit:contain !important; }
    .ffx-catbox-hover { position:fixed; z-index:2147483647; max-width:min(70vw, 560px); max-height:65vh; padding:6px; border:1px solid #777; border-radius:4px; background:#202020; box-shadow:0 4px 18px #000b; pointer-events:none; overflow:hidden; }
    .ffx-catbox-hover img, .ffx-catbox-hover video { display:block; width:auto; height:auto; max-width:min(68vw, 548px); max-height:60vh; object-fit:contain; }

    .ffx-ghost-indicator { display:inline-flex !important; align-items:center !important; justify-content:center !important; width:18px !important; height:18px !important; margin:0 0 0 4px !important; vertical-align:middle !important; color:#d8d8d8 !important; line-height:1 !important; }
    .ffx-ghost-indicator svg { display:block !important; width:18px !important; height:18px !important; fill:#d8d8d8 !important; color:#d8d8d8 !important; }
    .ffx-bbcode-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin:7px 0 5px; padding:7px; border:1px solid #555; border-radius:4px; background:#292929; }
    .ffx-bbcode-toolbar button { min-width:30px; min-height:27px; padding:4px 8px; border:1px solid #666; border-radius:3px; background:#3b3b3b; color:#eee; font:13px/1.4 Arial,sans-serif; cursor:pointer; }
    .ffx-bbcode-toolbar button:hover { background:#505050; border-color:#999; }
    .ffx-bbcode-toolbar .ffx-bb-bold { font-weight:900; }
    .ffx-bbcode-toolbar .ffx-bb-italic { font-style:italic; }
    .ffx-bbcode-toolbar .ffx-bb-underline { text-decoration:underline; }
    .ffx-bbcode-toolbar .ffx-bb-strike { text-decoration:line-through; }
    .ffx-bbcode-toolbar .ffx-bb-spoiler { display:inline-flex; align-items:center; justify-content:center; }
    .ffx-bbcode-toolbar .ffx-bb-spoiler svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .ffx-bbcode-toolbar .ffx-bb-code { font-family:monospace; font-weight:bold; }
    .ffx-bbcode-toolbar .ffx-bb-banned { color:#ff0000 !important; font-weight:900; }
    .ffx-b4k-nav-link { display:inline-block !important; margin:2px 7px !important; padding:3px 7px !important; border:1px solid #777 !important; border-radius:3px !important; color:#fff !important; background:#343434 !important; font:12px/1.4 Arial,sans-serif !important; text-decoration:none !important; white-space:nowrap !important; }
    .ffx-b4k-nav-link:hover { background:#505050 !important; color:#fff !important; }
    .gf-hide-button {
      display: inline-block !important; visibility: visible !important;
      opacity: 1 !important; margin: 3px 0 3px 7px !important;
      padding: 2px 8px !important; border: 1px solid #555 !important;
      border-radius: 3px !important; background: #3b3b3b !important;
      color: #bdbdbd !important; font: 11px/1.5 Arial,sans-serif !important;
      cursor: pointer !important; vertical-align: middle !important;
      box-shadow: none !important; text-shadow: none !important;
    }
    .gf-hide-button:hover {
      background: #4a4a4a !important; color: #e0e0e0 !important;
      border-color: #777 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function storageGet(defaults) {
    return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
  }
  function storageSet(values) {
    return new Promise(resolve => chrome.storage.local.set(values, resolve));
  }
  async function load() {
    const data = await storageGet({ [STORAGE_KEY]: [], [KEYWORDS_KEY]: [], [USERNAMES_KEY]: [], [CATBOX_EMBED_KEY]: false });
    hidden = new Set(Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []);
    keywords = normalizeKeywords(data[KEYWORDS_KEY]);
    usernames = normalizeKeywords(data[USERNAMES_KEY]);
    catboxInstantEmbed = data[CATBOX_EMBED_KEY] === true;
  }
  function normalizeKeywords(value) {
    const list = Array.isArray(value) ? value : [];
    return [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
  }

  function boardName() {
    return location.pathname.split("/").filter(Boolean)[0] || "unknown";
  }
  function parsePost(node) {
    const candidates = [node.getAttribute("data-post-id"), node.getAttribute("data-num"), node.id].filter(Boolean);
    for (const raw of candidates) {
      const match = String(raw).match(/(?:^|[^0-9])(\d+)(?:_(\d+))?$/);
      if (match) return { num: match[1], subnum: match[2] || null };
    }
    for (const link of node.querySelectorAll('a[href*="#"], a[href*="/thread/"]')) {
      const raw = `${link.getAttribute("href") || ""} ${link.id || ""}`;
      const match = raw.match(/(?:#|\/)(\d+)(?:_(\d+))?(?:$|[/?&])/);
      if (match) return { num: match[1], subnum: match[2] || null };
    }
    return null;
  }
  function isGhost(node, parsed) {
    if (!parsed || parsed.subnum === null || !/^[1-9]\d*$/.test(parsed.subnum)) return false;
    const cls = typeof node.className === "string" ? node.className : "";
    const marker = [node.id || "", cls, node.getAttribute("data-post-id") || "", node.getAttribute("data-num") || ""].join(" ").toLowerCase();
    return node.matches(".post, .post_wrapper, .thread, [data-post-id], [data-num]") &&
      (/post|reply|thread/.test(marker) || node.matches(".post, .post_wrapper"));
  }
  function postNodes() {
    const nodes = document.querySelectorAll(".post, .post_wrapper, .thread .post, [data-post-id], [data-num]");
    return [...new Set(nodes)].filter(node => node instanceof HTMLElement);
  }
  function keyFor(parsed) {
    return `${location.hostname}|${boardName()}|${parsed.num}_${parsed.subnum}`;
  }
  function postIdFromKey(key) { return key.split("|").pop(); }

  function actuallyHide(post) {
    if (!post.hasAttribute(ORIGINAL_DISPLAY)) {
      post.setAttribute(ORIGINAL_DISPLAY, post.style.getPropertyValue("display"));
      post.setAttribute(ORIGINAL_DISPLAY_PRIORITY, post.style.getPropertyPriority("display"));
    }
    post.hidden = true;
    post.style.setProperty("display", "none", "important");
    post.style.setProperty("visibility", "hidden", "important");
  }
  function restoreVisibility(post) {
    post.hidden = false;
    post.style.removeProperty("visibility");
    const oldDisplay = post.getAttribute(ORIGINAL_DISPLAY);
    const oldPriority = post.getAttribute(ORIGINAL_DISPLAY_PRIORITY) || "";
    if (oldDisplay) post.style.setProperty("display", oldDisplay, oldPriority);
    else post.style.removeProperty("display");
    post.removeAttribute(ORIGINAL_DISPLAY);
    post.removeAttribute(ORIGINAL_DISPLAY_PRIORITY);
  }

  function hidePost(post, key, reason = "manual") {
    if (post.hasAttribute(HIDDEN_MARKER)) {
      actuallyHide(post);
      return;
    }
    const placeholder = document.createElement("div");
    placeholder.className = "gf-hidden-placeholder";
    placeholder.textContent = `Ghost post hidden (${postIdFromKey(key)}). `;
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.textContent = "Reveal";
    reveal.addEventListener("click", async () => {
      if (reason === "keyword" || reason === "username") post.setAttribute(DISMISSED_FILTER, "1");
      if (reason === "manual") {
        hidden.delete(key);
        await storageSet({ [STORAGE_KEY]: [...hidden] });
      }
      restoreVisibility(post);
      post.removeAttribute(HIDDEN_MARKER);
      post.removeAttribute(HIDE_REASON);
      // Keep BUTTON_MARKER and the existing button: rescanning must not append another.
      placeholder.replaceWith(post);
      scheduleScan();
    });
    placeholder.appendChild(reveal);
    post.setAttribute(HIDDEN_MARKER, key);
    post.setAttribute(HIDE_REASON, reason);
    post.insertAdjacentElement("beforebegin", placeholder);
    actuallyHide(post);
  }

  function addHideButton(post, key) {
    // The marker alone is not enough: also detect an existing button in case the
    // post was restored/reparented by the archive's own DOM updates.
    if (post.querySelector(".gf-hide-button")) {
      post.setAttribute(BUTTON_MARKER, "1");
      return;
    }
    if (post.hasAttribute(BUTTON_MARKER)) post.removeAttribute(BUTTON_MARKER);
    if (post.hasAttribute(HIDDEN_MARKER)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gf-hide-button";
    button.textContent = "Hide";
    button.title = "Hide this individual ghost post";
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      hidden.add(key);
      await storageSet({ [STORAGE_KEY]: [...hidden] });
      hidePost(post, key, "manual");
    });
    const header = post.querySelector(".post_head, .post-header, .posthead, header");
    if (header) header.appendChild(button);
    else post.insertBefore(button, post.firstChild);
    post.setAttribute(BUTTON_MARKER, "1");
  }

  function matchedKeyword(post) {
    if (!keywords.length || post.hasAttribute(DISMISSED_FILTER)) return null;
    const content = (post.innerText || post.textContent || "").toLocaleLowerCase();
    return keywords.find(word => content.includes(word.toLocaleLowerCase())) || null;
  }

  function posterUsername(post) {
    const node = post.querySelector(".postername, .poster_name, .poster-name, .post_author, .post-author, .name");
    if (!node) return "";
    return (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ");
  }

  function matchedUsername(post) {
    if (!usernames.length || post.hasAttribute(DISMISSED_FILTER)) return null;
    const username = posterUsername(post).toLocaleLowerCase();
    if (!username) return null;
    return usernames.find(entry => username === entry.toLocaleLowerCase()) || null;
  }

  function postVisualRoot(post) {
    // FoolFuuka commonly places .postInfo beside .post_wrapper inside an article,
    // rather than inside the wrapper itself. Include that outer article when
    // looking for the post's reply/speech-bubble controls.
    return post.closest('article') || post.closest('.thread') || post.parentElement || post;
  }

  function speechBubbleTarget(post) {
    // FoolFuuka's post-number/reply control is normally in the post header.
    // Search the post itself first (the same scope used by addHideButton),
    // then its containing article for themes that split metadata into a sibling.
    const root = post.closest('article') || post;
    const selectors = [
      '.postInfo a[href*="#"]', '.postInfo .postNum', '.postInfo .post_num',
      '.post-info a[href*="#"]', '.post-info .postNum',
      '.post_head a[href*="#"]', '.post-header a[href*="#"]',
      '.posthead a[href*="#"]', '.post_no a', '.post-no a',
      '.post_num a', '.post-number a', '.postNum',
      'a[title*="reply" i]', 'a[aria-label*="reply" i]',
      'a[title*="comment" i]', 'a[aria-label*="comment" i]',
      '.fa-comment', '.fa-comments', '.fa-comment-o', '.fa-reply',
      '.glyphicon-comment', '[class*="comment-icon"]', '[class*="reply-icon"]'
    ];
    for (const scope of [...new Set([post, root])]) {
      for (const selector of selectors) {
        const found = scope.querySelector(selector);
        if (found && !found.closest('.ffx-ghost-indicator')) return found.closest('a') || found;
      }
    }
    return null;
  }

  function addGhostBoardIcon(post) {
    // Reuse the exact post node and header in which the Hide button has
    // already been installed. This avoids a second, stricter post detector.
    let icon = post.querySelector('.ffx-ghost-indicator');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'ffx-ghost-indicator';
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', 'Ghost post');
      icon.title = 'Ghost post';

      // Traced, self-contained SVG based on the user-approved ghost artwork.
      // The broad raised arms, tall domed body, scalloped hem, oval eyes,
      // open smile, and tongue are explicit vector paths (never an emoji font).
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 1280 1280');
      svg.setAttribute('width', '18');
      svg.setAttribute('height', '18');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const addPath = (d, fill, stroke = null, strokeWidth = null) => {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', fill);
        if (stroke) path.setAttribute('stroke', stroke);
        if (strokeWidth) path.setAttribute('stroke-width', strokeWidth);
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
      };
      const addEllipse = (cx, cy, rx, ry, fill) => {
        const eye = document.createElementNS(ns, 'ellipse');
        eye.setAttribute('cx', cx); eye.setAttribute('cy', cy);
        eye.setAttribute('rx', rx); eye.setAttribute('ry', ry);
        eye.setAttribute('fill', fill); svg.appendChild(eye);
      };
      addPath('M640 29 C425 29 269 190 245 477 C211 463 179 437 145 408 C98 369 53 377 31 417 C4 466 38 555 80 610 C118 659 168 687 211 697 C211 788 198 865 169 950 C144 1024 147 1069 181 1090 C224 1117 283 1105 344 1062 C395 1027 427 1005 469 1005 C521 1005 556 1068 640 1090 C724 1068 759 1005 811 1005 C853 1005 885 1027 936 1062 C997 1105 1056 1117 1099 1090 C1133 1069 1136 1024 1111 950 C1082 865 1069 788 1069 697 C1112 687 1162 659 1200 610 C1242 555 1276 466 1249 417 C1227 377 1182 369 1135 408 C1101 437 1069 463 1035 477 C1011 190 855 29 640 29 Z', '#f4f4f4', '#4b4b50', 15);
      addEllipse(490, 374, 70, 90, '#343238');
      addEllipse(790, 374, 70, 90, '#343238');
      addPath('M454 511 C510 530 770 530 826 511 C840 507 839 526 832 551 C808 638 752 704 640 704 C528 704 472 638 448 551 C441 526 440 507 454 511 Z', '#343238');
      addPath('M610 581 C574 581 551 609 551 660 C551 740 579 808 640 808 C701 808 729 740 729 660 C729 609 706 581 670 581 Z', '#ef648b');
      icon.appendChild(svg);
    }

    // Prefer the actual speech-bubble/reply link. If the page's theme uses
    // different markup, fall back to the Hide button's proven insertion spot.
    const bubble = speechBubbleTarget(post);
    const hideButton = post.querySelector('.gf-hide-button');
    const anchor = bubble || hideButton;
    if (anchor && anchor.parentElement) {
      if (icon.parentElement !== anchor.parentElement || icon.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement('afterend', icon);
      }
    } else {
      // This is intentionally the same header selection and append behavior
      // used by addHideButton(), rather than a separate layout guess.
      const header = post.querySelector('.post_head, .post-header, .posthead, header');
      if (header) header.appendChild(icon);
      else post.insertBefore(icon, post.firstChild);
    }

    for (const [property, value] of Object.entries({
      display: 'inline-flex', visibility: 'visible', opacity: '1',
      color: '#d8d8d8', width: '18px', height: '18px',
      'vertical-align': 'middle', 'margin-left': '5px',
      'margin-right': '2px', 'flex-shrink': '0', 'position': 'relative',
      'z-index': '2', 'line-height': '1', 'pointer-events': 'none'
    })) icon.style.setProperty(property, value, 'important');
  }

  function installB4KBoardRouting() {
    const onDesuarchive = location.hostname === 'desuarchive.org' || location.hostname.endsWith('.desuarchive.org');
    const onFourChanBoards = location.hostname === 'boards.4chan.org' || location.hostname === 'boards.4channel.org';
    if (!onDesuarchive && !onFourChanBoards) return;

    const isVGPath = pathname => pathname.split('/').filter(Boolean)[0]?.toLowerCase() === 'vg';
    const isDesuarchiveUrl = url => url.hostname === 'desuarchive.org' || url.hostname.endsWith('.desuarchive.org');
    const isFourChanUrl = url => url.hostname === 'boards.4chan.org' || url.hostname === 'boards.4channel.org';
    // Desuarchive quote links may point directly to 4chan's canonical host.
    const isArchivedMoeSourceLink = url => isDesuarchiveUrl(url) || (onDesuarchive && isFourChanUrl(url));
    const archivedMoeBoards = new Set([
      '3', 'adv', 'b', 'bant', 'biz', 'ck', 'cm', 'diy', 'e', 'f', 'fa',
      'gd', 'gif', 'h', 'hc', 'hm', 'hr', 'i', 'ic', 'jp', 'lgbt', 'lit',
      'n', 'news', 'o', 'out', 'p', 'po', 'pol', 'pw', 'qst', 's', 's4s',
      'sci', 'soc', 'sp', 't', 'toy', 'trv', 'tv', 'u', 'v', 'vip', 'vm',
      'vmg', 'vp', 'vrpg', 'vst', 'vt', 'w', 'wg', 'wsr', 'x', 'xs', 'y'
    ]);
    const resolvedPostUrls = new Map();
    const resolvedMoePostUrls = new Map();

    const getPostNumber = url => {
      const hashMatch = url.hash.match(/(?:^|[#&])(?:q|p)?(\d+)/i);
      if (hashMatch) return hashMatch[1];
      const match = url.pathname.match(/^\/vg\/(?:thread|post)\/(\d+)/i);
      return match ? match[1] : null;
    };

    const requestThreadNumber = postNumber => {
      if (!/^\d+$/.test(String(postNumber || ''))) return Promise.resolve(null);
      if (resolvedPostUrls.has(postNumber)) return resolvedPostUrls.get(postNumber);
      const request = new Promise(resolve => {
        try {
          chrome.runtime.sendMessage(
            { type: 'FFX_RESOLVE_VG_POST', postNumber: String(postNumber) },
            response => {
              if (chrome.runtime.lastError) return resolve(null);
              resolve(response?.threadNumber ? String(response.threadNumber) : null);
            }
          );
        } catch (_) { resolve(null); }
      });
      resolvedPostUrls.set(postNumber, request);
      return request;
    };

    const resolveVGTarget = async url => {
      if (!isVGPath(url.pathname)) return null;
      const match = url.pathname.match(/^\/vg\/(thread|post)\/(\d+)\/?$/i);
      if (match) {
        const postNumber = getPostNumber(url);
        const threadNumber = await requestThreadNumber(postNumber);
        if (threadNumber) {
          return `https://arch.b4k.dev/vg/thread/${threadNumber}/#q${postNumber}`;
        }
        // If the lookup is temporarily unavailable, preserve the original destination
        // rather than fabricating a thread number.
        return `https://arch.b4k.dev/vg/post/${postNumber}/#q${postNumber}`;
      }
      return `https://arch.b4k.dev${url.pathname}${url.search}${url.hash}`;
    };

    const archivedMoeBoardFromPath = pathname => {
      const board = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
      return board && archivedMoeBoards.has(board) ? board : null;
    };

    const requestArchivedMoeThreadNumber = (board, postNumber) => {
      if (!/^[a-z0-9]+$/i.test(String(board || '')) || !/^\d+$/.test(String(postNumber || ''))) {
        return Promise.resolve(null);
      }
      const cacheKey = `${board}|${postNumber}`;
      if (resolvedMoePostUrls.has(cacheKey)) return resolvedMoePostUrls.get(cacheKey);
      const request = new Promise(resolve => {
        try {
          chrome.runtime.sendMessage(
            { type: 'FFX_RESOLVE_ARCHIVED_MOE_POST', board: String(board), postNumber: String(postNumber) },
            response => {
              if (chrome.runtime.lastError) {
                console.warn('[FoolFuuka X] Archived.Moe thread lookup message failed:', chrome.runtime.lastError.message);
                return resolve(null);
              }
              if (response?.threadNumber) {
                console.info(`[FoolFuuka X] Resolved /${board}/${postNumber} to parent thread ${response.threadNumber}`, response.resolvedBy || 'archive API');
                return resolve(String(response.threadNumber));
              }
              console.warn(`[FoolFuuka X] Could not resolve parent thread for /${board}/${postNumber}:`, response?.error || response);
              resolve(null);
            }
          );
        } catch (_) { resolve(null); }
      });
      resolvedMoePostUrls.set(cacheKey, request);
      return request;
    };

    const resolveArchivedMoeTarget = async url => {
      const board = archivedMoeBoardFromPath(url.pathname);
      if (!board) return null;
      const threadMatch = url.pathname.match(/^\/([a-z0-9]+)\/thread\/(\d+)\/?$/i);
      const postMatch = url.pathname.match(/^\/([a-z0-9]+)\/post\/(\d+)\/?$/i);
      const hashMatch = url.hash.match(/(?:^|[#&])(?:q|p)?(\d+)/i);

      if (threadMatch && threadMatch[1].toLowerCase() === board) {
        const linkedThreadNumber = threadMatch[2];
        // Desuarchive cross-board quote links can encode a reply's post ID in
        // the /thread/ path itself, with no fragment at all. In that case the
        // path number is NOT necessarily the master thread ID: query it as a
        // post and use the API's thread_num to find the containing thread.
        // If a fragment exists, it is the more precise post ID to resolve.
        const postNumber = hashMatch ? hashMatch[1] : linkedThreadNumber;
        const parentThreadNumber = await requestArchivedMoeThreadNumber(board, postNumber);
        if (parentThreadNumber) {
          // A bare /thread/NUMBER/ link that resolves to a different parent
          // is actually a reply link. Preserve that reply as the fragment.
          // If the API says NUMBER is already the OP, leave the ordinary
          // thread URL unchanged unless the source explicitly supplied a post
          // fragment that should be preserved.
          if (hashMatch || parentThreadNumber !== linkedThreadNumber) {
            return `https://archived.moe/${board}/thread/${parentThreadNumber}/#${postNumber}`;
          }
        }
        // If this path number was a reply ID but neither API could resolve it,
        // never mislabel it as a thread. Use the archive's post route instead.
        if (!hashMatch) {
          console.warn(`[FoolFuuka X] Parent thread unknown; preserving ${postNumber} as a post ID on /${board}/`);
          return `https://archived.moe/${board}/post/${postNumber}/#${postNumber}`;
        }
        // A supplied fragment is already an explicit post reference; retain it.
        return `https://archived.moe/${board}/thread/${linkedThreadNumber}/${url.hash}`;
      }

      if (postMatch && postMatch[1].toLowerCase() === board) {
        const postNumber = postMatch[2];
        const threadNumber = await requestArchivedMoeThreadNumber(board, postNumber);
        if (threadNumber) return `https://archived.moe/${board}/thread/${threadNumber}/#${postNumber}`;
        // Do not send users to a guessed/non-thread destination when lookup fails.
        // Leave the original Desuarchive URL in place; a later retry can resolve it.
        return null;
      }
      return null;
    };

    const resolveArchiveTarget = async url => {
      if (isVGPath(url.pathname)) return resolveVGTarget(url);
      return resolveArchivedMoeTarget(url);
    };

    // Resolve archive post/thread links before navigating. On Desuarchive pages,
    // this includes canonical 4chan-hosted cross-board quote links such as
    // boards.4chan.org/gif/thread/123#p456, not only Desuarchive-hosted links.
    document.addEventListener('click', async event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;
      let url;
      try { url = new URL(link.href, location.href); } catch (_) { return; }
      const isVG = isVGPath(url.pathname);
      const isMoePost = isArchivedMoeSourceLink(url) && !!archivedMoeBoardFromPath(url.pathname) && /\/(?:thread|post)\/\d+\/?$/i.test(url.pathname);
      if (!isVG && !isMoePost) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = await resolveArchiveTarget(url);
      if (target) location.assign(target);
    }, true);

    // Rewrite hrefs in advance so middle-click, copy-link, and open-in-new-tab
    // also use the correct archive destination.
    const rewriteArchiveLinks = root => {
      const links = [];
      if (root instanceof Element && root.matches('a[href]')) links.push(root);
      if (root && root.querySelectorAll) links.push(...root.querySelectorAll('a[href]'));
      for (const link of links) {
        if (link.dataset.ffxArchiveResolving === '1') continue;
        let url;
        try { url = new URL(link.getAttribute('href'), location.href); } catch (_) { continue; }
        const isVG = isVGPath(url.pathname);
        const isMoePost = isArchivedMoeSourceLink(url) && !!archivedMoeBoardFromPath(url.pathname) && /\/(?:thread|post)\/\d+\/?$/i.test(url.pathname);
        if (!isVG && !isMoePost) continue;
        link.dataset.ffxArchiveResolving = '1';
        resolveArchiveTarget(url).then(target => {
          if (target && link.isConnected) link.href = target;
          delete link.dataset.ffxArchiveResolving;
        }).catch(() => { delete link.dataset.ffxArchiveResolving; });
      }
    };
    rewriteArchiveLinks(document);
    const routeObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) rewriteArchiveLinks(node);
      }
    });
    routeObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Insert a separate plain-text slash prefix and a blue /vg/ link between /vr/ and /wsg/.
    // The leading slash is deliberately outside the clickable anchor.
    const addToArchivesList = () => {
      const isBoardLink = (link, board) => {
        try {
          const url = new URL(link.getAttribute('href'), location.href);
          return url.pathname.split('/').filter(Boolean)[0]?.toLowerCase() === board ||
            link.textContent.trim().toLowerCase() === `/${board}/`;
        } catch (_) {
          return link.textContent.trim().toLowerCase() === `/${board}/`;
        }
      };

      const candidates = [...document.querySelectorAll('body *')].filter(element =>
        [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && /Archives\s*:/i.test(node.textContent || ''))
      );

      // Boards confirmed to exist on both the current 4chan board directory and
      // Archived.Moe, but not in Desuarchive's board list. /vg/ is omitted here
      // because its existing entry is intentionally routed to B4K.
      const archivedMoeOnlyBoards = [
        '3', 'adv', 'b', 'bant', 'biz', 'ck', 'cm', 'diy', 'e', 'f', 'fa',
        'gd', 'gif', 'h', 'hc', 'hm', 'hr', 'i', 'ic', 'jp', 'lgbt', 'lit',
        'n', 'news', 'o', 'out', 'p', 'po', 'pol', 'pw', 'qst', 's', 's4s',
        'sci', 'soc', 'sp', 't', 'toy', 'trv', 'tv', 'u', 'v', 'vip', 'vm',
        'vmg', 'vp', 'vrpg', 'vst', 'vt', 'w', 'wg', 'wsr', 'x', 'xs', 'y'
      ];

      for (const label of candidates) {
        let ancestor = label;
        for (let depth = 0; depth < 9 && ancestor && ancestor !== document.body; depth++, ancestor = ancestor.parentElement) {
          const links = [...ancestor.querySelectorAll('a[href]')];
          const vr = links.find(link => isBoardLink(link, 'vr'));
          const wsg = links.find(link => isBoardLink(link, 'wsg'));
          if (!vr || !wsg || vr.parentElement !== wsg.parentElement) continue;

          const parent = vr.parentElement;

          // Put Archived.Moe's additional boards at the beginning of the
          // Archive list. Keep native Desuarchive entries and the existing B4K
          // /vg/ entry intact, and make insertion idempotent across DOM updates.
          const firstNativeArchiveLink = links.find(link => {
            try {
              const url = new URL(link.getAttribute('href'), location.href);
              return url.origin === location.origin && /^\/[a-z0-9]+\/?$/i.test(url.pathname);
            } catch (_) {
              return false;
            }
          });
          if (firstNativeArchiveLink) {
            const existingMoeBoards = new Set(
              [...parent.querySelectorAll('a[data-ffx-archived-moe-board]')]
                .map(link => link.getAttribute('data-ffx-archived-moe-board'))
            );
            const fragment = document.createDocumentFragment();
            let insertedCount = 0;
            for (const board of archivedMoeOnlyBoards) {
              if (existingMoeBoards.has(board)) continue;
              if (insertedCount > 0) fragment.appendChild(document.createTextNode(' '));
              // Keep the visible /board/ notation, but make ONLY the board name
              // clickable. The slash characters are separate text nodes.
              fragment.appendChild(document.createTextNode('/'));
              const archiveLink = vr.cloneNode(false);
              archiveLink.removeAttribute('id');
              archiveLink.setAttribute('data-ffx-archived-moe-board', board);
              archiveLink.href = `https://archived.moe/${board}/`;
              archiveLink.textContent = board;
              archiveLink.title = `Open the /${board}/ archive on Archived.Moe`;
              fragment.appendChild(archiveLink);
              fragment.appendChild(document.createTextNode('/'));
              // Separate the closing slash from the next board label (including
              // the first native Desuarchive archive link after this block).
              fragment.appendChild(document.createTextNode(' '));
              insertedCount++;
            }
            if (insertedCount > 0) parent.insertBefore(fragment, firstNativeArchiveLink);
          }

          let vg = [...parent.querySelectorAll('a[data-ffx-b4k-archive-entry="1"]')][0];
          let prefix = [...parent.querySelectorAll('[data-ffx-b4k-archive-prefix="1"]')][0];

          if (!vg) {
            vg = vr.cloneNode(false);
            vg.removeAttribute('id');
            vg.setAttribute('data-ffx-b4k-archive-entry', '1');
          }
          if (!prefix) {
            prefix = document.createElement('span');
            prefix.setAttribute('data-ffx-b4k-archive-prefix', '1');
            prefix.setAttribute('aria-hidden', 'true');
          }

          prefix.textContent = ' / ';
          vg.href = 'https://arch.b4k.dev/vg/';
          vg.textContent = 'vg';
          vg.title = 'Open the /vg/ archive on B4K';
          vg.style.margin = '0';
          vg.style.setProperty('color', 'rgb(129, 162, 190)', 'important');
          vg.style.setProperty('text-decoration', 'none', 'important');

          prefix.remove();
          vg.remove();
          vr.insertAdjacentElement('afterend', prefix);
          prefix.insertAdjacentElement('afterend', vg);

          for (const sibling of [prefix.previousSibling, vg.nextSibling]) {
            if (sibling && sibling.nodeType === Node.TEXT_NODE && /^\s*$/.test(sibling.textContent || '')) sibling.remove();
          }
          return true;
        }
      }
      return false;
    };

    let archiveObserver = null;
    const tryAddArchiveLink = () => {
      if (!onDesuarchive) return;
      if (addToArchivesList() && archiveObserver) {
        archiveObserver.disconnect();
        archiveObserver = null;
      }
    };
    if (onDesuarchive && !tryAddArchiveLink()) {
      archiveObserver = new MutationObserver(tryAddArchiveLink);
      archiveObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Direct post/thread URLs resolve too; board index pages remain on Desuarchive.
    if (onDesuarchive) {
      try {
        const current = new URL(location.href);
        const isVGPost = isVGPath(current.pathname) && /^\/vg\/(?:thread|post)\/\d+\/?$/i.test(current.pathname);
        const isMoePost = !!archivedMoeBoardFromPath(current.pathname) && /^\/[a-z0-9]+\/(?:thread|post)\/\d+\/?$/i.test(current.pathname);
        if (isVGPost || isMoePost) {
          resolveArchiveTarget(current).then(target => {
            if (target && target !== location.href) location.replace(target);
          });
        }
      } catch (_) {}
    }
  }


  function installArchivePostPreviews() {
    const styleId = 'ffx-archive-preview-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .ffx-archive-preview {
          position: fixed; z-index: 2147483647; display: none;
          width: min(560px, calc(100vw - 24px)); max-height: min(440px, calc(100vh - 24px));
          overflow: auto; box-sizing: border-box; padding: 12px;
          color: #ddd; background: #202126; border: 1px solid #555;
          border-radius: 6px; box-shadow: 0 5px 22px rgba(0,0,0,.65);
          font: 13px/1.45 Arial, sans-serif; text-align: left;
          pointer-events: auto;
        }
        .ffx-archive-preview-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap;
          padding-bottom:7px; margin-bottom:8px; border-bottom:1px solid #444; color:#aaa; }
        .ffx-archive-preview-head strong { color:#e6e6e6; }
        .ffx-archive-preview-body { overflow-wrap:anywhere; }
        .ffx-archive-preview-body img { max-width:150px; max-height:150px; object-fit:contain; float:left; margin:0 10px 7px 0; }
        .ffx-archive-preview-body a { color:#8ab4d8; }
        .ffx-archive-preview-body blockquote { margin:4px 0; padding-left:8px; border-left:3px solid #789; color:#9ab; }
        .ffx-archive-preview-body pre { white-space:pre-wrap; }
        .ffx-archive-preview-error { color:#aaa; font-style:italic; }
      `;
      document.documentElement.appendChild(style);
    }

    let popup = document.querySelector('.ffx-archive-preview');
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'ffx-archive-preview';
      popup.setAttribute('role', 'tooltip');
      document.body.appendChild(popup);
    }

    let activeLink = null;
    let hideTimer = null;
    let requestToken = 0;
    const cache = new Map();
    const previewErrors = new Map();

    const parseArchiveLink = link => {
      let url;
      try { url = new URL(link.href || link.getAttribute('href'), location.href); } catch (_) { return null; }

      const host = url.hostname.toLowerCase();
      const isB4K = host === 'arch.b4k.dev';
      const isArchivedMoe = host === 'archived.moe' || host.endsWith('.archived.moe');
      const isDesuarchive = host === 'desuarchive.org' || host.endsWith('.desuarchive.org');
      const isFourChan = host === 'boards.4chan.org' || host === 'boards.4channel.org';
      const onDesuarchivePage = location.hostname === 'desuarchive.org' ||
        location.hostname.endsWith('.desuarchive.org');

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 3) return null;
      const board = parts[0].toLowerCase();
      if (!/^[a-z0-9]+$/.test(board)) return null;
      const route = parts[1].toLowerCase();
      if (route !== 'thread' && route !== 'post') return null;
      const pathNumber = parts[2] || '';
      if (!/^\d+$/.test(pathNumber)) return null;

      // These boards are intentionally routed from Desuarchive (and its
      // canonical 4chan quote links) to Archived.Moe. Preview them here too,
      // but leave native Desuarchive links alone for boards it actually hosts.
      const archivedMoeBoards = new Set([
        '3', 'adv', 'b', 'bant', 'biz', 'ck', 'cm', 'diy', 'e', 'f', 'fa',
        'gd', 'gif', 'h', 'hc', 'hm', 'hr', 'i', 'ic', 'jp', 'lgbt', 'lit',
        'n', 'news', 'o', 'out', 'p', 'po', 'pol', 'pw', 'qst', 's', 's4s',
        'sci', 'soc', 'sp', 't', 'toy', 'trv', 'tv', 'u', 'v', 'vip', 'vm',
        'vmg', 'vp', 'vrpg', 'vst', 'vt', 'w', 'wg', 'wsr', 'x', 'xs', 'y'
      ]);
      const routedFromDesuarchive = (isDesuarchive || (onDesuarchivePage && isFourChan)) &&
        archivedMoeBoards.has(board);

      if (!isB4K && !isArchivedMoe && !routedFromDesuarchive) return null;

      // On /post/ URLs the path is the post ID. On /thread/ URLs a
      // fragment, when present, identifies the reply being previewed.
      const hash = url.hash.match(/^#(?:q|p)?(\d+)(?:$|[&/])/i);
      const postNumber = route === 'thread' && hash ? hash[1] : pathNumber;
      // Tell the background worker which archive actually owns the target.
      // This is important for source links whose original hostname is 4chan or
      // Desuarchive but whose destination is Archived.Moe.
      const previewHost = routedFromDesuarchive ? 'archived.moe' : host;
      return {
        board, postNumber, host: previewHost, href: url.href,
        threadNumber: route === 'thread' ? pathNumber : null
      };
    };

    const cleanComment = html => {
      const parsed = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
      const allowed = new Set(['A','B','I','U','S','STRONG','EM','BR','P','DIV','SPAN','BLOCKQUOTE','PRE','CODE','UL','OL','LI']);
      const copySafe = node => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        if (!allowed.has(node.tagName)) {
          const fragment = document.createDocumentFragment();
          [...node.childNodes].forEach(child => fragment.appendChild(copySafe(child)));
          return fragment;
        }
        const clean = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === 'A') {
          const href = node.getAttribute('href') || '';
          try {
            const safe = new URL(href, location.href);
            if (safe.protocol === 'http:' || safe.protocol === 'https:') {
              clean.href = safe.href; clean.target = '_blank'; clean.rel = 'noopener noreferrer';
            }
          } catch (_) {}
        }
        [...node.childNodes].forEach(child => clean.appendChild(copySafe(child)));
        return clean;
      };
      const output = document.createDocumentFragment();
      [...parsed.body.firstElementChild.childNodes].forEach(child => output.appendChild(copySafe(child)));
      return output;
    };

    const positionPopup = (link, event) => {
      const margin = 12;
      const rect = link.getBoundingClientRect();
      const x = Math.min(Math.max(margin, event?.clientX ?? rect.left), window.innerWidth - 580);
      const y = Math.min(Math.max(margin, rect.bottom + 8), window.innerHeight - 460);
      popup.style.left = `${Math.max(margin, x)}px`;
      popup.style.top = `${Math.max(margin, y)}px`;
    };

    const showLoading = (link, event) => {
      positionPopup(link, event);
      popup.replaceChildren();
      const message = document.createElement('div');
      message.className = 'ffx-archive-preview-error';
      message.textContent = 'Loading archived post preview…';
      popup.appendChild(message);
      popup.style.display = 'block';
    };

    const renderPost = (post, target, link, event) => {
      popup.replaceChildren();
      const header = document.createElement('div');
      header.className = 'ffx-archive-preview-head';
      const title = document.createElement('strong');
      title.textContent = `/${target.board}/ — No.${post.num || target.postNumber}`;
      header.appendChild(title);
      const author = document.createElement('span');
      author.textContent = post.name_processed || post.name || 'Anonymous';
      header.appendChild(author);
      if (post.fourchan_date) {
        const date = document.createElement('span');
        date.textContent = post.fourchan_date;
        header.appendChild(date);
      }
      const body = document.createElement('div');
      body.className = 'ffx-archive-preview-body';

      // FoolFuuka mirrors do not always expose media in exactly the same shape.
      // Collect known URL fields from both post.media and post itself, including
      // nested media objects, then resolve archive-relative paths against the
      // archive that supplied the post (not necessarily the page being viewed).
      const media = post.media;
      const isSpoiler = String(media?.spoiler ?? post?.spoiler ?? '0') === '1';
      const mediaUrls = { thumb: [], original: [] };
      const seenMediaObjects = new Set();
      const addMediaUrl = (bucket, value) => {
        if (typeof value !== 'string' || !value.trim()) return;
        const raw = value.trim();
        // FoolFuuka also returns filename-only fields such as media_orig and
        // preview_orig. They are metadata, not fetchable URLs; accepting them
        // here creates bogus archive-root URLs and breaks the original fallback.
        if (/^(?:data:|javascript:|blob:)/i.test(raw)) return;
        if (!/^(?:https?:)?\/\//i.test(raw) && !raw.startsWith('/') && !raw.includes('/')) return;
        try {
          const resolved = new URL(raw, `https://${target.host}/`);
          if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return;
          if (!mediaUrls[bucket].includes(resolved.href)) mediaUrls[bucket].push(resolved.href);
        } catch (_) {}
      };
      const collectMediaUrls = value => {
        if (!value || typeof value !== 'object' || seenMediaObjects.has(value)) return;
        seenMediaObjects.add(value);
        for (const [key, item] of Object.entries(value)) {
          const field = key.toLowerCase();
          if (typeof item === 'string') {
            if (/(?:thumb|thumbnail|preview)(?:_link|_url|url|src|_src)$/.test(field)) {
              addMediaUrl('thumb', item);
            } else if (/(?:remote_)?(?:media|file|image|attachment)(?:_link|_url|url|_src|src)$/.test(field)) {
              addMediaUrl('original', item);
            }
          } else if (item && typeof item === 'object') {
            collectMediaUrls(item);
          }
        }
      };
      collectMediaUrls(media);
      // Some API variants put attachment fields directly on the post.
      collectMediaUrls(post);

      if (!isSpoiler && (mediaUrls.thumb.length || mediaUrls.original.length)) {
        const thumbUrl = mediaUrls.thumb[0] || mediaUrls.original[0];
        const originalUrl = mediaUrls.original.find(url => url !== thumbUrl) || mediaUrls.original[0] || thumbUrl;
        const attachment = document.createElement('a');
        attachment.href = originalUrl;
        attachment.target = '_blank';
        attachment.rel = 'noopener noreferrer';
        attachment.title = 'Open archived attachment';
        const image = document.createElement('img');
        image.alt = media?.media_filename || post?.media_filename || 'Archived attachment';
        image.loading = 'eager';
        image.referrerPolicy = 'strict-origin-when-cross-origin';

        // Retrieve image bytes through the extension worker. Successful image
        // responses are persisted in Cache Storage, so later hovers and page
        // reloads reuse the image instead of re-requesting the archive/CDN.
        // The worker uses the browser's existing site cookies; it never copies
        // or stores Cloudflare cookies itself.
        const requestCachedImage = url => new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: 'FFX_GET_CACHED_IMAGE',
            url,
            referrer: `https://${target.host}/${target.board}/post/${target.postNumber}/`
          }, response => {
            if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
            resolve(response || { ok: false, error: 'No image response from extension worker' });
          });
        });
        const showAttachmentFallback = () => {
          attachment.remove();
          const fallback = document.createElement('a');
          fallback.href = originalUrl;
          fallback.target = '_blank';
          fallback.rel = 'noopener noreferrer';
          fallback.textContent = '[Open archived attachment]';
          body.insertBefore(fallback, body.firstChild);
        };
        const loadImage = async () => {
          const candidates = [...new Set([thumbUrl, originalUrl].filter(Boolean))];
          let lastError = '';
          for (const url of candidates) {
            const result = await requestCachedImage(url);
            if (result?.ok && result.dataUrl) {
              image.src = result.dataUrl;
              attachment.href = originalUrl;
              return;
            }
            lastError = result?.error || 'Image unavailable';
          }
          image.title = lastError;
          showAttachmentFallback();
        };
        loadImage();
        attachment.appendChild(image);
        body.appendChild(attachment);
      }
      const comment = post.comment_processed || post.comment_sanitized || post.comment || '';
      body.appendChild(cleanComment(comment));
      if (!comment && post.deleted === '1') {
        const deleted = document.createElement('span');
        deleted.textContent = '[Post deleted]';
        body.appendChild(deleted);
      }
      popup.append(header, body);
      positionPopup(link, event);
      popup.style.display = 'block';
    };

    const fetchPost = target => {
      const key = `${target.host}|${target.board}|${target.postNumber}`;
      if (cache.has(key)) return cache.get(key);
      const promise = new Promise(resolve => {
        try {
          chrome.runtime.sendMessage({
            type: 'FFX_FETCH_ARCHIVE_POST',
            board: target.board,
            postNumber: target.postNumber,
            threadNumber: target.threadNumber,
            sourceHost: target.host
          }, response => {
            if (chrome.runtime.lastError) {
              console.warn('[FoolFuuka X] Archive preview message failed:', chrome.runtime.lastError.message);
              return resolve(null);
            }
            if (!response?.post) {
              const reason = response?.error || 'Archive API returned no post';
              previewErrors.set(`${target.host}|${target.board}|${target.postNumber}`, reason);
              console.warn(`[FoolFuuka X] No preview post returned for /${target.board}/${target.postNumber}:`, reason);
              return resolve(null);
            }
            previewErrors.delete(`${target.host}|${target.board}|${target.postNumber}`);
            resolve(response.post);
          });
        } catch (error) {
          console.warn('[FoolFuuka X] Could not request archive preview:', error);
          resolve(null);
        }
      });
      cache.set(key, promise);
      // Do not permanently cache a failed lookup. Network/API failures can be
      // transient, and the next hover should be allowed to retry.
      promise.then(post => { if (!post && cache.get(key) === promise) cache.delete(key); });
      return promise;
    };

    const beginPreview = async (link, event) => {
      const target = parseArchiveLink(link);
      if (!target) return;
      clearTimeout(hideTimer);
      activeLink = link;
      const token = ++requestToken;
      showLoading(link, event);
      const post = await fetchPost(target);
      if (token !== requestToken || activeLink !== link || !link.isConnected) return;
      if (!post) {
        popup.replaceChildren();
        const error = document.createElement('div');
        error.className = 'ffx-archive-preview-error';
        const errorKey = `${target.host}|${target.board}|${target.postNumber}`;
        error.textContent = `Preview unavailable: ${previewErrors.get(errorKey) || 'post not returned by archive'}`;
        popup.appendChild(error);
        return;
      }
      renderPost(post, target, link, event);
    };

    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!popup.matches(':hover')) {
          popup.style.display = 'none';
          activeLink = null;
          requestToken++;
        }
      }, 180);
    };

    document.addEventListener('pointerover', event => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link === activeLink || popup.contains(event.target)) return;
      if (link.closest('.ffx-archive-preview')) return;
      const target = parseArchiveLink(link);
      if (!target) return;
      beginPreview(link, event);
    }, true);
    document.addEventListener('pointerout', event => {
      if (!activeLink) return;
      const leavingLink = event.target instanceof Element && event.target.closest('a[href]') === activeLink;
      if (leavingLink && (!event.relatedTarget || !activeLink.contains(event.relatedTarget))) scheduleHide();
    }, true);
    popup.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    popup.addEventListener('pointerleave', scheduleHide);
    document.addEventListener('focusin', event => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link) beginPreview(link, null);
    }, true);
    document.addEventListener('focusout', event => {
      if (activeLink && event.target === activeLink) scheduleHide();
    }, true);
    window.addEventListener('scroll', () => {
      if (activeLink && popup.style.display !== 'none') positionPopup(activeLink, null);
    }, true);
  }

  function insertBBCode(textarea, open, close, selection) {
    const value = textarea.value || '';
    const focused = document.activeElement === textarea;
    const start = focused ? textarea.selectionStart : (selection?.start ?? value.length);
    const end = focused ? textarea.selectionEnd : (selection?.end ?? start);
    const safeStart = Math.max(0, Math.min(start, value.length));
    const safeEnd = Math.max(safeStart, Math.min(end, value.length));
    const selected = value.slice(safeStart, safeEnd);
    const replacement = open + selected + close;
    const nextValue = value.slice(0, safeStart) + replacement + value.slice(safeEnd);

    // Set through the native HTMLTextAreaElement setter so the real form
    // control's value changes even on pages with wrapped/custom textarea code.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, nextValue);
    else textarea.value = nextValue;

    const cursorStart = selected ? safeStart : safeStart + open.length;
    const cursorEnd = selected ? safeStart + replacement.length : cursorStart;
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
    let event;
    try { event = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement }); }
    catch (_) { event = new Event('input', { bubbles: true }); }
    textarea.dispatchEvent(event);
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findPostTextarea() {
    const visible = [...document.querySelectorAll('textarea:not([disabled]):not([readonly])')]
      .filter(el => el.getClientRects().length && el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!visible.length) return null;

    // Prefer the textarea in a form that actually submits a post/reply. This
    // is more reliable than matching a generic name such as "message" which
    // can belong to search or unrelated page widgets.
    const formCandidates = visible.map(el => {
      const form = el.closest('form');
      if (!form) return { el, score: -100 };
      const controls = [...form.querySelectorAll('button, input[type="submit"], input[type="button"]')];
      const submitText = controls.map(control => [
        control.innerText, control.value, control.title,
        control.getAttribute('aria-label'), control.name, control.id
      ].filter(Boolean).join(' ')).join(' ').toLowerCase();
      const formAttrs = `${form.id || ''} ${form.className || ''} ${form.getAttribute('action') || ''}`.toLowerCase();
      const fieldAttrs = `${el.id || ''} ${el.name || ''} ${el.className || ''}`.toLowerCase();
      let score = 0;
      if (/(submit|send).{0,20}(post|reply)|post.{0,20}(reply|comment)|reply.{0,20}(post|submit)/.test(submitText)) score += 100;
      if (/(post|reply|comment)/.test(formAttrs)) score += 50;
      if (/(comment|post|message|body|reply)/.test(fieldAttrs)) score += 20;
      if (form.querySelector('input[type="file"], .post_form, .post-form, #post_form')) score += 10;
      if (el.closest('.search, #search, .navbar, header')) score -= 100;
      return { el, score };
    }).sort((a, b) => b.score - a.score);

    if (formCandidates[0]?.score > 0) return formCandidates[0].el;

    // FoolFuuka themes often use a plain textarea without useful ids/classes.
    // In that case use the largest visible textarea outside search/navigation.
    return visible.filter(el => !el.closest('.search, #search, .navbar, header'))
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] || null;
  }

  function installBBCodeEditor() {
    const textarea = findPostTextarea();
    if (!textarea || textarea.dataset.ffxEditorAttached === "1") return;
    const toolbar = document.createElement("div");
    toolbar.className = "ffx-bbcode-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "BBCode formatting");

    let savedSelection = { start: textarea.selectionStart || 0, end: textarea.selectionEnd || 0 };
    const rememberSelection = () => {
      savedSelection = {
        start: textarea.selectionStart ?? textarea.value.length,
        end: textarea.selectionEnd ?? textarea.value.length
      };
    };
    ["keyup", "mouseup", "select", "focus", "input", "pointerup"].forEach(type =>
      textarea.addEventListener(type, rememberSelection)
    );

    const definitions = [
      { label: 'B', open: '[b]', close: '[/b]', title: 'Bold', cls: 'ffx-bb-bold', html: '<strong>B</strong>' },
      { label: 'I', open: '[i]', close: '[/i]', title: 'Italic', cls: 'ffx-bb-italic', html: '<em>I</em>' },
      { label: 'U', open: '[u]', close: '[/u]', title: 'Underline', cls: 'ffx-bb-underline', html: '<u>U</u>' },
      { label: 'S', open: '[s]', close: '[/s]', title: 'Strikethrough', cls: 'ffx-bb-strike', html: '<s>S</s>' },
      { label: 'Spoiler', open: '[spoiler]', close: '[/spoiler]', title: 'Spoiler', cls: 'ffx-bb-spoiler', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>' },
      { label: 'Code', open: '[code]', close: '[/code]', title: 'Code', cls: 'ffx-bb-code', html: '&lt;/&gt;' },
      { label: 'Banned', open: '[banned]', close: '[/banned]', title: 'Banned text', cls: 'ffx-bb-banned', html: '<strong>Banned</strong>' }
    ];
    for (const definition of definitions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = definition.cls;
      button.innerHTML = definition.html;
      button.title = definition.title;
      button.setAttribute('aria-label', definition.title);
      button.addEventListener('pointerdown', () => { rememberSelection(); });
      button.addEventListener('mousedown', event => {
        rememberSelection();
        // Prevent focus moving from the actual post textarea to the toolbar.
        event.preventDefault();
      });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        insertBBCode(textarea, definition.open, definition.close, savedSelection);
        rememberSelection();
      });
      toolbar.appendChild(button);
    }

    textarea.insertAdjacentElement("beforebegin", toolbar);
    textarea.dataset.ffxEditorAttached = "1";
  }

  // Apply the developer capcode to FoolFuuka's semantic tripcode elements.
  // Scan the whole document rather than relying on postNodes(): search-result
  // layouts can use a different wrapper structure from thread/post pages.
  function applyDeveloperCapcode() {
    const host = location.hostname.toLowerCase();
    if (host !== 'desuarchive.org' && !host.endsWith('.desuarchive.org')) return;

    // Desuarchive's FoolFuuka 2.2 markup uses .post_tripcode inside the
    // actual <article class="post">. It does not use .postertrip.
    // Exclude collapsed .post.stub entries and never inspect poster-name text.
    const tripNodes = document.querySelectorAll('article.post:not(.stub) .post_tripcode');
    for (const tripNode of tripNodes) {
      if (!(tripNode instanceof HTMLElement)) continue;
      // .post_tripcode is Desuarchive's semantic tripcode element. Do not use
      // computed font-weight as a discriminator: site CSS can make a genuine
      // tripcode bold too. Plain text in the poster-name field is not selected.
      const tripText = (tripNode.textContent || '').replace(/[\u00a0\u200b\ufeff]/g, '').trim();
      if (tripText !== '!ANJxuQ9Xkk') continue;

      // Repair an interrupted/previous insertion without duplicating labels.
      const existingLabel = tripNode.nextElementSibling;
      if (existingLabel && existingLabel.classList.contains('ffx-developer-capcode')) {
        tripNode.dataset.ffxDeveloperCapcodeApplied = '1';
        continue;
      }

      const label = document.createElement('strong');
      label.className = 'ffx-developer-capcode';
      label.textContent = ' ## Developer';
      label.setAttribute('aria-label', 'Developer capcode');
      tripNode.insertAdjacentElement('afterend', label);
      tripNode.dataset.ffxDeveloperCapcodeApplied = '1';
    }
  }

  // Catbox support is intentionally scoped to Desuarchive; other archive hosts are untouched.
  function catboxMediaUrl(raw) {
    try {
      let candidate = String(raw || "").trim();
      // Desuarchive posts commonly omit the URL scheme (files.catbox.moe/id.ext).
      if (/^files\.catbox\.moe\//i.test(candidate)) candidate = "https://" + candidate;
      else if (/^\/\/files\.catbox\.moe\//i.test(candidate)) candidate = "https:" + candidate;
      const url = new URL(candidate, location.href);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname.toLowerCase() !== "files.catbox.moe") return null;
      if (!/\.(?:png|jpe?g|gif|webp|avif|bmp|mp4|webm|ogv)$/i.test(url.pathname)) return null;
      // Always open Catbox media over HTTPS, regardless of the shorthand used in the post.
      url.protocol = "https:";
      return url.href;
    } catch (_) { return null; }
  }
  function makeCatboxMedia(url, className) {
    const video = /\.(?:mp4|webm|ogv)$/i.test(new URL(url).pathname);
    const media = document.createElement(video ? "video" : "img");
    media.className = className;
    if (video) {
      media.src = url; media.controls = true; media.preload = "metadata";
      media.playsInline = true;
    } else {
      media.alt = "Catbox image preview";
      // These are inserted dynamically into archive posts. Eager loading avoids
      // lazy-load edge cases for newly-created embeds and hover previews.
      media.loading = "eager";
      media.decoding = "async";
      media.src = url;

      // Catbox occasionally fails the first image request when the archive page's
      // referrer/cache state is unusual. Retry once without a referrer; the URL's
      // fragment is client-side only and forces the browser to issue a fresh load.
      media.addEventListener("error", () => {
        if (media.dataset.ffxCatboxRetried === "1") return;
        media.dataset.ffxCatboxRetried = "1";
        media.referrerPolicy = "no-referrer";
        try {
          const retryUrl = new URL(url);
          retryUrl.hash = "ffx-retry";
          media.src = retryUrl.href;
        } catch (_) { /* Keep the original failed image if the URL cannot be retried. */ }
      }, { once: true });
    }
    return media;
  }
  function embedCatboxLink(link, url) {
    if (!catboxInstantEmbed || link.dataset.ffxCatboxEmbedded === "1") return;
    const wrap = document.createElement("span");
    wrap.className = "ffx-catbox-embed";
    wrap.appendChild(makeCatboxMedia(url, "ffx-catbox-media"));
    link.insertAdjacentElement("afterend", wrap);
    link.dataset.ffxCatboxEmbedded = "1";
  }
  function processCatboxLinks() {
    if (location.hostname !== "desuarchive.org" && !location.hostname.endsWith(".desuarchive.org")) return;
    const posts = document.querySelectorAll("article.post:not(.stub) .text");
    for (const postText of posts) {
      // Existing anchors, including links rendered by FoolFuuka.
      for (const link of postText.querySelectorAll("a[href]")) {
        const url = catboxMediaUrl(link.href);
        if (!url) continue;
        link.classList.add("ffx-catbox-link");
        link.dataset.ffxCatboxUrl = url;
        embedCatboxLink(link, url);
      }
      // Linkify bare URLs in text nodes without disturbing markup or quoted text.
      const walker = document.createTreeWalker(postText, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !/files\.catbox\.moe\//i.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest("a, code, pre, script, style, .ffx-catbox-embed")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes=[]; while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text=node.nodeValue;
        const re=/(?:https?:\/\/)?files\.catbox\.moe\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp|avif|bmp|mp4|webm|ogv)(?:\?[A-Za-z0-9_%=&+-]*)?(?:#[A-Za-z0-9_.-]*)?/ig;
        let match, last=0; const frag=document.createDocumentFragment(); let changed=false;
        while ((match=re.exec(text))) {
          // Avoid matching the domain as part of a larger word or email-like token.
          if (match.index > 0 && !/[\s([{<"'=]/.test(text[match.index-1])) continue;
          let end=match.index+match[0].length;
          while (end>match.index && /[),.!?;:]$/.test(text.slice(match.index,end))) end--;
          if (end<=match.index) continue;
          const raw=text.slice(match.index,end);
          const url=catboxMediaUrl(raw); if (!url) continue;
          frag.appendChild(document.createTextNode(text.slice(last,match.index)));
          const a=document.createElement("a"); a.href=url; a.textContent=raw;
          a.target="_blank"; a.rel="noopener noreferrer"; a.className="ffx-catbox-link"; a.dataset.ffxCatboxUrl=url;
          frag.appendChild(a); last=end; re.lastIndex=end; changed=true;
        }
        if (changed) { frag.appendChild(document.createTextNode(text.slice(last))); node.replaceWith(frag); }
      }
    }
  }
  let catboxHover=null, catboxHoverOwner=null;
  function hideCatboxHover() { if (catboxHover) catboxHover.remove(); catboxHover=null; catboxHoverOwner=null; }
  document.addEventListener("pointerover", event => {
    const link=event.target.closest?.("a.ffx-catbox-link");
    if (!link || link===catboxHoverOwner || !link.dataset.ffxCatboxUrl) return;
    hideCatboxHover();
    const popup=document.createElement("div"); popup.className="ffx-catbox-hover";
    const media=makeCatboxMedia(link.dataset.ffxCatboxUrl,"ffx-catbox-preview");
    if (media.tagName === "VIDEO") { media.muted=true; media.autoplay=true; media.loop=true; media.controls=false; }
    popup.appendChild(media); document.body.appendChild(popup);
    const rect=link.getBoundingClientRect();
    popup.style.left=Math.max(8,Math.min(window.innerWidth-popup.offsetWidth-8,rect.left)) + "px";
    popup.style.top=Math.max(8,Math.min(window.innerHeight-popup.offsetHeight-8,rect.bottom+6)) + "px";
    catboxHover=popup; catboxHoverOwner=link;
  });
  document.addEventListener("pointerout", event => {
    const link=event.target.closest?.("a.ffx-catbox-link");
    if (link && !link.contains(event.relatedTarget)) hideCatboxHover();
  });

  function scan() {
    if (scanning) return;
    scanning = true;
    scanQueued = false;
    try {
      installBBCodeEditor();
      applyDeveloperCapcode();
      processCatboxLinks();
      for (const post of postNodes()) {
        if (post.hasAttribute(HIDDEN_MARKER)) { actuallyHide(post); continue; }
        const parsed = parsePost(post);
        if (!isGhost(post, parsed)) continue;
        const key = keyFor(parsed);
        if (hidden.has(key)) { hidePost(post, key, "manual"); continue; }
        const keyword = matchedKeyword(post);
        if (keyword) { hidePost(post, key, "keyword"); continue; }
        const username = matchedUsername(post);
        if (username) { hidePost(post, key, "username"); continue; }
        addHideButton(post, key);
        // Use precisely the post nodes on which Hide is successfully rendered.
        // Ghost posts can appear inside ordinary board archives (for example /a/),
        // so do not restrict the indicator to the /ghost/ board pathname.
        addGhostBoardIcon(post);
      }
    } finally { scanning = false; }
  }
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  async function init() {
    installB4KBoardRouting();
    installArchivePostPreviews();
    await load();
    scan();
    new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        return changed.some(node => {
          if (!(node instanceof Element)) return true;
          return !node.matches(".gf-hide-button, .gf-hidden-placeholder, .ffx-ghost-indicator, .ffx-developer-capcode, .ffx-bbcode-toolbar, .ffx-b4k-nav-link, #ghost-filter-styles") &&
            !node.closest(".gf-hide-button, .gf-hidden-placeholder, .ffx-ghost-indicator, .ffx-developer-capcode, .ffx-bbcode-toolbar, .ffx-b4k-nav-link, #ghost-filter-styles");
        });
      });
      if (relevant) scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]) hidden = new Set(changes[STORAGE_KEY].newValue || []);
      if (changes[KEYWORDS_KEY]) keywords = normalizeKeywords(changes[KEYWORDS_KEY].newValue);
      if (changes[USERNAMES_KEY]) usernames = normalizeKeywords(changes[USERNAMES_KEY].newValue);
      if (changes[CATBOX_EMBED_KEY]) { catboxInstantEmbed = changes[CATBOX_EMBED_KEY].newValue === true; document.querySelectorAll(".ffx-catbox-embed").forEach(el=>el.remove()); document.querySelectorAll("a.ffx-catbox-link").forEach(a=>{delete a.dataset.ffxCatboxEmbedded; if(catboxInstantEmbed) embedCatboxLink(a,a.dataset.ffxCatboxUrl);}); }
      if (changes[STORAGE_KEY] || changes[KEYWORDS_KEY] || changes[USERNAMES_KEY]) scheduleScan();
    });
  }
  init();
})();
