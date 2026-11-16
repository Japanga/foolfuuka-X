# FoolFuuka X — 0.6.38

## Changes
- 0.6.38: Fixes media URL selection by ignoring filename-only fields such as `media_orig` and `preview_orig`, prioritizing actual thumbnail/original URL fields including `thumb_link`, `media_link`, and `remote_media_link`. Uses eager image loading in hover previews and clears the successful-post cache after both image URLs fail so the next hover performs a fresh API lookup.
- 0.6.37: Improves Archived.Moe hover-preview attachment recovery by searching nested and post-level FoolFuuka media fields, resolving relative media URLs against the supplying archive, falling back from thumbnails to original attachments, and providing a direct attachment link if image rendering fails.
- Adds hover/focus previews for individual posts linked from supported FoolFuuka archive URLs.
- Uses the same archive post IDs carried by the existing /vg/ and Archived.Moe link-routing flow; /vg/ previews are fetched from arch.b4k.dev, while other supported boards try Archived.Moe and then Desuarchive.
- Retrieves only the selected post through the FoolFuuka `/_/api/chan/post/` endpoint rather than downloading the entire thread.
- Displays the board, post number, author, archive date, comment, and a non-spoiler thumbnail when available in a compact floating preview.
- Sanitizes returned comment markup into a small safe formatting allowlist before displaying it.
- Adds Archived.Moe pages to content-script coverage so links can also be previewed while browsing that archive directly.
- Keeps normal click navigation, existing parent-thread resolution, and all current filtering/editor features intact.

- Removes the BBCode Preview button and preview panel entirely. The formatting toolbar now contains only the BBCode formatting buttons.
- Adds the SVG ghost indicator to every post node that qualifies for the existing Hide button, including ghost posts appearing inside ordinary board archives such as /a/. The icon is no longer restricted to pages whose pathname is /ghost/.
- Places the icon immediately after the speech-bubble/reply control when detected. If that control cannot be identified, it uses the same post/header insertion point as the working Hide button and places the icon immediately after Hide.
- Draws the familiar rounded ghost silhouette directly as a light-grey SVG with dark eyes; no emoji glyph or platform-specific font is used, including on mobile.
- Restores the original v0.6.8 Hide button code and styling without experimental placement changes.
- Adds 55 additional Archived.Moe board links at the beginning of the Desuarchive “Archives:” list. The link labels display plain board codes without surrounding slashes; URL path separators remain part of the actual destination URLs.
- Keeps the existing /vg/ entry routed to B4K rather than adding a duplicate Archived.Moe /vg/ entry.
- Adds post/thread routing for all 55 additional Archived.Moe boards. Thread links preserve the thread number and requested post fragment; individual post links query Archived.Moe’s FoolFuuka post API for the true parent thread number and route to that thread with the requested post ID.
- Direct Desuarchive visits to individual post and thread URLs on those boards are routed to Archived.Moe. Ordinary board-index pages remain on Desuarchive.
- Keeps /vg/ routing to B4K separate and does not redirect native 4chan pages for the new Archived.Moe boards.
- Inserts /vg/ as a separate native-styled link between /vr/ and /wsg/, with an explicit left-hand space and the original right-hand separator preserved.
- Fixes the archive-list observer so it disconnects after insertion instead of repeatedly mutating the page.
- Retains individual Hide/Reveal, keyword and username filtering, BBCode tag insertion, and B4K /vg/ routing.

## Install/update
1. Extract this ZIP.
2. Open chrome://extensions.
3. Enable Developer mode.
4. Click Reload on FoolFuuka X.
5. Refresh the archive page.

## Notes
- BBCode buttons insert tags into the post/reply textarea at the cursor or around selected text.
- Use the archive's normal Submit Post button to submit.
- On Desuarchive, links and direct visits to /vg/ are routed to the B4K archive because it carries the /vg/ board.

0.6.18: Uses a light-grey inline SVG rendering of Unicode U+1F47B and displays the archive entry as /vg (without a trailing slash), with spacing around the link handled by margins.

0.6.18: /vg/ post links now query the B4K FoolFuuka post API for thread_num and route to the actual parent thread with a #qPOST fragment.


Version 0.6.18: Adds content-script coverage for boards.4chan.org and boards.4channel.org so /vg/ links opened on 4chan are intercepted and resolved through the B4K FoolFuuka post API. Successful lookups route to the actual archived thread OP with #qPOST_ID; failed lookups fall back to the B4K post route rather than returning to 4chan or inventing a thread ID. Replaces the prior generic ghost glyph with a custom traced SVG based on the user-approved ghost reference.


Version 0.6.19: Adds idempotent Archived.Moe links for the 55 current 4chan boards missing from Desuarchive, placing them before the existing native archive entries. Existing Desuarchive links and the B4K /vg/ route are preserved.

Version 0.6.21: Restores the visible /board/ notation while keeping both slash characters outside the clickable board-name anchor. Converts Desuarchive #pPOST fragments to Archived.Moe #qPOST fragments. Improves Archived.Moe post API response parsing for post-to-parent-thread redirects; if the lookup fails, it avoids inventing a destination. The existing /vg/ to B4K route remains unchanged.


Version 0.6.26: Fixes Archived.Moe parent-thread resolution when the source link uses a bare numeric fragment such as #31423894. The resolver now recognizes #POST, #pPOST, and #qPOST fragments, queries the post API using that post ID even when the link path contains a misleading thread number, and builds the destination as /BOARD/thread/PARENT/#POST. This keeps the post ID separate from the parent thread ID and uses the plain numeric fragment format requested for Archived.Moe.

0.6.30: Fixes path-only Archived.Moe reply links. When a Desuarchive link arrives as /BOARD/thread/POST_ID/ with no fragment, the extension now queries the Archived.Moe FoolFuuka post API using that path number. If the returned thread_num differs from the path number, it redirects to /BOARD/thread/PARENT/#POST_ID. Ordinary OP thread links remain unchanged when the API confirms that the post is its own thread OP.

0.6.31: Experimental individual-post hover previews. Hover or keyboard-focus an archive post/thread link to load its exact post preview. Move the pointer into the preview to keep it open; moving away closes it. If an archive API cannot provide the post, the preview reports that it is unavailable.

0.6.33: Prevents custom hover previews from attaching to native Desuarchive links. The extension now adds its custom preview only to archived.moe (including subdomains) and arch.b4k.dev links, leaving Desuarchive's existing post-hover previews untouched and avoiding duplicate hover cards.


0.6.34: Fixes custom hover previews for Desuarchive links that are routed to Archived.Moe. The preview parser now recognizes the same Archived.Moe-only board set as the redirect handler, including canonical 4chan quote links on Desuarchive pages. These previews query Archived.Moe directly instead of incorrectly preferring the original link host. Native Desuarchive previews remain untouched for boards hosted there. Failed preview requests are no longer cached permanently, allowing a later hover to retry, and failures are logged with useful diagnostics.


0.6.35: Hardens preview URL parsing for /thread/ and /post/ links, records the parent thread number for fallback lookups, recursively extracts the exact post from wrapped/array/keyed FoolFuuka API responses, and falls back to the thread API when the single-post endpoint does not return the requested post. Preview failure messages now expose the API's actual error instead of a generic unavailable notice.


0.6.36: Fixes Archived.Moe preview retrieval for its hosted boards. The API request now includes browser credentials, an Archived.Moe page referrer, and an XMLHttpRequest indicator to better match the working direct-browser request. Removes the invalid Desuarchive fallback for Archived.Moe-only boards (which produced HTTP 422), and passes the known parent thread number into the thread-preview fallback.


Version 0.6.40: Adds a developer capcode to the exact !ANJxuQ9Xkk tripcode when it appears in FoolFuuka tripcode markup. The label is bold and RGB(15, 0, 240); matching plain text in a poster name is not modified.

Version 0.6.42: Restricts the developer capcode feature to Desuarchive hostnames only. Archived.Moe capcode behavior is not changed; the capcode function exits immediately on all non-Desuarchive hosts.

Version 0.6.44: Fixes Desuarchive developer capcode detection by removing the unreliable computed-font-weight rejection. The capcode is applied only to the exact semantic .postertrip element containing !ANJxuQ9Xkk; ordinary poster-name text remains untouched. The ## Developer suffix is a bold strong element in RGB(0, 0, 255).
