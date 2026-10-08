import type { Fatwa } from "../types";

const SAVED_KEY = "khilla-public-saved";
const RECENT_KEY = "khilla-public-recent";
const SEARCH_HISTORY_KEY = "khilla-public-searches";
const REPORTS_KEY = "khilla-public-reports";
const PREFS_KEY = "khilla-public-reading";

export interface PublicReport {
  reportId: string;
  fatwaId: string;
  fatwaNumber: number;
  type: string;
  message: string;
  createdAt: string;
  status: "جديد" | "قيد المراجعة" | "تم الإصلاح" | "مرفوض";
  offlineQueued: boolean;
}

export interface ReadingPrefs {
  fontScale: number;
  lineHeight: number;
  width: "narrow" | "normal";
  theme: "light" | "dark" | "system";
  reduceMotion: boolean;
}

export const DEFAULT_PREFS: ReadingPrefs = {
  fontScale: 1,
  lineHeight: 1.9,
  width: "normal",
  theme: "light",
  reduceMotion: false,
};

export function normalizeArabic(value: string): string {
  return String(value || "")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isPublicFatwa(fatwa: Fatwa): boolean {
  if (!fatwa || fatwa.deleted) return false;
  if (fatwa.approved === false) return false;
  if (fatwa.isPublic === false) return false;
  if (fatwa.status === "تحتاج مراجعة" || fatwa.status === "مسودة" || fatwa.status === "مراجعة") return false;
  if (fatwa.status === "منشورة") return true;
  if (fatwa.status === "معتمدة" && fatwa.isPublic === true) return true;
  return false;
}

export function getPublicFatwas(fatwas: Fatwa[]): Fatwa[] {
  return fatwas
    .filter(isPublicFatwa)
    .slice()
    .sort((a, b) => {
      const ad = Date.parse(a.updated_at || a.created_at || "") || 0;
      const bd = Date.parse(b.updated_at || b.created_at || "") || 0;
      if (bd !== ad) return bd - ad;
      return (b.fatwaNumber || 0) - (a.fatwaNumber || 0);
    });
}

export function publicQuestion(fatwa: Fatwa): string {
  return (fatwa.question_clean || fatwa.question_original || "").trim();
}

export function publicAnswer(fatwa: Fatwa): string {
  return (fatwa.answer_clean || "").trim();
}

export interface SearchHit {
  fatwa: Fatwa;
  score: number;
  reason: "رقم" | "السؤال" | "التصنيف" | "الوسم" | "الجواب";
}

export function searchFatwas(fatwas: Fatwa[], query: string): SearchHit[] {
  const q = normalizeArabic(query);
  if (!q) return [];
  const tokens = q.split(" ").filter((token) => token.length > 1);
  const hits: SearchHit[] = [];

  for (const fatwa of fatwas) {
    if (!isPublicFatwa(fatwa)) continue;
    const question = normalizeArabic(publicQuestion(fatwa));
    const answer = normalizeArabic(publicAnswer(fatwa));
    const category = normalizeArabic(fatwa.category || "");
    const tags = normalizeArabic((fatwa.tags || []).join(" "));
    const number = String(fatwa.fatwaNumber || "");
    let score = 0;
    let reason: SearchHit["reason"] = "الجواب";

    if (q === number || q === `فتوى ${number}` || q === `رقم ${number}`) {
      score += 80;
      reason = "رقم";
    }
    if (question.includes(q)) {
      score += 24;
      reason = "السؤال";
    }
    for (const token of tokens) {
      if (question.includes(token)) {
        score += 8;
        if (reason === "الجواب") reason = "السؤال";
      }
      if (category.includes(token)) {
        score += 6;
        if (reason === "الجواب") reason = "التصنيف";
      }
      if (tags.includes(token)) {
        score += 5;
        if (reason === "الجواب") reason = "الوسم";
      }
      if (answer.includes(token)) score += 2;
    }
    if (score > 0) hits.push({ fatwa, score, reason });
  }

  hits.sort((a, b) => b.score - a.score || (b.fatwa.fatwaNumber || 0) - (a.fatwa.fatwaNumber || 0));
  return hits;
}

export function categoryCounts(fatwas: Fatwa[]): Array<{ name: string; count: number; sample: string }> {
  const map = new Map<string, { count: number; sample: string }>();
  for (const fatwa of fatwas) {
    const name = (fatwa.category || "").trim();
    if (!name) continue;
    const current = map.get(name) || { count: 0, sample: "" };
    current.count += 1;
    if (!current.sample) current.sample = publicQuestion(fatwa);
    map.set(name, current);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
}

export function topTags(fatwas: Fatwa[], limit = 12): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const fatwa of fatwas) {
    for (const tag of fatwa.tags || []) {
      const name = tag.trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, limit);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage */
  }
}

export function loadSavedIds(): string[] {
  return readJson<string[]>(SAVED_KEY, []);
}

export function toggleSaved(id: string): string[] {
  const current = loadSavedIds();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
  writeJson(SAVED_KEY, next);
  return next;
}

export function loadRecentIds(): string[] {
  return readJson<string[]>(RECENT_KEY, []);
}

export function rememberViewed(id: string): string[] {
  const next = [id, ...loadRecentIds().filter((item) => item !== id)].slice(0, 20);
  writeJson(RECENT_KEY, next);
  return next;
}

export function clearRecent(): void {
  writeJson(RECENT_KEY, []);
}

export function loadSearchHistory(): string[] {
  return readJson<string[]>(SEARCH_HISTORY_KEY, []);
}

export function rememberSearch(query: string): void {
  const clean = query.trim();
  if (clean.length < 2) return;
  const next = [clean, ...loadSearchHistory().filter((item) => item !== clean)].slice(0, 8);
  writeJson(SEARCH_HISTORY_KEY, next);
}

export function clearSearchHistory(): void {
  writeJson(SEARCH_HISTORY_KEY, []);
}

export function loadReports(): PublicReport[] {
  return readJson<PublicReport[]>(REPORTS_KEY, []);
}

export function addReport(input: Omit<PublicReport, "reportId" | "createdAt" | "status" | "offlineQueued">): PublicReport {
  const report: PublicReport = {
    ...input,
    reportId: `rpt_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    status: "جديد",
    offlineQueued: typeof navigator !== "undefined" ? !navigator.onLine : true,
  };
  writeJson(REPORTS_KEY, [report, ...loadReports()]);
  return report;
}

export function updateReportStatus(reportId: string, status: PublicReport["status"]): PublicReport[] {
  const next = loadReports().map((report) => (report.reportId === reportId ? { ...report, status } : report));
  writeJson(REPORTS_KEY, next);
  return next;
}

export function loadPrefs(): ReadingPrefs {
  return { ...DEFAULT_PREFS, ...readJson<Partial<ReadingPrefs>>(PREFS_KEY, {}) };
}

export function savePrefs(prefs: ReadingPrefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function findPublicFatwa(fatwas: Fatwa[], key: string): Fatwa | null {
  const decoded = decodeURIComponent(key);
  const byId = fatwas.find((fatwa) => isPublicFatwa(fatwa) && fatwa.id === decoded);
  if (byId) return byId;
  const number = Number(decoded);
  if (!Number.isFinite(number)) return null;
  return fatwas.find((fatwa) => isPublicFatwa(fatwa) && fatwa.fatwaNumber === number) || null;
}

export function relatedFatwas(fatwas: Fatwa[], current: Fatwa, limit = 4): Fatwa[] {
  const tags = new Set(current.tags || []);
  return fatwas
    .filter((fatwa) => fatwa.id !== current.id && isPublicFatwa(fatwa))
    .map((fatwa) => {
      let score = 0;
      if (fatwa.category && fatwa.category === current.category) score += 3;
      for (const tag of fatwa.tags || []) if (tags.has(tag)) score += 2;
      return { fatwa, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.fatwa);
}
