/**
 * Utility functions for sanitizing and validating Fatwa Question Greetings and
 * strictly isolating Questions from Sheikh's Answers.
 * Prevents and corrects the issue where a question is erroneously formatted with "وعليكم السلام"
 * or where the transcriber blends the Sheikh's answer/rulings into the question.
 */

// Regex patterns for detecting Sheikh's answers or rulings erroneously placed inside the Question
const ANSWER_BLEED_PATTERNS = [
  // Phrases like: "والشيخ يذكر أن", "يذكر الشيخ أن", "أجاب الشيخ بأن", "يرى الشيخ أن", "الشيخ يقول:"
  /(?:و\s*)?(?:الشيخ\s+(?:يذكر|يقول|يرى|أجاب|أفتى|أوضح|بيّن|بيقول|بذكر)|(?:يذكر|يقول|يرى|أجاب|أفتى|أوضح|بيّن)\s+الشيخ)\s+(?:أن|بأن|إن|بإن|:)/i,
  // Phrases like: "قلنا جائز", "قلنا لا يجوز", "قلنا لا حرج"
  /(?:^|[\s\n.؟!؛])(?:قلنا\s+(?:جائز|يجوز|لا يجوز|حلال|حرام|مكروه|لا حرج|صحيح|باطل|نعم|لا|يصح|لا يصح))/i,
  // Phrases like: "نعم جائز بشرط", "نعم يجوز", "جائز بشرط ألا تتغنى"
  /(?:^|[\s\n.؟!؛])(?:نعم\s+(?:جائز|يجوز|صحيح|يصح|لا حرج)\s*(?:بشرط|إذا|إن|لو)?)/i,
  // Explicit answer headers: "الجواب:", "فالجواب أن", "جواب الشيخ:", "✍🏻 جواب الشيخ:"
  /(?:^|[\s\n.؟!؛])(?:فالجواب\s+أن|والجواب\s+أن|والجواب\s+على\s+ذلك|الجواب\s*[:：\/]|جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ\s*[:：]|✍🏻)/i,
  // Greeting response in middle of text (Sheikh responding to questioner)
  /(?:[؟?!\n.]\s*|\s{2,})(?:و\s*عليكم\s+السلام)/i,
  // Endings like "والله أعلم" at the end of the question
  /(?:والله\s+أعلم|والله\s+تعالى\s+أعلم)\s*[.!]?$/i,
];

/**
 * Checks if a question text contains obvious answer contamination or bleed.
 */
export function hasAnswerInQuestion(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 10) return false;

  return ANSWER_BLEED_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Checks if a question text contains the invalid greeting "وعليكم السلام"
 * (which is a response to a greeting and should only be in the Sheikh's answer).
 */
export function hasQuestionGreetingIssue(text: string | undefined | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  
  // Checks if question starts with or contains "وعليكم السلام" or "و عليكم السلام"
  const issueRegex = /(?:^|[\s\n\r.؟!؛*⁉️])(?:و\s*عليكم\s+السلام)/i;
  return issueRegex.test(trimmed);
}

/**
 * Sanitizes question text to ensure:
 * 1. It NEVER starts with "وعليكم السلام" (replaces with "السلام عليكم").
 * 2. If copied from a full WhatsApp message containing answer header, strips the answer.
 * 3. Removes noisy prefixes like *⁉️ السؤال:*
 */
export function sanitizeQuestionGreeting(text: string | undefined | null): string {
  if (!text || typeof text !== "string") return "";
  let q = text.trim();

  // If text contains WhatsApp formatted Answer header (e.g. *✍🏻 جواب فضيلة الشيخ:), extract question only
  const answerHeaderRegex = /\*?✍🏻?\s*(?:جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ|إجابة\s+الشيخ|رد\s+الشيخ|الجواب\s*[:：\/]|ج\s*[:：\/]|\*?الجواب\*?)/i;
  const matchHeader = q.match(answerHeaderRegex);
  if (matchHeader && typeof matchHeader.index === "number") {
    const qPart = q.substring(0, matchHeader.index).trim();
    if (qPart) {
      q = qPart;
    }
  }

  // Remove leading WhatsApp question prefixes like *⁉️ السؤال:* or *السؤال:*
  q = q.replace(/^[\s*⁉️\-_~#:•]*(?:السؤال\s*(?:الأول|الثاني|الثالث)?\s*[:：\/]?)?[\s*⁉️\-_~#:•]*/i, "");

  // Replace "وعليكم السلام" at start with "السلام عليكم"
  q = q.replace(/^(?:و\s*عليكم\s+السلام(?:\s+ورحمة\s+الله(?:\s+وبركاته)?)?)/i, "السلام عليكم ورحمة الله وبركاته");

  // Replace "وعليكم السلام" after punctuation or newlines
  q = q.replace(/(^|[\n\r.؟!؛])(\s*)(?:و\s*عليكم\s+السلام)/gi, "$1$2السلام عليكم");

  return q.trim();
}

/**
 * High-precision algorithm to clean question text that has the Sheikh's answer blended into it.
 * Retains inquiries, questions, polite openings and closings, and separates out the Sheikh's answers.
 */
export function cleanQuestionAnswerBleed(text: string | undefined | null): {
  cleanedQuestion: string;
  extractedAnswer: string;
  hadBleed: boolean;
} {
  if (!text || typeof text !== "string") {
    return { cleanedQuestion: "", extractedAnswer: "", hadBleed: false };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { cleanedQuestion: "", extractedAnswer: "", hadBleed: false };
  }

  // 1. Explicit answer header delimiter (الجواب:, جواب الشيخ:, ✍🏻, etc.)
  const answerHeaderRegex = /\*?✍🏻?\s*(?:جواب\s+فضيلة\s+الشيخ|جواب\s+الشيخ|إجابة\s+الشيخ|رد\s+الشيخ|الجواب\s*[:：\/]|ج\s*[:：\/]|\*?الجواب\*?)/i;
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

  // 2. Answer starting with "وعليكم السلام" in the body of the message
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

  // 3. Interleaved bleed (e.g. AI summarized/quoted the Sheikh inside the question)
  const hasInterleaved = ANSWER_BLEED_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasInterleaved) {
    return {
      cleanedQuestion: sanitizeQuestionGreeting(trimmed),
      extractedAnswer: "",
      hadBleed: false,
    };
  }

  // Split into sentences / units preserving punctuation
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

  const isDefiniteAnswer = (str: string) => {
    return ANSWER_BLEED_PATTERNS.some((p) => p.test(str));
  };

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

  // If no questions were recognized, fallback to original
  if (questionUnits.length === 0) {
    return {
      cleanedQuestion: sanitizeQuestionGreeting(trimmed),
      extractedAnswer: "",
      hadBleed: false,
    };
  }

  const cleanedQuestion = sanitizeQuestionGreeting(questionUnits.join("\n").trim());
  const extractedAnswer = answerUnits.join("\n").trim();

  return {
    cleanedQuestion,
    extractedAnswer,
    hadBleed: answerUnits.length > 0,
  };
}

/**
 * Intelligent parser for WhatsApp Fatwa posts and pasted texts:
 * When users paste text containing both question and answer:
 * It extracts the question and answer into separate fields cleanly.
 */
export function extractWhatsAppQAndA(rawText: string): {
  isWhatsAppPost: boolean;
  question: string;
  answer: string;
} {
  if (!rawText || typeof rawText !== "string") {
    return { isWhatsAppPost: false, question: rawText || "", answer: "" };
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

/**
 * High-level separator that decomposes any text into pure question and pure answer.
 */
export function separateQuestionAndAnswer(rawText: string): {
  question: string;
  answer: string;
  wasSeparated: boolean;
} {
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

