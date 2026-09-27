/**
 * 📜 مساعدة ضبط وتشكيل وتنسيق النصوص العربية وفتاوى الشيخ د. عبد الباري خلة
 * إزالة العلامات القرآنية الغريبة والتشكيلات المتراكبة والحفاظ على الحركات العربية القياسية الأنيقة
 */

/**
 * تنظيف النص المشكول من الرموز القرآنية والتشكيلات الغريبة غير المعتادة
 * التي تُفسد القراءة على الهواتف والبطاقات (مثل علامات الوقف، الصفر المستدير، الحركات المتراكبة)
 */
export function cleanTashkeelText(text: string): string {
  if (!text) return "";

  return text
    // 1. إزالة علامات الوقف والضبط القرآني الخاص (U+06D6 إلى U+06ED)
    .replace(/[\u06D6-\u06ED]/g, "")
    // 2. إزالة الحروف العلوية الصغيرة الزائدة (U+0615 إلى U+061A)
    .replace(/[\u0615-\u061A]/g, "")
    // 3. إزالة رموز غير مرئية أو فراغات ضيقة مشوهة
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, " ")
    // 4. استبدال الألف الخنجرية العلوية المنفصلة بألف طبيعية عند الحاجة أو إزالتها إن كانت ملتصقة بدون سبب
    .replace(/الرَّحْمَٰنِ/g, "الرَّحْمَنِ")
    .replace(/الرَّحْمٰن/g, "الرَّحْمَن")
    .replace(/[\u0670]/g, "") // إزالة أي ألف خنجرية عثمانية تسبب ظهور أعمدة شاذة
    // 5. دمج الحركات المكررة على الحرف الواحد (مثل فتحتين متتاليتين أو سكونين)
    .replace(/([\u064B-\u0652])\1+/g, "$1")
    // 6. تنظيم الفراغات بين علامات الترقيم والأقواس
    .replace(/[\t ]+/g, " ")
    .replace(/\s+([،.؛:؟!])/g, "$1")
    .replace(/﴿\s+/g, "﴿")
    .replace(/\s+﴾/g, "﴾")
    .trim();
}

/**
 * إزالة كامل الحركات من النص العربي (للحصول على نص ناصع بدون تشكيل)
 */
export function stripAllTashkeel(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .trim();
}

/**
 * تجهيز نص الفتوى المشكول بالكامل للتصدير والنسخ والنشر المباشر عبر واتساب وتليجرام
 */
export function formatVocalizedFatwaForCopy({
  question,
  answer,
  fatwaNumber,
  hasWallahuAalam = true,
}: {
  question: string;
  answer: string;
  fatwaNumber?: number;
  hasWallahuAalam?: boolean;
}): string {
  const cleanQ = cleanTashkeelText(question);
  const cleanA = cleanTashkeelText(answer);

  const lines: string[] = [];
  lines.push("بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ");
  lines.push("فَتَاوَى فَضِيلَةِ الشَّيْخِ د. عَبْدِ البَارِي خَلَّة");
  if (fatwaNumber) {
    lines.push(`فتوى رقم: #${fatwaNumber}`);
  }
  lines.push("ـــــــــــــــــــــــــــــــــــــــــ");
  lines.push("");
  lines.push("📌 *السُّؤَالُ:*");
  lines.push(cleanQ);
  lines.push("");
  lines.push("📖 *الجَوَابُ:*");
  lines.push(cleanA);
  lines.push("");
  if (hasWallahuAalam) {
    lines.push("وَاللَّهُ تَعَالَى أَعْلَمُ.");
  }
  lines.push("");
  lines.push("ـــــــــــــــــــــــــــــــــــــــــ");
  lines.push("الصفحة الرسمية لفتاوى فضيلة الشيخ د. عبد الباري خلة");

  return lines.join("\n");
}
