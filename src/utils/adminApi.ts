export const ADMIN_STORAGE_KEY = "khilla_admin_auth_session";

export interface AdminUser {
  username: string;
  name: string;
  role: string;
}

export interface AdminSession {
  user: AdminUser;
  token: string;
  timestamp: number;
}

export function getAdminSession(): AdminSession | null {
  try {
    const saved = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession | null) {
  try {
    if (session) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  } catch (err) {
    console.error("Failed to save admin session:", err);
  }
}

export function getAuthHeaders(): Record<string, string> {
  const session = getAdminSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session && session.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }
  return headers;
}

export async function verifyAdminSessionOnServer(): Promise<{
  valid: boolean;
  user?: AdminUser;
  error?: string;
}> {
  const session = getAdminSession();
  if (!session || !session.token) {
    return { valid: false, error: "لا توجد جلسة نشطة" };
  }
  try {
    const res = await fetch("/api/admin/verify-session", {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { valid: true, user: data.user };
    }
    setAdminSession(null);
    return { valid: false, error: data.error || "انتهت صلاحية الجلسة" };
  } catch (err: any) {
    return { valid: false, error: err?.message || "تعذر التحقق من الجلسة" };
  }
}

export async function loginAdmin(username: string, password: string): Promise<{
  success: boolean;
  user?: AdminUser;
  token?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const session: AdminSession = {
        user: data.user,
        token: data.token,
        timestamp: Date.now(),
      };
      setAdminSession(session);
      return { success: true, user: data.user, token: data.token };
    }
    return { success: false, error: data.error || "بيانات الدخول غير صحيحة" };
  } catch (err: any) {
    return { success: false, error: "تعذر الاتصال بالخادم. يرجى التحقق من الاتصال." };
  }
}

export async function fetchApprovedFatwas(): Promise<{success: boolean; fatwas: any[]; total: number; error?: string}> {
  try {
    const res = await fetch("/api/admin/fatwas");
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, fatwas: data.fatwas || [], total: data.total || 0 };
    }
    return { success: false, fatwas: [], total: 0, error: data.error };
  } catch (err: any) {
    return { success: false, fatwas: [], total: 0, error: err.message };
  }
}

export async function fetchAllUserFatwasFromServer(): Promise<{success: boolean; fatwas: any[]; total: number; error?: string}> {
  try {
    const res = await fetch("/api/admin/user-fatwas");
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, fatwas: data.fatwas || [], total: data.total || 0 };
    }
    return { success: false, fatwas: [], total: 0, error: data.error };
  } catch (err: any) {
    return { success: false, fatwas: [], total: 0, error: err.message };
  }
}

export async function fetchDeletedFatwaIds(): Promise<{success: boolean; deletedIds: string[]; error?: string}> {
  try {
    const res = await fetch("/api/deleted-fatwas");
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.deletedIds)) {
      return { success: true, deletedIds: data.deletedIds };
    }
    return { success: false, deletedIds: [], error: data.error };
  } catch (err: any) {
    return { success: false, deletedIds: [], error: err.message };
  }
}

export async function fetchPendingReviewFatwas(): Promise<{success: boolean; fatwas: any[]; total: number; error?: string}> {
  try {
    const res = await fetch("/api/pending-fatwas");
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, fatwas: data.fatwas || [], total: data.total || 0 };
    }
    return { success: false, fatwas: [], total: 0, error: data.error };
  } catch (err: any) {
    return { success: false, fatwas: [], total: 0, error: err.message };
  }
}

export async function deleteApprovedFatwaFromServer(id: string, fatwaNumber?: number): Promise<{success: boolean; error?: string}> {
  try {
    const url = fatwaNumber
      ? `/api/admin/fatwas/${encodeURIComponent(id)}?fatwaNumber=${encodeURIComponent(fatwaNumber)}`
      : `/api/admin/fatwas/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return { success: res.ok && data.success, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateApprovedFatwaOnServer(id: string, updated: any): Promise<{success: boolean; fatwa?: any; error?: string}> {
  try {
    const res = await fetch(`/api/admin/fatwas/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ fatwa: updated }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, fatwa: data.fatwa || updated, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Strips huge fields (e.g. multi-megabyte audio dataUrl base64 strings or giant card images)
 * before transmission to the server. Keeps essential audio metadata (name, size, duration, mimeType).
 */
export function sanitizeFatwaForNetwork(fatwa: any): any {
  if (!fatwa) return fatwa;
  const copy = { ...fatwa };
  if (copy.audio_file) {
    const { dataUrl, ...restAudio } = copy.audio_file;
    copy.audio_file = restAudio;
  }
  if (copy.image_url && typeof copy.image_url === "string" && copy.image_url.startsWith("data:") && copy.image_url.length > 2000) {
    delete copy.image_url;
  }
  return copy;
}

export async function syncApprovedFatwa(fatwa: any): Promise<{success: boolean; fatwa?: any; error?: string}> {
  try {
    const toSend = sanitizeFatwaForNetwork(fatwa);
    const res = await fetch("/api/admin/fatwas", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ fatwa: toSend }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, fatwa: data.fatwa, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function saveUserFatwaToServer(fatwa: any): Promise<{success: boolean; fatwa?: any; error?: string}> {
  try {
    const toSend = sanitizeFatwaForNetwork(fatwa);
    const res = await fetch("/api/admin/user-fatwas", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ fatwa: toSend }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, fatwa: data.fatwa, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkSyncFatwasToServer(fatwas: any[]): Promise<{success: boolean; count?: number; error?: string}> {
  try {
    const cleanList = (fatwas || []).map(sanitizeFatwaForNetwork);
    const res = await fetch("/api/admin/bulk-sync", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ fatwas: cleanList }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, count: data.count, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resequenceAllFatwasOnServer(): Promise<{
  success: boolean;
  count: number;
  fatwas: any[];
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/resequence-fatwas", {
      method: "POST",
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return {
      success: res.ok && data.success,
      count: data.count || 0,
      fatwas: data.fatwas || [],
      message: data.message,
      error: data.error,
    };
  } catch (err: any) {
    return { success: false, count: 0, fatwas: [], error: err.message };
  }
}

export async function fixQuestionGreetingsOnServer(): Promise<{
  success: boolean;
  totalFixed?: number;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/fix-question-greetings", {
      method: "POST",
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return {
      success: res.ok && data.success,
      totalFixed: data.totalFixed || 0,
      message: data.message,
      error: data.error,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface ServerHealthResponse {
  status: string;
  healthy: boolean;
  timestamp: string;
  latencyMs: number;
  uptimeSeconds: number;
  storage: {
    dataDirExists: boolean;
    approvedFatwasCount: number;
    userFatwasCount: number;
    deletedTombstonesCount: number;
    totalFatwas: number;
    userFileSizeKB?: number;
    approvedFileSizeKB?: number;
  };
  gemini: {
    ready: boolean;
    paidKeyConfigured: boolean;
    primaryKeyConfigured: boolean;
    activeModels: string[];
  };
  realtime: {
    sseClientsCount: number;
    status: string;
  };
  system: {
    nodeVersion: string;
    memoryHeapUsedMB: number;
    memoryRssMB: number;
  };
  features: {
    transcription: string;
    pureAiWordParser: string;
    vocalizationTashkeel: string;
    webShareTarget: string;
    optimisticConcurrencyControl: string;
  };
}

export async function checkServerHealth(): Promise<{
  success: boolean;
  health?: ServerHealthResponse;
  latencyMs?: number;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    const res = await fetch("/api/health");
    const latency = Math.round(performance.now() - t0);
    const data = await res.json();
    if (res.ok && (data.healthy || data.status === "ok")) {
      return { success: true, health: data, latencyMs: latency };
    }
    return { success: false, error: data.error || "الخادم لم يعد استجابة صالحة", latencyMs: latency };
  } catch (err: any) {
    const latency = Math.round(performance.now() - t0);
    return { success: false, error: err?.message || "تعذر الوصول للخادم", latencyMs: latency };
  }
}

export interface VerifySyncReport {
  totalVerified: number;
  approvedCount: number;
  pendingReviewCount: number;
  deletedTombstonesCount: number;
  repairs: {
    fixedGreetingsCount: number;
    separatedBleedCount: number;
    missingIdFixed: number;
    missingNumberFixed: number;
  };
  storageIntegrity: string;
  serverStatus: string;
}

export async function verifyAndRepairServerSync(): Promise<{
  success: boolean;
  healthy?: boolean;
  report?: VerifySyncReport;
  message?: string;
  latencyMs?: number;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    const res = await fetch("/api/health/verify-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const latency = Math.round(performance.now() - t0);
    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        healthy: data.healthy,
        report: data.report,
        message: data.message,
        latencyMs: latency,
      };
    }
    return {
      success: false,
      error: data.error || "فشل التحقق من صحة المزامنة على الخادم",
      latencyMs: latency,
    };
  } catch (err: any) {
    const latency = Math.round(performance.now() - t0);
    return {
      success: false,
      error: err?.message || "تعذر إجراء فحص الخوادم والمزامنة",
      latencyMs: latency,
    };
  }
}

