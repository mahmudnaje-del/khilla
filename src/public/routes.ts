export type AdminTab = "transcribe" | "review" | "card" | "archive" | "stats" | "developer" | "admin";
export type AdminExtra = "reports" | "sync";

export function isShareLaunch(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  const params = new URLSearchParams(search);
  return Boolean(params.get("shared") || params.get("id"));
}

export function ensureShareLandsInAdmin(): void {
  if (typeof window === "undefined" || !isShareLaunch()) return;
  if (window.location.pathname.startsWith("/admin/transcribe")) return;
  window.history.replaceState(null, "", `/admin/transcribe${window.location.search}`);
}

export function adminDestination(path: string): AdminTab | AdminExtra {
  if (path.startsWith("/admin/transcribe")) return "transcribe";
  if (path.startsWith("/admin/review")) return "review";
  if (path.startsWith("/admin/fatwas")) return "archive";
  if (path.startsWith("/admin/cards") || path.startsWith("/admin/pdf") || path.startsWith("/admin/media")) return "card";
  if (path.startsWith("/admin/reports")) return "reports";
  if (path.startsWith("/admin/sync")) return "sync";
  if (path.startsWith("/admin/settings") || path.startsWith("/admin/analytics") || path.startsWith("/admin/search")) return "developer";
  if (path.startsWith("/admin/publishing") || path.startsWith("/admin/categories") || path.startsWith("/admin/tags")) return "admin";
  return "stats";
}

export function pathForTab(tab: AdminTab): string {
  if (tab === "transcribe") return "/admin/transcribe";
  if (tab === "review") return "/admin/review";
  if (tab === "archive") return "/admin/fatwas";
  if (tab === "card") return "/admin/cards";
  if (tab === "developer") return "/admin/settings";
  if (tab === "admin") return "/admin/publishing";
  return "/admin";
}

export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}
