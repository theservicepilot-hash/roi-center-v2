const EMBED_KEY = "rc.embed";

function truthy(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function urlRequestsEmbed(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return truthy(params.get("embed"));
  } catch {
    return false;
  }
}

/** Capture `?embed=1` into sessionStorage for this tab session. */
export function captureEmbedFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const embed = params.get("embed")?.trim().toLowerCase();
    if (embed === "0" || embed === "false" || embed === "off") {
      sessionStorage.removeItem(EMBED_KEY);
      return false;
    }
  } catch {
    /* ignore */
  }

  if (urlRequestsEmbed()) {
    sessionStorage.setItem(EMBED_KEY, "1");
    return true;
  }

  return isEmbedMode();
}

export function isEmbedMode(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(EMBED_KEY) === "1" || urlRequestsEmbed();
}
