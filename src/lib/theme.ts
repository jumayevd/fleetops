export type ThemePref = "light" | "dark" | "auto";
export const THEME_COOKIE = "theme";

/** Day is the default; Night and Auto (follow the device) are opt-in from the theme toggle. */
export const DEFAULT_THEME: ThemePref = "light";

export function parseThemePref(v: string | undefined | null): ThemePref {
  return v === "light" || v === "dark" || v === "auto" ? v : DEFAULT_THEME;
}

/**
 * Runs before first paint (inlined in <head>). Applies the saved choice; "auto" follows the OS; no cookie
 * means Day. Keeps the page from flashing the wrong theme. Keep it tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|auto)/);var p=m?m[1]:'${DEFAULT_THEME}';var t=p==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
