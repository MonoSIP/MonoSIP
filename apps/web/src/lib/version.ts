/** Build-time app version from apps/web/package.json (Vite `define`). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
