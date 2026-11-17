chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'FFX_GET_CACHED_IMAGE') {
    const imageUrl = String(message.url || '');
    let parsed;
    try { parsed = new URL(imageUrl); } catch (_) {
      sendResponse({ ok: false, error: 'Invalid image URL' });
      return;
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      sendResponse({ ok: false, error: 'Unsupported image URL protocol' });
      return;
    }

    (async () => {
      const cacheName = 'foolfuuka-archive-images-v1';
      const cache = await caches.open(cacheName);
      const cacheKey = new Request(parsed.href, { method: 'GET' });
      let response = await cache.match(cacheKey);
      let fromCache = Boolean(response);

      if (!response) {
        const referrer = String(message.referrer || '');
        const requestOptions = {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
        };
        if (referrer) {
          requestOptions.referrer = referrer;
          requestOptions.referrerPolicy = 'strict-origin-when-cross-origin';
        }
        response = await fetch(parsed.href, requestOptions);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}`);
        if (!contentType.startsWith('image/')) {
          throw new Error(contentType.includes('text/html')
            ? 'Archive returned an HTML page (possibly a Cloudflare challenge). Open Archived.Moe, pass the challenge, then retry the preview.'
            : `Expected an image but received ${contentType || 'unknown content type'}`);
        }
        // Only successful image bytes enter the persistent cache. Never cache
        // Cloudflare challenge HTML, redirects to challenge pages, or errors.
        // Avoid retaining huge originals and bound the cache to 200 entries.
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (!contentLength || contentLength <= 15 * 1024 * 1024) {
          await cache.put(cacheKey, response.clone());
          const keys = await cache.keys();
          while (keys.length > 200) {
            const oldest = keys.shift();
            await cache.delete(oldest);
          }
        }
      }

      const contentType = response.headers.get('content-type') || 'image/*';
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const dataUrl = `data:${contentType};base64,${btoa(binary)}`;
      sendResponse({ ok: true, dataUrl, fromCache, size: bytes.byteLength });
    })().catch(error => {
      console.warn('[FoolFuuka X] Cached image retrieval failed:', error);
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
    return true;
  }
  if (message?.type === 'FFX_RESOLVE_VG_POST') {
    const postNumber = String(message.postNumber || '');
    if (!/^\d+$/.test(postNumber)) {
      sendResponse({ threadNumber: null });
      return;
    }
    const apiUrl = `https://arch.b4k.dev/_/api/chan/post/?board=vg&num=${encodeURIComponent(postNumber)}`;
    fetch(apiUrl, { method: 'GET', credentials: 'omit', cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`B4K API returned HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const threadNumber = data?.thread_num ?? data?.post?.thread_num ?? data?.data?.thread_num ?? data?.post?.data?.thread_num ?? null;
        sendResponse({ threadNumber: /^\d+$/.test(String(threadNumber || '')) ? String(threadNumber) : null });
      })
      .catch(error => {
        console.warn('[FoolFuuka X] Could not resolve /vg/ post to its archived thread:', error);
        sendResponse({ threadNumber: null });
      });
    return true;
  }

  if (message?.type === 'FFX_RESOLVE_ARCHIVED_MOE_POST') {
    const board = String(message.board || '').toLowerCase();
    const postNumber = String(message.postNumber || '');
    if (!/^[a-z0-9]+$/.test(board) || !/^\d+$/.test(postNumber)) {
      sendResponse({ threadNumber: null, error: 'Invalid board or post number' });
      return;
    }

    // Match the proven /vg/ resolver pattern: ask the destination archive's
    // FoolFuuka post API for the post object, whose thread_num is the parent.
    // Only fall back to Desuarchive if Archived.Moe does not have that post.
    const apiBases = ['https://archived.moe', 'https://desuarchive.org'];
    const readThreadNumber = data => {
      const candidates = [
        data?.thread_num,
        data?.post?.thread_num,
        data?.data?.thread_num,
        data?.data?.post?.thread_num,
        data?.post?.data?.thread_num,
        data?.[postNumber]?.thread_num,
        data?.posts?.[postNumber]?.thread_num
      ];
      const value = candidates.find(item => /^\d+$/.test(String(item ?? '')));
      return value == null ? null : String(value);
    };

    (async () => {
      for (const base of apiBases) {
        const apiUrl = `${base}/_/api/chan/post/?board=${encodeURIComponent(board)}&num=${encodeURIComponent(postNumber)}`;
        try {
          const response = await fetch(apiUrl, {
            method: 'GET', credentials: 'include', cache: 'no-store',
            referrer: `https://archived.moe/${board}/post/${postNumber}/`,
            referrerPolicy: 'strict-origin-when-cross-origin',
            headers: { 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const threadNumber = readThreadNumber(data);
          if (threadNumber) {
            sendResponse({ threadNumber, resolvedBy: base });
            return;
          }
          console.warn(`[FoolFuuka X] ${base} returned no thread_num for /${board}/${postNumber}`, data);
        } catch (error) {
          console.warn(`[FoolFuuka X] ${base} post lookup failed for /${board}/${postNumber}:`, error);
        }
      }
      sendResponse({ threadNumber: null, error: 'No parent thread number returned by either archive API' });
    })();
    return true;
  }

  if (message?.type === 'FFX_FETCH_ARCHIVE_POST') {
    const board = String(message.board || '').toLowerCase();
    const postNumber = String(message.postNumber || '');
    const sourceHost = String(message.sourceHost || '').toLowerCase();
    if (!/^[a-z0-9]+$/.test(board) || !/^\d+$/.test(postNumber)) {
      sendResponse({ post: null, error: 'Invalid board or post number' });
      return;
    }

    // Prefer the archive named by the link itself, then use the known mirror
    // order. This avoids asking the wrong archive first for externally hosted
    // post links while retaining cross-archive fallback.
    const archiveBases = {
      'arch.b4k.dev': 'https://arch.b4k.dev',
      'archived.moe': 'https://archived.moe',
      'desuarchive.org': 'https://desuarchive.org'
    };
    const preferredBase = archiveBases[sourceHost] ||
      (sourceHost.endsWith('.archived.moe') ? 'https://archived.moe' :
       sourceHost.endsWith('.desuarchive.org') ? 'https://desuarchive.org' : null);
    // These non-/vg/ boards are specifically hosted by Archived.Moe.
    // Do not query Desuarchive as a fallback: it does not host these boards
    // and responds with misleading HTTP 422 errors.
    const fallbackBases = board === 'vg'
      ? ['https://arch.b4k.dev']
      : ['https://archived.moe'];
    const apiBases = [...new Set([preferredBase, ...fallbackBases].filter(Boolean))];

    // FoolFuuka normally returns the post object directly. Archive mirrors
    // and API proxies can wrap it or return keyed/array collections, so search
    // the response recursively for the exact requested post number.
    const extractPost = data => {
      const seen = new Set();
      const visit = value => {
        if (!value || typeof value !== 'object' || seen.has(value)) return null;
        seen.add(value);
        if (!Array.isArray(value) && String(value.num ?? '') === postNumber &&
            (value.comment !== undefined || value.comment_processed !== undefined ||
             value.name !== undefined || value.media !== undefined)) return value;
        const values = Array.isArray(value) ? value : Object.values(value);
        for (const child of values) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(data);
    };

    const fetchJson = async url => {
      const parsedUrl = new URL(url);
      const board = parsedUrl.searchParams.get('board') || '';
      const postNumber = parsedUrl.searchParams.get('num') || '';
      const referrer = `https://${parsedUrl.hostname}/${board}/post/${postNumber}/`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        referrer,
        referrerPolicy: 'strict-origin-when-cross-origin',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      const raw = await response.text();
      if (!/json/i.test(type) && !/^[\s]*[\[{]/.test(raw)) {
        throw new Error(`Expected JSON but received ${type || 'unknown content type'} (possible archive challenge/HTML)`);
      }
      try { return JSON.parse(raw); }
      catch (_) { throw new Error(`Archive returned invalid JSON: ${raw.slice(0, 120)}`); }
    };

    (async () => {
      const failures = [];
      for (const base of apiBases) {
        try {
          const apiUrl = `${base}/_/api/chan/post/?board=${encodeURIComponent(board)}&num=${encodeURIComponent(postNumber)}`;
          const data = await fetchJson(apiUrl);
          let post = extractPost(data);
          if (post) {
            sendResponse({ post, source: base });
            return;
          }

          // Some archive mirrors fail or omit the single-post endpoint while
          // their thread endpoint remains available. Use the link's known OP
          // number as a fallback, then locate the exact reply inside the thread.
          const threadNumber = String(message.threadNumber || '');
          if (threadNumber && /^\d+$/.test(threadNumber)) {
            const threadUrl = `${base}/_/api/chan/thread/?board=${encodeURIComponent(board)}&num=${encodeURIComponent(threadNumber)}`;
            const threadData = await fetchJson(threadUrl);
            post = extractPost(threadData);
            if (post) {
              sendResponse({ post, source: `${base} (thread fallback)` });
              return;
            }
          }
          failures.push(`${base}: API response did not contain post ${postNumber}`);
          console.warn(`[FoolFuuka X] ${base} returned no matching post /${board}/${postNumber}:`, data);
        } catch (error) {
          failures.push(`${base}: ${error.message || error}`);
          console.warn(`[FoolFuuka X] Archive preview lookup failed for /${board}/${postNumber} on ${base}:`, error);
        }
      }
      sendResponse({ post: null, error: failures.join('; ') || 'Post not found in supported archives' });
    })();
    return true;
  }

});
