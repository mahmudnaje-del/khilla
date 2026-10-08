import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Compass,
  Home,
  Menu,
  Moon,
  Search,
  Share2,
  Sun,
  Volume2,
  X,
} from "lucide-react";
import type { Fatwa } from "../types";
import { getAdminSession } from "../utils/adminApi";
import { isEditorAuthorized } from "../utils/editorAuth";
import {
  addReport,
  categoryCounts,
  clearRecent,
  clearSearchHistory,
  findPublicFatwa,
  getPublicFatwas,
  loadPrefs,
  loadRecentIds,
  loadReports,
  loadSavedIds,
  loadSearchHistory,
  publicAnswer,
  publicQuestion,
  relatedFatwas,
  rememberSearch,
  rememberViewed,
  savePrefs,
  searchFatwas,
  toggleSaved,
  topTags,
  updateReportStatus,
  type PublicReport,
  type ReadingPrefs,
} from "./library";

interface PublicPlatformProps {
  fatwas: Fatwa[];
  onOpenAdmin: () => void;
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function snippet(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function PublicPlatform({ fatwas, onOpenAdmin }: PublicPlatformProps) {
  const online = useOnline();
  const [href, setHref] = useState(() => window.location.pathname + window.location.search);
  const [saved, setSaved] = useState<string[]>(() => loadSavedIds());
  const [recent, setRecent] = useState<string[]>(() => loadRecentIds());
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => loadPrefs());
  const [notice, setNotice] = useState("");

  const published = useMemo(() => getPublicFatwas(fatwas), [fatwas]);
  const path = href.split("?")[0] || "/";
  const query = new URLSearchParams(href.includes("?") ? href.slice(href.indexOf("?")) : "");

  const go = (next: string) => {
    window.history.pushState(null, "", next);
    setHref(next);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const sync = () => setHref(window.location.pathname + window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const dark =
    prefs.theme === "dark" ||
    (prefs.theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    document.documentElement.classList.toggle("public-dark", dark);
    return () => document.documentElement.classList.remove("public-dark");
  }, [dark]);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setPrefs(loadPrefs());
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [prefs.theme]);

  const setTheme = (theme: ReadingPrefs["theme"]) => {
    const next = { ...prefs, theme };
    setPrefs(next);
    savePrefs(next);
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const openFatwa = (fatwa: Fatwa) => {
    setRecent(rememberViewed(fatwa.id));
    go(`/fatwa/${encodeURIComponent(String(fatwa.fatwaNumber || fatwa.id))}`);
  };

  const save = (id: string) => {
    const next = toggleSaved(id);
    setSaved(next);
    flash(next.includes(id) ? "حُفظت الفتوى على هذا الجهاز" : "أُزيلت من المحفوظة");
  };

  const page = renderPage();

  return (
    <div className="public-shell min-h-screen" data-theme={dark ? "dark" : "light"} dir="rtl">
      <PublicHeader path={path} onNavigate={go} online={online} onOpenAdmin={onOpenAdmin} dark={dark} onToggleTheme={() => setTheme(dark ? "light" : "dark")} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 lg:pb-16">{page}</main>
      <PublicFooter onNavigate={go} />
      <BottomNav path={path} onNavigate={go} />
      {notice && (
        <div className="pub-solid fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );

  function renderPage() {
    if (path === "/search") {
      return (
        <SearchPage
          published={published}
          initialQuery={query.get("q") || ""}
          saved={saved}
          onOpen={openFatwa}
          onSave={save}
          onNavigate={go}
        />
      );
    }
    if (path.startsWith("/fatwa/")) {
      const key = decodeURIComponent(path.slice("/fatwa/".length));
      const fatwa = findPublicFatwa(published, key);
      return (
        <FatwaPage
          fatwa={fatwa}
          related={fatwa ? relatedFatwas(published, fatwa) : []}
          saved={saved}
          prefs={prefs}
          onOpen={openFatwa}
          onSave={save}
          onNavigate={go}
          onNotice={flash}
        />
      );
    }
    if (path === "/categories" || path === "/topics") {
      return <CategoriesPage published={published} onNavigate={go} />;
    }
    if (path.startsWith("/category/") || path.startsWith("/topics/")) {
      const raw = decodeURIComponent(path.split("/").slice(2).join("/"));
      const list = published.filter((fatwa) => fatwa.category === raw || (fatwa.tags || []).includes(raw));
      return <ListPage title={raw || "التصنيف"} fatwas={list} saved={saved} onOpen={openFatwa} onSave={save} />;
    }
    if (path === "/latest") return <ListPage title="أحدث الفتاوى" fatwas={published.slice(0, 40)} saved={saved} onOpen={openFatwa} onSave={save} />;
    if (path === "/featured") {
      const featured = published.filter((fatwa) => fatwa.isFeatured);
      return <ListPage title="فتاوى مختارة" fatwas={featured} saved={saved} onOpen={openFatwa} onSave={save} empty="لم تُعلَّم فتاوى مختارة بعد." />;
    }
    if (path === "/saved") {
      const list = published.filter((fatwa) => saved.includes(fatwa.id));
      return <ListPage title="الفتاوى المحفوظة" fatwas={list} saved={saved} onOpen={openFatwa} onSave={save} empty="لم تحفظ أي فتوى بعد. عندما تجد فتوى تريد الرجوع إليها، اضغط علامة الحفظ." />;
    }
    if (path === "/about") return <AboutPage />;
    if (path === "/report") return <ReportPage published={published} presetId={query.get("fatwa") || ""} onDone={flash} />;
    if (path === "/offline") return <OfflinePage published={published} savedCount={saved.length} online={online} onNavigate={go} />;
    if (path === "/settings") {
      return (
        <SettingsPage
          prefs={prefs}
          savedCount={saved.length}
          recentCount={recent.length}
          onChange={(next) => {
            setPrefs(next);
            savePrefs(next);
          }}
          onClearSaved={() => {
            localStorage.removeItem("khilla-public-saved");
            setSaved([]);
          }}
          onClearRecent={() => {
            clearRecent();
            setRecent([]);
          }}
          onClearSearches={clearSearchHistory}
        />
      );
    }
    return (
      <HomePage
        published={published}
        recent={published.filter((fatwa) => recent.includes(fatwa.id)).slice(0, 3)}
        saved={saved}
        onNavigate={go}
        onOpen={openFatwa}
        onSave={save}
      />
    );
  }
}

function PublicHeader({
  path,
  onNavigate,
  online,
  onOpenAdmin,
  dark,
  onToggleTheme,
}: {
  path: string;
  onNavigate: (path: string) => void;
  online: boolean;
  onOpenAdmin: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const admin = Boolean(isEditorAuthorized());
  const links = [
    ["/", "الرئيسية"],
    ["/latest", "الفتاوى"],
    ["/categories", "التصنيفات"],
    ["/saved", "المحفوظة"],
    ["/about", "عن الشيخ"],
  ] as const;
  return (
    <header className="pub-header sticky top-0 z-40">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => onNavigate("/")} className="flex min-w-0 items-center gap-2.5 text-right">
          <img src="/icon-app.png" alt="" className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl object-cover ring-1 ring-[var(--line)] shrink-0" />
          <span className="min-w-0">
            <span className="pub-brand block font-cairo text-[13px] xs:text-sm sm:text-base font-bold leading-tight tracking-tight">
              فتاوى الشيخ عبد الباري محمد خلة
            </span>
          </span>
        </button>
        <div className="ms-auto hidden items-center gap-4 lg:flex">
          {links.map(([href, label]) => (
            <button key={href} type="button" onClick={() => onNavigate(href)} className={`text-sm ${path === href ? "pub-nav-active" : "pub-nav-idle"}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onNavigate("/search")} className="pub-solid rounded-full px-3 py-1.5 text-sm">بحث</button>
          {admin ? (
            <button type="button" onClick={onOpenAdmin} className="pub-gold text-sm font-cairo">غرفة التحرير</button>
          ) : (
            <button type="button" onClick={onOpenAdmin} className="pub-chip text-xs rounded-full px-3 py-1 font-cairo hover:border-emerald-600 transition-colors">دخول المحررين</button>
          )}
        </div>
        <button type="button" onClick={onToggleTheme} className="pub-chip ms-auto flex h-11 w-11 items-center justify-center rounded-2xl lg:ms-0" aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}>
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button type="button" className="pub-chip flex h-11 w-11 items-center justify-center rounded-2xl lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <nav className="pub-bg-2 absolute inset-x-3 top-3 space-y-1 rounded-3xl p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <strong className="font-cairo">القائمة</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </div>
            {[...links, ["/search", "البحث"], ["/settings", "إعدادات القراءة"], ["/offline", "بدون اتصال"]].map(([href, label]) => (
              <button key={href} type="button" className="block w-full rounded-2xl px-3 py-3 text-right text-base" onClick={() => { setOpen(false); onNavigate(href); }}>{label}</button>
            ))}
            <button type="button" className="pub-muted block w-full rounded-2xl px-3 py-3 text-right" onClick={() => { setOpen(false); onOpenAdmin(); }}>دخول المحررين</button>
          </nav>
        </div>
      )}
    </header>
  );
}

function BottomNav({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const items = [
    ["/", "الرئيسية", Home],
    ["/search", "البحث", Search],
    ["/categories", "التصنيفات", Compass],
    ["/saved", "المحفوظة", Bookmark],
    ["/settings", "المزيد", Menu],
  ] as const;
  return (
    <nav className="pub-bottom fixed inset-x-0 bottom-0 z-40 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid grid-cols-5">
        {items.map(([href, label, Icon]) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <button key={href} type="button" onClick={() => onNavigate(href)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "pub-nav-active" : "pub-nav-idle"}`}>
              <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "pub-wash" : ""}`}>
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PublicFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="pub-muted mx-auto hidden max-w-5xl px-6 pb-10 text-sm lg:block">
      <div className="pub-line flex items-center justify-between border-t pt-6">
        <p>منصة فتاوى فضيلة الشيخ د. عبد الباري خلة. البحث يسترجع الفتاوى المعتمدة ولا ينشئ حكماً.</p>
        <button type="button" onClick={() => onNavigate("/about")} className="pub-brand">عن المنصة</button>
      </div>
    </footer>
  );
}

function HomePage({
  published,
  recent,
  saved,
  onNavigate,
  onOpen,
  onSave,
}: {
  published: Fatwa[];
  recent: Fatwa[];
  saved: string[];
  onNavigate: (path: string) => void;
  onOpen: (fatwa: Fatwa) => void;
  onSave: (id: string) => void;
}) {
  const categories = categoryCounts(published).slice(0, 8);
  const tags = topTags(published, 8);
  const audio = published.filter((fatwa) => fatwa.audio_file?.name).slice(0, 4);
  const featured = published.filter((fatwa) => fatwa.isFeatured).slice(0, 4);
  return (
    <div className="space-y-8">
      <section className="pub-card rounded-[28px] px-4 py-6 sm:px-8">
        <h1 className="pub-brand font-cairo text-[1.65rem] font-bold leading-snug sm:text-4xl">ابحث في فتاوى الشيخ د. عبد الباري خلة</h1>
        <p className="pub-muted mt-3 max-w-2xl text-sm leading-8">اكتب سؤالك، وسنبحث في الفتاوى المعتمدة. المنصة تسترجع فتوى الشيخ ولا تؤلف جواباً.</p>
        <SearchBox onSubmit={(value) => { rememberSearch(value); onNavigate(`/search?q=${encodeURIComponent(value)}`); }} />
        <div className="mt-3 flex flex-wrap gap-2">
          {["هل يجوز جمع الصلاة للمسافر؟", "متى تجب زكاة المال؟", "حكم سجود السهو؟"].map((example) => (
            <button key={example} type="button" onClick={() => onNavigate(`/search?q=${encodeURIComponent(example)}`)} className="pub-chip rounded-full px-3 py-2 text-xs">
              {example}
            </button>
          ))}
        </div>
        <NumberJump onNavigate={onNavigate} />
      </section>
      {recent[0] && (
        <button type="button" onClick={() => onOpen(recent[0])} className="pub-card flex w-full items-center justify-between rounded-2xl px-4 py-3 text-right">
          <span>
            <span className="pub-gold block text-xs">تابع من حيث توقفت</span>
            <span className="mt-1 block font-bold">{snippet(publicQuestion(recent[0]), 72)}</span>
          </span>
          <span className="pub-muted text-xs">فتوى {recent[0].fatwaNumber}</span>
        </button>
      )}

      {categories.length > 0 && (
        <section>
          <SectionTitle title="التصنيفات" action="عرض الكل" onAction={() => onNavigate("/categories")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((category) => (
              <button key={category.name} type="button" onClick={() => onNavigate(`/category/${encodeURIComponent(category.name)}`)} className="pub-card min-h-32 rounded-2xl p-4 text-right">
                <BookOpen className="pub-brand mb-3 h-4 w-4" />
                <span className="block font-cairo font-bold leading-6">{category.name}</span>
                <span className="pub-gold mt-2 block text-xs">{category.count} فتوى</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <SectionTitle title="فتاوى مختارة" />
          <div className="space-y-3">{featured.map((fatwa) => <FatwaCard key={fatwa.id} fatwa={fatwa} saved={saved.includes(fatwa.id)} onOpen={onOpen} onSave={onSave} />)}</div>
        </section>
      )}

      <section>
        <SectionTitle title="أحدث الفتاوى" action="عرض جميع الفتاوى" onAction={() => onNavigate("/latest")} />
        {published.length === 0 ? (
          <Empty text="لا توجد فتاوى معتمدة للعرض بعد." />
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">{published.slice(0, 6).map((fatwa) => <FatwaCard key={fatwa.id} fatwa={fatwa} saved={saved.includes(fatwa.id)} onOpen={onOpen} onSave={onSave} />)}</div>
        )}
      </section>

      {tags.length > 0 && (
        <section>
          <SectionTitle title="استكشف الموضوعات" />
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button key={tag.name} type="button" onClick={() => onNavigate(`/topics/${encodeURIComponent(tag.name)}`)} className="pub-chip rounded-full px-3 py-2 text-sm">
                {tag.name} <span className="pub-gold">{tag.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {audio.length > 0 && (
        <section>
          <SectionTitle title="فتاوى لها تسجيل" />
          <div className="space-y-3">{audio.map((fatwa) => <FatwaCard key={fatwa.id} fatwa={fatwa} saved={saved.includes(fatwa.id)} onOpen={onOpen} onSave={onSave} />)}</div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionTitle title="آخر ما قرأت" />
          <div className="space-y-3">{recent.map((fatwa) => <FatwaCard key={fatwa.id} fatwa={fatwa} saved={saved.includes(fatwa.id)} onOpen={onOpen} onSave={onSave} />)}</div>
        </section>
      )}
    </div>
  );
}

function NumberJump({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [number, setNumber] = useState("");
  return (
    <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (number.trim()) onNavigate(`/fatwa/${encodeURIComponent(number.trim())}`); }}>
      <input value={number} onChange={(event) => setNumber(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="اذهب إلى فتوى رقم..." className="pub-input min-h-11 flex-1 rounded-2xl px-4 text-sm outline-none" />
      <button type="submit" className="pub-chip min-h-11 rounded-2xl px-4 text-sm">انتقال</button>
    </form>
  );
}

function SearchBox({ onSubmit, initial = "" }: { onSubmit: (value: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); onSubmit(value.trim()); }}>
      <label className="sr-only" htmlFor="public-search">ابحث في الفتاوى</label>
      <input id="public-search" value={value} onChange={(event) => setValue(event.target.value)} placeholder="اكتب سؤالك هنا، وسنبحث لك عن أقرب الفتاوى..." className="pub-input min-h-14 flex-1 rounded-2xl px-4 text-base outline-none" />
      <button type="submit" className="pub-solid min-h-14 min-w-14 rounded-2xl px-4" aria-label="بحث"><Search className="h-5 w-5" /></button>
    </form>
  );
}

function SearchPage({
  published,
  initialQuery,
  saved,
  onOpen,
  onSave,
  onNavigate,
}: {
  published: Fatwa[];
  initialQuery: string;
  saved: string[];
  onOpen: (fatwa: Fatwa) => void;
  onSave: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [audioOnly, setAudioOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => { if (debounced) rememberSearch(debounced); }, [debounced]);

  const hits = useMemo(() => searchFatwas(published, debounced), [published, debounced]);
  const categories = categoryCounts(published);
  const filtered = hits.filter((hit) => {
    if (audioOnly && !hit.fatwa.audio_file?.name) return false;
    if (savedOnly && !saved.includes(hit.fatwa.id)) return false;
    if (category && hit.fatwa.category !== category) return false;
    return true;
  });
  const closest = filtered.slice(0, 3);
  const rest = filtered.slice(3, 30);
  const history = loadSearchHistory();

  return (
    <div className="space-y-4">
      <h1 className="font-cairo text-2xl font-bold pub-brand">البحث في الفتاوى</h1>
      <SearchBox initial={query} onSubmit={(value) => { setQuery(value); onNavigate(`/search?q=${encodeURIComponent(value)}`); }} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setFiltersOpen(true)} className="pub-chip rounded-full px-3 py-2 text-sm">تصفية</button>
        {category && <span className="pub-wash rounded-full px-3 py-2 text-sm">{category}</span>}
      </div>
      {!debounced && (
        <div className="space-y-3">
          <p className="pub-muted text-sm">جرّب موضوعاً، أو ارجع إلى بحث سابق.</p>
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <button key={item} type="button" className="pub-chip rounded-full px-3 py-2 text-sm" onClick={() => { setQuery(item); onNavigate(`/search?q=${encodeURIComponent(item)}`); }}>{item}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 4).map((item) => (
              <button key={item.name} type="button" onClick={() => onNavigate(`/category/${encodeURIComponent(item.name)}`)} className="pub-card rounded-2xl p-3 text-right">{item.name}</button>
            ))}
          </div>
        </div>
      )}
      {debounced && filtered.length === 0 && (
        <Empty text="لم نعثر على فتوى منشورة قريبة بما يكفي من سؤالك.">
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" className="pub-chip rounded-full px-3 py-2 text-sm" onClick={() => onNavigate("/categories")}>استكشاف التصنيفات</button>
            <button type="button" className="pub-chip rounded-full px-3 py-2 text-sm" onClick={() => onNavigate("/latest")}>أحدث الفتاوى</button>
            <button type="button" className="pub-chip rounded-full px-3 py-2 text-sm" onClick={() => onNavigate("/report")}>طلب مراجعة</button>
          </div>
        </Empty>
      )}
      {closest.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">الأقرب لسؤالك</h2>
          <p className="pub-muted text-sm">{filtered.length} نتيجة من الفتاوى المعتمدة</p>
          {closest.map((hit) => <FatwaCard key={hit.fatwa.id} fatwa={hit.fatwa} saved={saved.includes(hit.fatwa.id)} onOpen={onOpen} onSave={onSave} note={hit.reason} />)}
        </section>
      )}
      {rest.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">فتاوى أخرى ذات صلة</h2>
          {rest.map((hit) => <FatwaCard key={hit.fatwa.id} fatwa={hit.fatwa} saved={saved.includes(hit.fatwa.id)} onOpen={onOpen} onSave={onSave} note={hit.reason} />)}
        </section>
      )}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setFiltersOpen(false)}>
          <div className="pub-bg-2 absolute inset-x-0 bottom-0 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><strong>تصفية النتائج</strong><button type="button" onClick={() => setFiltersOpen(false)}>إغلاق</button></div>
            <label className="pub-surface mb-3 flex items-center justify-between rounded-xl px-3 py-3"><span>بتسجيل صوتي فقط</span><input type="checkbox" checked={audioOnly} onChange={(event) => setAudioOnly(event.target.checked)} /></label>
            <label className="pub-surface mb-3 flex items-center justify-between rounded-xl px-3 py-3"><span>المحفوظة فقط</span><input type="checkbox" checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} /></label>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
              <button type="button" onClick={() => setCategory("")} className={`rounded-full px-3 py-2 text-sm ${category === "" ? "pub-solid" : "pub-chip"}`}>كل التصنيفات</button>
              {categories.map((item) => (
                <button key={item.name} type="button" onClick={() => setCategory(item.name)} className={`rounded-full px-3 py-2 text-sm ${category === item.name ? "pub-solid" : "pub-chip"}`}>{item.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FatwaPage({
  fatwa,
  related,
  saved,
  prefs,
  onOpen,
  onSave,
  onNavigate,
  onNotice,
}: {
  fatwa: Fatwa | null;
  related: Fatwa[];
  saved: string[];
  prefs: ReadingPrefs;
  onOpen: (fatwa: Fatwa) => void;
  onSave: (id: string) => void;
  onNavigate: (path: string) => void;
  onNotice: (message: string) => void;
}) {
  if (!fatwa) {
    return <Empty text="الفتوى غير متاحة. قد يكون الرابط غير صحيح أو أن الفتوى لم تُعتمد بعد." />;
  }
  const question = publicQuestion(fatwa);
  const answer = publicAnswer(fatwa);
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice(label);
    } catch {
      onNotice("تعذّر النسخ");
    }
  };
  const share = async () => {
    const url = window.location.href;
    const text = `فتوى رقم ${fatwa.fatwaNumber}\nالسؤال: ${snippet(question, 180)}\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `فتوى رقم ${fatwa.fatwaNumber}`, text, url }); return; } catch { /* cancelled */ }
    }
    await copy(text, "تم نسخ رابط الفتوى");
  };
  return (
    <article className={`mx-auto space-y-5 ${prefs.width === "narrow" ? "max-w-2xl" : "max-w-3xl"}`} style={{ fontSize: `${prefs.fontScale}rem`, lineHeight: prefs.lineHeight }}>
      <p className="pub-muted text-sm">الفتاوى / {fatwa.category || "عام"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pub-solid rounded-full px-3 py-1 text-xs">فتوى رقم {fatwa.fatwaNumber}</span>
        {fatwa.category && <span className="pub-chip rounded-full px-3 py-1 text-xs">{fatwa.category}</span>}
        <span className="pub-wash rounded-full px-3 py-1 text-xs">{fatwa.status === "منشورة" ? "فتوى منشورة" : "موثقة في الأرشيف"}</span>
      </div>
      <section className="pub-question rounded-3xl p-4 sm:p-7">
        <h1 className="font-cairo text-sm font-bold">السؤال</h1>
        <p
          className="mt-3 font-amiri transition-all duration-150"
          style={{
            fontSize: `${1.35 * prefs.fontScale}rem`,
            lineHeight: prefs.lineHeight,
          }}
        >
          {question}
        </p>
      </section>
      <section className="pub-answer rounded-3xl p-4 sm:p-7">
        <h2 className="font-cairo text-sm font-bold">الجواب</h2>
        <p
          className="mt-3 whitespace-pre-wrap font-amiri transition-all duration-150"
          style={{
            fontSize: `${1.35 * prefs.fontScale}rem`,
            lineHeight: prefs.lineHeight,
          }}
        >
          {answer || "نص الجواب غير متوفر في النسخة العامة."}
        </p>
        {fatwa.has_wallahu_aalam && (
          <p
            className="pub-brand mt-8 text-center font-amiri font-bold transition-all duration-150"
            style={{ fontSize: `${1.25 * prefs.fontScale}rem` }}
          >
            والله تعالى أعلم
          </p>
        )}
      </section>
      <AudioBlock fatwa={fatwa} onReport={() => onNavigate(`/report?fatwa=${encodeURIComponent(fatwa.id)}`)} />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button type="button" className="pub-solid min-h-11 rounded-xl px-3 text-sm" onClick={() => onSave(fatwa.id)}>{saved.includes(fatwa.id) ? "محفوظة" : "حفظ"}</button>
        <button type="button" className="pub-chip min-h-11 rounded-xl px-3 text-sm" onClick={share}><Share2 className="inline h-4 w-4" /> مشاركة</button>
        <button type="button" className="pub-chip min-h-11 rounded-xl px-3 text-sm" onClick={() => copy(answer, "تم نسخ الجواب")}>نسخ الجواب</button>
        <button type="button" className="pub-chip min-h-11 rounded-xl px-3 text-sm" onClick={() => copy(`السؤال: ${question}\n\nالجواب: ${answer}`, "تم نسخ السؤال والجواب")}>نسخ السؤال والجواب</button>
      </div>
      <p className="pub-muted text-xs">رقم الفتوى {fatwa.fatwaNumber}{fatwa.created_at ? ` · أُضيفت ${fatwa.created_at.slice(0, 10)}` : ""}{fatwa.audio_file?.name ? " · التسجيل الصوتي متوفر" : ""}</p>
      <button type="button" className="pub-gold text-sm" onClick={() => onNavigate(`/report?fatwa=${encodeURIComponent(fatwa.id)}`)}>هل وجدت خللاً؟ الإبلاغ عن خلل</button>
      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">فتاوى ذات صلة</h2>
          {related.map((item) => <FatwaCard key={item.id} fatwa={item} saved={saved.includes(item.id)} onOpen={onOpen} onSave={onSave} />)}
        </section>
      )}
    </article>
  );
}

function AudioBlock({ fatwa, onReport }: { fatwa: Fatwa; onReport: () => void }) {
  const src = fatwa.audio_file?.dataUrl;
  const [rate, setRate] = useState(1);
  if (!fatwa.audio_file?.name) return null;
  if (!src) {
    return (
      <div className="pub-card rounded-2xl p-4 text-sm">
        <p>التسجيل غير متاح حالياً في النسخة العامة.</p>
        <button type="button" className="pub-gold mt-2" onClick={onReport}>الإبلاغ عن المشكلة</button>
      </div>
    );
  }
  return (
    <div className="pub-card rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 font-bold"><Volume2 className="h-4 w-4" /> الاستماع إلى التسجيل</div>
      <audio controls preload="none" src={src} className="w-full" onPlay={(event) => { event.currentTarget.playbackRate = rate; }} />
      <div className="mt-2 flex flex-wrap gap-2">
        {[0.75, 1, 1.25, 1.5, 2].map((value) => (
          <button key={value} type="button" onClick={(event) => { setRate(value); const audio = event.currentTarget.parentElement?.parentElement?.querySelector("audio"); if (audio) audio.playbackRate = value; }} className={`min-h-11 rounded-full px-3 text-sm ${rate === value ? "pub-solid" : "pub-chip"}`}>{value}x</button>
        ))}
      </div>
    </div>
  );
}

function FatwaCard({
  fatwa,
  saved,
  onOpen,
  onSave,
  note,
}: {
  fatwa: Fatwa;
  saved: boolean;
  onOpen: (fatwa: Fatwa) => void;
  onSave: (id: string) => void;
  note?: string;
  key?: React.Key;
}) {
  const [flipped, setFlipped] = useState(false);
  const question = publicQuestion(fatwa);
  return (
    <article className="pub-card rounded-3xl p-4">
      <button type="button" className="w-full text-right" onClick={() => setFlipped((value) => !value)}>
        <div className="pub-muted mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="pub-gold">فتوى {fatwa.fatwaNumber}</span>
          {fatwa.category && <span>{fatwa.category}</span>}
          {fatwa.created_at && <span>{fatwa.created_at.slice(0, 10)}</span>}
          {fatwa.audio_file?.name && <Volume2 className="h-3.5 w-3.5" />}
          {note && <span className="pub-wash rounded-full px-2 py-0.5">{note}</span>}
        </div>
        <h3 className="font-cairo text-base font-bold leading-8">{snippet(question, 140)}</h3>
        <p className="pub-muted mt-2 text-sm leading-7">{snippet(publicAnswer(fatwa), flipped ? 280 : 90)}</p>
      </button>
      <div className="mt-4 flex gap-2">
        <button type="button" className="pub-solid min-h-11 flex-1 rounded-xl text-sm" onClick={() => onOpen(fatwa)}>عرض الفتوى</button>
        <button type="button" className="pub-chip min-h-11 rounded-xl px-3 text-sm" onClick={() => onSave(fatwa.id)} aria-label={saved ? "إزالة من المحفوظة" : "حفظ"}>{saved ? "محفوظة" : "حفظ"}</button>
      </div>
    </article>
  );
}

function CategoriesPage({ published, onNavigate }: { published: Fatwa[]; onNavigate: (path: string) => void }) {
  const categories = categoryCounts(published);
  const tags = topTags(published, 16);
  return (
    <div className="space-y-6">
      <h1 className="font-cairo text-2xl font-bold pub-brand">التصنيفات</h1>
      {categories.length === 0 ? <Empty text="لا توجد تصنيفات في الفتاوى المعتمدة." /> : (
        <div className="grid grid-cols-2 gap-3">
          {categories.map((category) => (
            <button key={category.name} type="button" onClick={() => onNavigate(`/category/${encodeURIComponent(category.name)}`)} className="pub-card min-h-32 rounded-2xl p-4 text-right">
              <span className="block font-cairo font-bold">{category.name}</span>
              <span className="pub-gold mt-1 block text-xs">{category.count} فتوى</span>
              <span className="pub-muted mt-2 block text-xs leading-5">{snippet(category.sample, 70)}</span>
            </button>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">الموضوعات</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => <button key={tag.name} type="button" onClick={() => onNavigate(`/topics/${encodeURIComponent(tag.name)}`)} className="pub-chip rounded-full px-3 py-2 text-sm">{tag.name}</button>)}
          </div>
        </section>
      )}
    </div>
  );
}

function ListPage({
  title,
  fatwas,
  saved,
  onOpen,
  onSave,
  empty = "لا توجد فتاوى في هذا القسم.",
}: {
  title: string;
  fatwas: Fatwa[];
  saved: string[];
  onOpen: (fatwa: Fatwa) => void;
  onSave: (id: string) => void;
  empty?: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="font-cairo text-2xl font-bold pub-brand">{title}</h1>
      <p className="pub-muted text-sm">{fatwas.length} فتوى</p>
      {fatwas.length === 0 ? <Empty text={empty} /> : fatwas.map((fatwa) => <FatwaCard key={fatwa.id} fatwa={fatwa} saved={saved.includes(fatwa.id)} onOpen={onOpen} onSave={onSave} />)}
    </div>
  );
}

function AboutPage() {
  return (
    <article className="pub-card space-y-4 rounded-3xl p-5">
      <h1 className="font-cairo text-2xl font-bold pub-brand">عن المنصة</h1>
      <p className="leading-8">هذه منصة لقراءة فتاوى فضيلة الشيخ الدكتور عبد الباري خلة بعد اعتمادها في الأرشيف. البحث يعثر على الفتوى الأقرب، ولا يصدر حكماً جديداً.</p>
      <p className="leading-8">ما يراه القارئ هو السؤال والجواب المعتمدان. مسودات التفريغ وملاحظات التحرير تبقى داخل غرفة التحرير.</p>
    </article>
  );
}

const REPORT_TYPES = ["خطأ إملائي", "كلمة غير واضحة", "السؤال غير صحيح", "الجواب يحتاج مراجعة", "رقم الفتوى غير صحيح", "التصنيف غير مناسب", "التسجيل لا يعمل", "رابط لا يعمل", "مشكلة أخرى"];

function ReportPage({ published, presetId, onDone }: { published: Fatwa[]; presetId: string; onDone: (message: string) => void }) {
  const fatwa = published.find((item) => item.id === presetId);
  const [type, setType] = useState(REPORT_TYPES[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      addReport({ fatwaId: fatwa?.id || presetId || "general", fatwaNumber: fatwa?.fatwaNumber || 0, type, message });
      setSent(true);
      onDone(navigator.onLine ? "تم حفظ البلاغ على هذا الجهاز." : "تم حفظ البلاغ وسيبقى على الجهاز حتى تتوفر مزامنة للبلاغات.");
    }}>
      <h1 className="font-cairo text-2xl font-bold pub-brand">الإبلاغ عن خلل</h1>
      <p className="pub-muted text-sm">البلاغ لا يعدّل الفتوى. يراجعه المحرر لاحقاً.</p>
      {fatwa && <p className="pub-wash rounded-2xl p-3 text-sm">فتوى رقم {fatwa.fatwaNumber}: {snippet(publicQuestion(fatwa), 90)}</p>}
      <label className="block text-sm font-bold">نوع الخلل
        <select value={type} onChange={(event) => setType(event.target.value)} className="pub-input mt-1 min-h-12 w-full rounded-xl px-3">
          {REPORT_TYPES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="block text-sm font-bold">التفاصيل
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="pub-input mt-1 w-full rounded-xl p-3" />
      </label>
      <button type="submit" className="pub-solid min-h-12 rounded-xl px-4" disabled={sent}>{sent ? "تم الحفظ" : "إرسال البلاغ"}</button>
    </form>
  );
}

function OfflinePage({ published, savedCount, online, onNavigate }: { published: Fatwa[]; savedCount: number; online: boolean; onNavigate: (path: string) => void }) {
  return (
    <div className="pub-card space-y-4 rounded-3xl p-5">
      <h1 className="font-cairo text-2xl font-bold">{online ? "الاتصال متاح" : "أنت بدون اتصال"}</h1>
      <p className="leading-8">{online ? "يمكن تحديث الأرشيف من الخادم. القراءة والحفظ يعملان محلياً أيضاً." : "يمكنك متابعة الفتاوى المحفوظة وما تم تحميله سابقاً على هذا الجهاز."}</p>
      <p className="pub-muted text-sm">{published.length} فتوى متاحة محلياً · {savedCount} محفوظة</p>
      <div className="flex gap-2">
        <button type="button" className="pub-solid min-h-11 rounded-xl px-4" onClick={() => onNavigate("/saved")}>المحفوظة</button>
        <button type="button" className="pub-chip min-h-11 rounded-xl px-4" onClick={() => window.location.reload()}>إعادة المحاولة</button>
      </div>
    </div>
  );
}

function SettingsPage({
  prefs,
  savedCount,
  recentCount,
  onChange,
  onClearSaved,
  onClearRecent,
  onClearSearches,
}: {
  prefs: ReadingPrefs;
  savedCount: number;
  recentCount: number;
  onChange: (prefs: ReadingPrefs) => void;
  onClearSaved: () => void;
  onClearRecent: () => void;
  onClearSearches: () => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="font-cairo text-2xl font-bold pub-brand">إعدادات القراءة</h1>
      <label className="pub-card block rounded-2xl p-4 space-y-3 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="font-cairo font-bold text-base flex items-center gap-2">
            <span>حجم الخط</span>
            <span className="text-xs pub-muted font-normal">
              {prefs.fontScale <= 0.85
                ? "(صغير)"
                : prefs.fontScale >= 1.45
                ? "(كبير جداً للمسنين)"
                : prefs.fontScale >= 1.2
                ? "(كبير)"
                : "(طبيعي)"}
            </span>
          </span>
          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full pub-solid">
            {Math.round(prefs.fontScale * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.65}
          step={0.05}
          value={prefs.fontScale}
          onChange={(event) => onChange({ ...prefs, fontScale: Number(event.target.value) })}
          className="w-full accent-emerald-700 cursor-pointer"
        />
        <div className="flex items-center justify-between gap-1 pt-1 text-xs">
          {[
            { label: "صغير", scale: 0.85 },
            { label: "طبيعي", scale: 1.0 },
            { label: "كبير", scale: 1.2 },
            { label: "كبير جداً", scale: 1.45 },
            { label: "جليّ", scale: 1.65 },
          ].map((preset) => (
            <button
              key={preset.scale}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange({ ...prefs, fontScale: preset.scale });
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                Math.abs(prefs.fontScale - preset.scale) < 0.03
                  ? "pub-solid ring-2 ring-emerald-500/40"
                  : "pub-chip hover:opacity-80"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </label>

      <label className="pub-card block rounded-2xl p-4 space-y-3 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="font-cairo font-bold text-base flex items-center gap-2">
            <span>تباعد الأسطر</span>
            <span className="text-xs pub-muted font-normal">
              {prefs.lineHeight <= 1.6
                ? "(متقارب)"
                : prefs.lineHeight >= 2.4
                ? "(واسع ومريح)"
                : "(متوازن)"}
            </span>
          </span>
          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full pub-solid">
            {prefs.lineHeight.toFixed(1)}x
          </span>
        </div>
        <input
          type="range"
          min={1.5}
          max={2.6}
          step={0.1}
          value={prefs.lineHeight}
          onChange={(event) => onChange({ ...prefs, lineHeight: Number(event.target.value) })}
          className="w-full accent-emerald-700 cursor-pointer"
        />
        <div className="flex items-center justify-between gap-1 pt-1 text-xs">
          {[
            { label: "مضغوط", height: 1.6 },
            { label: "طبيعي", height: 1.9 },
            { label: "متباعد", height: 2.2 },
            { label: "واسع", height: 2.6 },
          ].map((preset) => (
            <button
              key={preset.height}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange({ ...prefs, lineHeight: preset.height });
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                Math.abs(prefs.lineHeight - preset.height) < 0.06
                  ? "pub-solid ring-2 ring-emerald-500/40"
                  : "pub-chip hover:opacity-80"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </label>

      {/* معاينة حية وفورية لتأثير الخط والتباعد */}
      <div className="pub-surface rounded-2xl p-4 border pub-border space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between text-xs pub-muted font-bold">
          <span className="flex items-center gap-1.5 font-cairo">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>معاينة حية وفورية لنص الفتوى وفق إعداداتك:</span>
          </span>
          <span className="font-mono text-[11px]">{Math.round(prefs.fontScale * 100)}% · {prefs.lineHeight.toFixed(1)}x</span>
        </div>
        <div
          className="font-amiri transition-all duration-150 rounded-xl p-4 pub-bg-1 border pub-border shadow-xs"
          style={{
            fontSize: `${1.35 * prefs.fontScale}rem`,
            lineHeight: prefs.lineHeight,
          }}
        >
          <p className="font-bold mb-2">السؤال: ما حكم قراءة القرآن الكريم من الهاتف بغير وضوء؟</p>
          <p className="pub-muted">
            الجواب: الحمد لله والصلاة والسلام على رسول الله؛ تجوز قراءة القرآن من شاشة الهاتف من غير وضوء لأن الهاتف ليس مصحفاً ورقياً مخصوصاً، وإن كان الوضوء مستحباً على كل حال، والله تعالى أعلم.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["light", "dark", "system"] as const).map((theme) => (
          <button key={theme} type="button" onClick={() => onChange({ ...prefs, theme })} className={`min-h-11 rounded-xl ${prefs.theme === theme ? "pub-solid" : "pub-chip"}`}>{theme === "light" ? "فاتح" : theme === "dark" ? "داكن" : "النظام"}</button>
        ))}
      </div>
      <button type="button" className="pub-chip min-h-11 w-full rounded-xl" onClick={() => onChange({ ...prefs, width: prefs.width === "narrow" ? "normal" : "narrow" })}>عرض القراءة: {prefs.width === "narrow" ? "ضيق" : "معتدل"}</button>
      <section className="pub-card rounded-2xl p-4 text-sm">
        <h2 className="mb-2 font-bold">المحتوى المخزن على الجهاز</h2>
        <p>المحفوظة: {savedCount}</p>
        <p>آخر ما قرأت: {recentCount}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-full border px-3 py-2" onClick={onClearSaved}>مسح المحفوظة</button>
          <button type="button" className="rounded-full border px-3 py-2" onClick={onClearRecent}>مسح السجل</button>
          <button type="button" className="rounded-full border px-3 py-2" onClick={onClearSearches}>مسح بحوثي</button>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-cairo text-lg font-bold">{title}</h2>
      {action && onAction && <button type="button" onClick={onAction} className="text-sm pub-brand">{action}</button>}
    </div>
  );
}

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="pub-card rounded-3xl border-dashed px-4 py-8 text-center text-sm leading-7">{text}{children}</div>;
}

export function AdminReportsPanel() {
  const [reports, setReports] = useState<PublicReport[]>(() => loadReports());
  const [status, setStatus] = useState<"الكل" | PublicReport["status"]>("الكل");
  const visible = reports.filter((report) => status === "الكل" || report.status === status);
  return (
    <div className="space-y-4">
      <h1 className="font-cairo text-2xl font-bold">بلاغات القرّاء</h1>
      <p className="text-sm text-stone-500">البلاغات محفوظة على هذا الجهاز. لا تعدّل الفتوى تلقائياً.</p>
      <div className="flex flex-wrap gap-2">
        {(["الكل", "جديد", "قيد المراجعة", "تم الإصلاح", "مرفوض"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-full px-3 py-2 text-sm ${status === item ? "bg-[#0c392c] text-white" : "bg-white"}`}>{item}</button>
        ))}
      </div>
      {visible.length === 0 ? <Empty text="لا توجد بلاغات في هذا التصنيف." /> : visible.map((report) => (
        <article key={report.reportId} className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="font-bold">{report.type}</p>
          <p className="text-sm text-stone-500">فتوى {report.fatwaNumber || "—"} · {report.status} · {report.createdAt.slice(0, 16).replace("T", " ")}</p>
          {report.message && <p className="mt-2 text-sm leading-7">{report.message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(["قيد المراجعة", "تم الإصلاح", "مرفوض"] as const).map((next) => (
              <button key={next} type="button" className="rounded-full border px-3 py-1 text-xs" onClick={() => setReports(updateReportStatus(report.reportId, next))}>{next}</button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminSyncPanel({
  syncStatus,
  pendingWrites,
}: {
  syncStatus: string;
  pendingWrites: number;
}) {
  return (
    <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5">
      <h1 className="font-cairo text-2xl font-bold">مركز المزامنة</h1>
      <p>حالة الاتصال: {syncStatus === "synced" ? "تمت المزامنة" : syncStatus === "offline" ? "غير متصل" : syncStatus}</p>
      <p>عمليات بانتظار الرفع: {pendingWrites}</p>
      <p className="text-sm text-stone-500">النشر والتعديل يستخدمان نظام المزامنة الحالي. لا يُعرض نجاح نشر لم يكتمل رفعه.</p>
    </div>
  );
}
