chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
            method: 'GET', credentials: 'omit', cache: 'no-store',
            headers: { 'Accept': 'application/json' }
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
});
