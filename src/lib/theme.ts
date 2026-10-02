export type ThemePref = "light" | "dark" | "auto";
export const THEME_COOKIE = "theme";

export function parseThemePref(v: string | undefined | null): ThemePref {
  return v === "light" || v === "dark" ? v : "auto";
}

/**
 * Runs before first paint (inlined in <head>). Resolves "auto" from the OS so the
 * page never flashes the wrong theme. Keep it tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
