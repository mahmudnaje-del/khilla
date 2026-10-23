/**
 * Supervisor Publishing Authorization Utility
 * Manages supervisor promotion to publisher role via secure password validation.
 */

export const SUPERVISOR_AUTH_KEY = "khilla_supervisor_publisher_v1";

export interface SupervisorSession {
  role: "supervisor_publisher" | "admin";
  username: string;
  name: string;
  token?: string;
  upgradedAt: string;
}

/**
 * Checks if the current browser session has supervisor publishing permissions.
 */
export function isSupervisorPublisher(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SUPERVISOR_AUTH_KEY);
    if (!raw) return false;
    const session: SupervisorSession = JSON.parse(raw);
    return Boolean(session && (session.role === "supervisor_publisher" || session.role === "admin"));
  } catch {
    return false;
  }
}

/**
 * Retrieves the active supervisor session if present.
 */
export function getSupervisorSession(): SupervisorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUPERVISOR_AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves supervisor session to local storage.
 */
export function setSupervisorSession(session: SupervisorSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      localStorage.setItem(SUPERVISOR_AUTH_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SUPERVISOR_AUTH_KEY);
    }
  } catch (err) {
    console.error("Failed to persist supervisor session:", err);
  }
}

/**
 * Verifies the secret password against the server to upgrade the supervisor account.
 */
export async function upgradeSupervisorWithPassword(password: string): Promise<{
  success: boolean;
  session?: SupervisorSession;
  error?: string;
}> {
  const p = (password || "").trim();
  if (!p) {
    return {
      success: false,
      error: "يرجى إدخال كلمة سر المشرف للترقية",
    };
  }

  try {
    const res = await fetch("/api/admin/upgrade-supervisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: p }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      const session: SupervisorSession = {
        role: "supervisor_publisher",
        username: data.user?.username || "supervisor",
        name: data.user?.name || "مشرف ناشر معتمد",
        token: data.token,
        upgradedAt: new Date().toISOString(),
      };
      setSupervisorSession(session);
      return { success: true, session };
    }

    return {
      success: false,
      error: data.error || "كلمة السر غير صحيحة. يرجى التأكد من كلمة سر الإدارة والمحاولة مجدداً.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "تعذر الاتصال بالخادم للتحقق من كلمة السر. يرجى المحاولة لاحقاً.",
    };
  }
}

/**
 * Revokes the supervisor publishing upgrade.
 */
export function revokeSupervisorUpgrade(): void {
  setSupervisorSession(null);
}
