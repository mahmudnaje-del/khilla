import React from "react";
import { ShieldAlert } from "lucide-react";

export const NoticeBanner: React.FC = () => {
  return (
    <div className="bg-amber-50/90 border-r-4 border-amber-500 p-4 rounded-xl shadow-xs mb-6 text-stone-800 flex items-start gap-3">
      <div className="p-2 bg-amber-100 rounded-lg shrink-0 text-amber-800">
        <ShieldAlert className="w-5 h-5" />
      </div>
      <div className="text-xs sm:text-sm leading-relaxed">
        <div className="font-bold text-amber-950 font-cairo mb-0.5">
          تنبيه شرعي ومسؤولية الأمانة العلمية:
        </div>
        <p className="text-stone-700">
          هذا النظام مخصص <strong className="text-stone-900">لتفريغ وتنظيم كلام فضيلة الشيخ د. عبد الباري خلة</strong>، وليس لإصدار الفتاوى أو تعديل الأحكام الشرعية أو استنتاجها. يلتزم الذكاء الاصطناعي بقاعدة <span className="font-semibold text-amber-900">التعديل الأدنى (Minimal Editing)</span> ونقل ما في التسجيل بأمانة تامة دون زيادة أو اختراع. يجب مراجعة النص واعتماده قبل النشر.
        </p>
      </div>
    </div>
  );
};
