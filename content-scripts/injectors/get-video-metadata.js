/* eslint-disable no-console */
(() => {
  try {
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) return null;

    // YouTube is an SPA: meta tags and even the global player response can
    // temporarily belong to the previous video. The actual player API exposes
    // the video currently loaded in the player, so use it as the strongest
    // source for duration. Never fall back to a stale meta duration.
    let currentPlayerDurationSeconds = 0;
    let playerApiTitle = "";
    let playerApiChannel = "";
    try {
      const player = document.getElementById("movie_player");
      const data = player?.getVideoData?.();
      if (data?.video_id === videoId) {
        playerApiTitle = String(data.title || "").trim();
        playerApiChannel = String(data.author || "").trim();
        const d = Number(player?.getDuration?.() || 0);
        if (Number.isFinite(d) && d > 0) currentPlayerDurationSeconds = Math.round(d);
      }
    } catch { /* player API may not be ready yet */ }
    const currentPlayerResponses = [
      window.ytInitialPlayerResponse,
      window.ytplayer?.config?.args?.player_response
    ];
    for (const raw of currentPlayerResponses) {
      try {
        const playerResponse = typeof raw === "string" ? JSON.parse(raw) : raw;
        const details = playerResponse?.videoDetails;
        if (details?.videoId && details.videoId === videoId && details.lengthSeconds) {
          currentPlayerDurationSeconds = parseInt(details.lengthSeconds, 10) || 0;
          break;
        }
      } catch { /* try the next current player source */ }
    }

    // For YouTube SPA navigation, meta/link elements can still belong to the
    // previous video. Do not use them as the primary source for title/channel.
    // The current player response is tied to the current videoId and is therefore
    // the safest source when available.
    let title = playerApiTitle;
    let channel = playerApiChannel;

    let durationISO = "";

    function isoToSeconds(iso) {
      if (!iso) return 0;
      const match = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      if (!match) return 0;
      const d = parseInt(match[1] || "0", 10);
      const h = parseInt(match[2] || "0", 10);
      const m = parseInt(match[3] || "0", 10);
      const s = parseFloat(match[4] || "0");
      return d * 86400 + h * 3600 + m * 60 + Math.floor(s);
    }

    function secsToISO(secs) {
      const s = Math.round(secs);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return "PT" + (h ? `${h}H` : "") + (m ? `${m}M` : "") + (sec || (!h && !m) ? `${sec}S` : "");
    }

    let durationSeconds = currentPlayerDurationSeconds;
    if (currentPlayerDurationSeconds) durationISO = secsToISO(currentPlayerDurationSeconds);

    // Current YouTube player response. Only accept it when its videoId matches
    // the URL. This prevents stale data from the previous SPA video from being
    // copied to the newly archived video.
    const playerResponses = [
      window.ytInitialPlayerResponse,
      window.ytplayer?.config?.args?.player_response
    ];
    for (const raw of playerResponses) {
      try {
        const playerResponse = typeof raw === "string" ? JSON.parse(raw) : raw;
        const details = playerResponse?.videoDetails;
        if (!details || details.videoId !== videoId) continue;
        if (details.title) title = details.title;
        if (details.author) channel = details.author;
        if (!durationSeconds && details.lengthSeconds) {
          durationSeconds = parseInt(details.lengthSeconds, 10) || 0;
          durationISO = secsToISO(durationSeconds);
        }
        if (title && channel && durationSeconds) break;
      } catch { /* try next source */ }
    }

    // Only after checking the current player response, use visible DOM values.
    // These are preferable to meta tags on an SPA because they are updated with
    // the currently displayed video.
    if (!title) {
      title =
        document.querySelector("#title h1 yt-formatted-string")?.textContent?.trim() ||
        document.querySelector("#title h1")?.textContent?.trim() ||
        "";
    }
    if (!channel) {
      channel =
        document.querySelector("ytd-video-owner-renderer #channel-name a")?.textContent?.trim() ||
        document.querySelector("#owner #channel-name a")?.textContent?.trim() ||
        "";
    }

    // Last-resort metadata values. Only use these if the current page did not
    // expose the title/channel in the player response or visible DOM.
    if (!title) {
      title =
        document.querySelector('meta[itemprop="name"]')?.getAttribute("content") ||
        document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
        document.title.replace(" - YouTube", "");
    }
    if (!channel) {
      channel =
        document.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute("content") ||
        document.querySelector('link[itemprop="name"]')?.getAttribute("content") ||
        "";
    }

    // Fallback: current YouTube DOM time badges.
    if (!durationSeconds) {
      const selectors = ["#movie_player .ytp-time-duration", ".ytp-time-duration"];
      const parseLabel = (value) => {
        const m = String(value || "").trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
        return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
      };
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const seconds = parseLabel(node?.textContent || node?.getAttribute?.("aria-label") || node?.getAttribute?.("title"));
        if (seconds) { durationSeconds = seconds; durationISO = secsToISO(seconds); break; }
      }
    }

    // Fallback: Check HTML5 video element duration
    if (!durationSeconds) {
      const videoEl = document.querySelector("video.html5-main-video");
      if (videoEl && videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
        durationSeconds = Math.round(videoEl.duration);
        durationISO = secsToISO(durationSeconds);
      }
    }

    return {
      videoId,
      title: title || "",
      channel: channel || "",
      durationISO: durationISO || "",
      durationSeconds: durationSeconds || 0,
    };
  } catch (e) {
    console.error("[YPH] Metadata extraction failed:", e);
    return null;
  }
})();
