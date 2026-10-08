import { getAdminSession, setAdminSession, loginAdmin, AdminUser } from "./adminApi";

export const EDITOR_AUTH_KEY = "khilla_editor_passwords_verified_v4";

/**
 * Checks whether the current browser has verified the secrets for editor access.
 * Requested only once on the first entry.
 */
export function isEditorAuthorized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(EDITOR_AUTH_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Validates the two secret values:
 * Secret 1: EDITOR_SECRET_KEY_1
 * Secret 2: EDITOR_SECRET_KEY_2
 * Validated strictly against server environment secrets.
 */
export async function verifyAndSaveEditorSecrets(
  secret1: string,
  secret2: string
): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  const s1 = (secret1 || "").trim();
  const s2 = (secret2 || "").trim();

  if (!s1 || !s2) {
    return {
      success: false,
      error: "يرجى إدخال حساب المحررين وكلمة السر للدخول",
    };
  }

  try {
    const serverResult = await loginAdmin(s1, s2);
    if (serverResult.success && serverResult.user) {
      if (typeof window !== "undefined") {
        localStorage.setItem(EDITOR_AUTH_KEY, "true");
      }
      return { success: true, user: serverResult.user };
    }
    return {
      success: false,
      error: serverResult.error || "حساب المحررين أو كلمة السر غير صحيحة. يرجى التأكد من البيانات والمحاولة مجدداً.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "تعذر التحقق من البيانات عبر الخادم. يرجى التحقق من الاتصال والمحاولة مجدداً.",
    };
  }
}

/**
 * Revokes the editor access and requires the secrets on next entry.
 */
export function revokeEditorAuthorization(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(EDITOR_AUTH_KEY);
    setAdminSession(null);
  } catch (err) {
    console.error("Error revoking editor authorization:", err);
  }
}
