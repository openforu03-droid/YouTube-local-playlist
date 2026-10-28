(function() {
  // YouTube changes its thumbnail/time badge markup frequently. Read the
  // duration from several current and legacy representations.
  function normalizeDurationText(value) {
    if (!value) return "";
    const text = String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const match = text.match(/(?:^|\s)(\d{1,2}:)?\d{1,2}:\d{2}(?:\s|$)/);
    return match ? match[0].trim() : "";
  }

  function durationToSeconds(label) {
    const m = String(label || "").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    const h = m[1] ? Number(m[1]) : 0;
    const min = Number(m[2]);
    const sec = Number(m[3]);
    return h * 3600 + min * 60 + sec;
  }

  function findDuration(el) {
    const selectors = [
      "badge-shape-wiz .yt-badge-shape__text",
      "badge-shape-wiz",
      "ytd-thumbnail-overlay-time-status-renderer #text",
      "ytd-thumbnail-overlay-time-status-renderer span",
      "#text.ytd-thumbnail-overlay-time-status-renderer",
      "span.ytd-thumbnail-overlay-time-status-renderer",
      "[aria-label]",
      "[title]"
    ];

    for (const selector of selectors) {
      for (const node of el.querySelectorAll(selector)) {
        const values = [node.textContent, node.getAttribute?.("aria-label"), node.getAttribute?.("title")];
        for (const value of values) {
          const found = normalizeDurationText(value);
          if (found) return found;
        }
      }
    }

    // Last DOM fallback: search the rendered text for a time-shaped token.
    const found = normalizeDurationText(el.innerText || el.textContent || "");
    return found;
  }

  // Channel name: the markup differs between the playlist page, the watch-page
  // playlist panel and newer layouts, so try several selectors. Anything not
  // found here is filled in later by the metadata fetch in the popup.
  function cleanChannel(value) {
    if (!value) return "";
    const text = String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return text.split(/\s[•·]\s/)[0].trim();
  }

  function findChannel(el) {
    const selectors = [
      "#text.ytd-channel-name",
      "#channel-name #text",
      "#channel-name a",
      "ytd-channel-name yt-formatted-string",
      "ytd-channel-name a",
      "#byline-container #byline",
      "#byline",
      "#byline-container a",
      "a[href^='/@']",
      "a[href^='/channel/']",
      "a[href^='/c/']",
      "a[href^='/user/']",
    ];
    for (const selector of selectors) {
      for (const node of el.querySelectorAll(selector)) {
        const found = cleanChannel(node.innerText || node.textContent);
        if (found) return found;
      }
    }
    return "";
  }

  const videoElements = [
    ...document.querySelectorAll(
      "#content ytd-playlist-panel-video-renderer, #content ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer"
    ),
  ];

  return videoElements.map((el) => {
    const link = el.querySelector("a#thumbnail, a.ytd-playlist-video-renderer, a#video-title, a#video-title-link");
    const href = link ? link.getAttribute("href") : "";
    const match = href ? href.match(/watch\?v=([^&,]+)/) : null;
    const id = (match && match[1]) || "";

    const titleEl = el.querySelector("#video-title, a#video-title, a#video-title-link");
    const title = titleEl ? titleEl.innerText.trim() : "";

    const channel = findChannel(el);

    const durationLabel = findDuration(el);
    const durationSeconds = durationToSeconds(durationLabel);

    return { id, title, channel, durationLabel, durationSeconds };
  }).filter(v => v.id !== "");
})();
