/**
 * Utility functions for sanitizing Fatwa questions.
 * WhatsApp voice-share boilerplate ("مقطع صوتي من …") is not the question.
 * The person's name after «من» is kept for the question field.
 */

function cleanSenderName(raw: string): string {
  let name = raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  name = name.replace(/^[:：\-–—\s]+/, "").replace(/[\s،,!！?؟]+$/, "").trim();
  if (!name || name.length > 80) return "";
  if (/\.(?:opus|ogg|oga|amr|m4a|mp3|wav|mp4|webm)$/i.test(name)) return "";
  if (/^(?:whatsapp|واتساب|ptt|aud)[-_\s]/i.test(name)) return "";
  return name;
}

/** Name of the person WhatsApp attributes on a shared voice note: «مقطع صوتي من فلان». */
export function extractWhatsAppSenderName(text: string | undefined | null): string {
  if (!text || typeof text !== "string") return "";
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const patterns = [
    /^(?:مقطع\s+(?:صوتي|فيديو)|رسالة\s+صوتية|تسجيل\s+صوتي)\s+من\s*[:：]?\s*(.+)$/i,
    /^(?:Voice\s+(?:message|note)|Audio(?:\s+message)?|Video)\s+from\s*[:：]?\s*(.+)$/i,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match?.[1]) continue;
      const name = cleanSenderName(match[1]);
      if (name) return name;
    }
  }
  return "";
}

export function isWhatsAppShareCaption(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t || t.length > 220) return false;
  if (/^(?:مقطع\s+(?:صوتي|فيديو)|رسالة\s+صوتية|تسجيل\s+صوتي)\s+من(?:\s|$|[:：])/i.test(t)) return true;
  if (/^Voice\s+(?:message|note)\s+from(?:\s|$|[:：])/i.test(t)) return true;
  if (/^Audio(?:\s+message)?\s+from(?:\s|$|[:：])/i.test(t)) return true;
  if (/^Video\s+from(?:\s|$|[:：])/i.test(t)) return true;
  if (/^PTT[-_\s]/i.test(t) || /^AUD[-_\s]/i.test(t)) return true;
  if (/\.(?:opus|ogg|oga|amr|m4a|mp3|wav)$/i.test(t) && t.length < 80) return true;
  return false;
}

/**
 * Opus/voice shares: boilerplate stays out, the sharer's name becomes the question
 * when no real question text was sent with the file.
 */
export function questionFromSharedCaption(raw: string | undefined | null): {
  senderName: string;
  question: string;
  voiceCaptionOnly: boolean;
} {
  const text = (raw || "").replace(/\u0000/g, "").trim();
  if (!text) return { senderName: "", question: "", voiceCaptionOnly: false };

  const senderName = extractWhatsAppSenderName(text);
  const remainder = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isWhatsAppShareCaption(line))
    .join("\n")
    .trim();

  if (!remainder) {
    return { senderName, question: senderName, voiceCaptionOnly: Boolean(senderName) };
  }
  return { senderName, question: remainder, voiceCaptionOnly: false };
}

const ANSWER_BLEED_PATTERNS = [
  /(?:و\s*)?(?:الشيخ\s+(?:يذكر|يقول|يرى|أجاب|أفتى|أوضح|بيّن|بيقول|بذكر)|(?:يذكر|يقول|يرى|أجاب|أفتى|أوضح|بيّن)\s+الشيخ)\s+(?:أن|بأن|إن|بإن|:)/i,
  /(?:^|[\s\n.؟!؛])(?:قلنا\s+(?:جائز|يجوز|لا يجوز|حلال|حرام|مكروه|لا حرج|صحيح|باطل|نعم|لا|يصح|لا يصح))/i,
  /(?:^|[\s\n.؟!؛])(?:نعم\s+(?:جائز|يجوز|صحيح|يصح|لا حرج)\s*(?:بشرط|إذا|إن|لو)?)/i,
  /(?:^|[\s\n.؟!؛])(?:فالجواب\s+أن|والجواب\s+أن|والجواب\s+على\s+ذلك|الجواب\s*[:：\/]|جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ\s*[:：]|✍️)/i,
  /(?:[؟?!\n.]\s*|\s{2,})(?:و\s*عليكم\s+السلام)/i,
  /(?:والله\s+أعلم|والله\s+تعالى\s+أعلم)\s*[.!]?$/i,
];

export function hasAnswerInQuestion(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 10) return false;
  if (isWhatsAppShareCaption(trimmed)) return false;
  return ANSWER_BLEED_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function hasQuestionGreetingIssue(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  const issueRegex = /(?:^|[\s\n\r.؟!؛*‼️])(?:و\s*عليكم\s+السلام)/i;
  return issueRegex.test(trimmed);
}

export function sanitizeQuestionGreeting(text: string | undefined | null): string {
  if (!text || typeof text !== "string") return "";
  let q = text.trim();
  if (!q) return "";
  if (isWhatsAppShareCaption(q)) return "";

  const answerHeaderRegex = /\*?✍️?\s*(?:جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ|إجابة\s+الشيخ|رد\s+الشيخ|الجواب\s*[:：\/]|ج\s*[:：\/]|\*?الجواب\*?)/i;
  const matchHeader = q.match(answerHeaderRegex);
  if (matchHeader && typeof matchHeader.index === "number") {
    const qPart = q.substring(0, matchHeader.index).trim();
    if (qPart) q = qPart;
  }

  q = q.replace(/^[\s*‼️\-_~#:•]*(?:السؤال\s*(?:الأول|الثاني|الثالث)?\s*[:：\/]?)?[\s*‼️\-_~#:•]*/i, "");
  q = q.replace(/^(?:و\s*عليكم\s+السلام(?:\s+ورحمة\s+الله(?:\s+وبركاته)?)?)/i, "السلام عليكم ورحمة الله وبركاته");
  q = q.replace(/(^|[\n\r.؟!؛])(\s*)(?:و\s*عليكم\s+السلام)/gi, "$1$2السلام عليكم");

  if (isWhatsAppShareCaption(q)) return "";
  return q.trim();
}

export function cleanQuestionAnswerBleed(text: string | undefined | null): {
  cleanedQuestion: string;
  extractedAnswer: string;
  hadBleed: boolean;
} {
  if (!text || typeof text !== "string") {
    return { cleanedQuestion: "", extractedAnswer: "", hadBleed: false };
  }
  const trimmed = text.trim();
  if (!trimmed || isWhatsAppShareCaption(trimmed)) {
    return { cleanedQuestion: "", extractedAnswer: "", hadBleed: false };
  }

  const answerHeaderRegex = /\*?✍️?\s*(?:جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ|إجابة\s+الشيخ|رد\s+الشيخ|الجواب\s*[:：\/]|ج\s*[:：\/]|\*?الجواب\*?)/i;
  const headerMatch = trimmed.match(answerHeaderRegex);
  if (headerMatch && typeof headerMatch.index === "number" && headerMatch.index > 5) {
    const qPart = trimmed.substring(0, headerMatch.index).trim();
    const afterHeader = trimmed.substring(headerMatch.index + headerMatch[0].length);
    const aPart = afterHeader.replace(/^[:：*\s\-_~•]+/, "").trim();
    if (qPart) {
      return {
        cleanedQuestion: sanitizeQuestionGreeting(qPart),
        extractedAnswer: aPart,
        hadBleed: true,
      };
    }
  }

  const waAlaykumRegex = /(?:[؟?!\n.]\s*|\s{2,})(?:و\s*عليكم\s+السلام(?:\s+ورحمة\s+الله(?:\s+وبركاته)?)?)/i;
  const waMatch = trimmed.match(waAlaykumRegex);
  if (waMatch && typeof waMatch.index === "number" && waMatch.index > 8) {
    const qPart = trimmed.substring(0, waMatch.index + 1).trim();
    const aPart = trimmed.substring(waMatch.index + 1).trim();
    if (qPart) {
      return {
        cleanedQuestion: sanitizeQuestionGreeting(qPart),
        extractedAnswer: aPart,
        hadBleed: true,
      };
    }
  }

  const hasInterleaved = ANSWER_BLEED_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasInterleaved) {
    return {
      cleanedQuestion: sanitizeQuestionGreeting(trimmed),
      extractedAnswer: "",
      hadBleed: false,
    };
  }

  const tokens = trimmed.split(/([؟?!\n]|\.(?:\s+|$))/).filter(Boolean);
  const units: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const content = tokens[i] || "";
    const punc = tokens[i + 1] || "";
    const full = (content + punc).trim();
    if (full) units.push(full);
  }

  const questionUnits: string[] = [];
  const answerUnits: string[] = [];
  const isQuestionSentence = (str: string) => {
    const s = str.trim();
    if (s.endsWith("؟") || s.endsWith("?")) return true;
    if (/^(?:السلام\s+عليكم|حياكم\s+الله|بارك\s+الله\s+فيكم|جزاكم\s+الله|سؤال|السؤال|أولاً\s+السؤال)/i.test(s)) return true;
    if (/(?:^|[\s(])(?:هل|ما\s+حكم|كيف|أين|متى|ما\s+صحة|أولاً\s+السؤال|السؤال\s+الأول|السؤال\s+الثاني|السؤال\s+الثالث)/i.test(s)) return true;
    if (/^(?:وبارك\s+الله\s+فيكم|وجزاكم\s+الله\s+خيرا|ودمتم\s+بخير|أفيدونا\s+مأجورين)[.؟!]?$/i.test(s)) return true;
    return false;
  };
  const isDefiniteAnswer = (str: string) => ANSWER_BLEED_PATTERNS.some((p) => p.test(str));

  let inAnswerBlock = false;
  for (const unit of units) {
    if (isDefiniteAnswer(unit)) {
      inAnswerBlock = true;
      answerUnits.push(unit);
    } else if (isQuestionSentence(unit)) {
      inAnswerBlock = false;
      questionUnits.push(unit);
    } else if (inAnswerBlock) {
      answerUnits.push(unit);
    } else {
      questionUnits.push(unit);
    }
  }

  if (questionUnits.length === 0) {
    return {
      cleanedQuestion: sanitizeQuestionGreeting(trimmed),
      extractedAnswer: "",
      hadBleed: false,
    };
  }

  return {
    cleanedQuestion: sanitizeQuestionGreeting(questionUnits.join("\n").trim()),
    extractedAnswer: answerUnits.join("\n").trim(),
    hadBleed: answerUnits.length > 0,
  };
}

export function extractWhatsAppQAndA(rawText: string): {
  isWhatsAppPost: boolean;
  question: string;
  answer: string;
} {
  if (!rawText || typeof rawText !== "string") {
    return { isWhatsAppPost: false, question: "", answer: "" };
  }
  if (isWhatsAppShareCaption(rawText)) {
    return { isWhatsAppPost: false, question: "", answer: "" };
  }

  const res = cleanQuestionAnswerBleed(rawText);
  if (res.hadBleed && res.extractedAnswer) {
    return {
      isWhatsAppPost: true,
      question: res.cleanedQuestion,
      answer: res.extractedAnswer,
    };
  }

  return {
    isWhatsAppPost: false,
    question: sanitizeQuestionGreeting(rawText),
    answer: "",
  };
}

export function separateQuestionAndAnswer(rawText: string): {
  question: string;
  answer: string;
  wasSeparated: boolean;
} {
  if (isWhatsAppShareCaption(rawText)) {
    return { question: "", answer: "", wasSeparated: false };
  }
  const extracted = extractWhatsAppQAndA(rawText);
  if (extracted.isWhatsAppPost) {
    return {
      question: extracted.question,
      answer: extracted.answer,
      wasSeparated: true,
    };
  }
  const bleed = cleanQuestionAnswerBleed(rawText);
  if (bleed.hadBleed && bleed.extractedAnswer) {
    return {
      question: bleed.cleanedQuestion,
      answer: bleed.extractedAnswer,
      wasSeparated: true,
    };
  }
  return {
    question: sanitizeQuestionGreeting(rawText),
    answer: "",
    wasSeparated: false,
  };
}