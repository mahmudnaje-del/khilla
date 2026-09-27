import { Fatwa } from "../types";
import mammoth from "mammoth";

export interface ParsedWordFatwa {
  id?: string;
  question_original: string;
  question_clean: string;
  transcription_raw?: string;
  answer_clean: string;
  category: string;
  tags: string[];
  has_wallahu_aalam: boolean;
  notes?: string;
}

export interface WordParseResult {
  success: boolean;
  total: number;
  source?: string;
  extractedTextLength?: number;
  fatwas: ParsedWordFatwa[];
  error?: string;
}

/**
 * Convert a File object to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Extract text from File directly in browser if possible
 */
export async function extractTextFromFile(file: File): Promise<string | null> {
  try {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".txt")) {
      return await file.text();
    }
    if (fileName.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value?.trim() || null;
    }
  } catch (err) {
    console.warn("Client-side text extraction failed, falling back to server base64:", err);
  }
  return null;
}

/**
 * Send Word (.docx) file to the server endpoint for full AI parsing
 */
export async function parseWordDocFile(file: File): Promise<WordParseResult> {
  try {
    // 1. Try quick client-side extraction of text first (reduces payload by 95% and avoids timeouts)
    const clientExtractedText = await extractTextFromFile(file);

    let requestBody: any;
    if (clientExtractedText && clientExtractedText.length > 0) {
      requestBody = { raw_text: clientExtractedText };
    } else {
      const base64 = await fileToBase64(file);
      requestBody = { file_base64: base64 };
    }

    const response = await fetch("/api/parse-word-doc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Non-JSON response from server:", responseText.slice(0, 300));
      if (response.status === 413) {
        throw new Error("حجم الملف كبير جداً. يرجى تجربة لصق النص مباشرة في تبويب 'لصق نص مباشر'.");
      }
      if (response.status === 504 || response.status === 502) {
        throw new Error("استغرقت معالجة الملف وقتاً طويلاً. يرجى تقسيم الملف أو لصق نصوصه مباشرة.");
      }
      throw new Error(`حدث خطأ من الخادم (رمز ${response.status}). يرجى التحقق من اتصال الشبكة أو لصق النص يدوياً.`);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "فشل استخراج الفتاوى من ملف Word");
    }

    return {
      success: true,
      total: data.total || data.fatwas?.length || 0,
      source: data.source,
      extractedTextLength: data.extractedTextLength,
      fatwas: data.fatwas || [],
    };
  } catch (err: any) {
    console.error("Error in parseWordDocFile:", err);
    return {
      success: false,
      total: 0,
      fatwas: [],
      error: err.message || "حدث خطأ أثناء معالجة ملف Word",
    };
  }
}

/**
 * Send raw text (pasted from Word) to the server endpoint for structuring
 */
export async function parseWordRawText(rawText: string): Promise<WordParseResult> {
  try {
    const response = await fetch("/api/parse-word-doc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw_text: rawText,
      }),
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Non-JSON response from server:", responseText.slice(0, 300));
      if (response.status === 504 || response.status === 502) {
        throw new Error("استغرقت معالجة النص وقتاً طويلاً. يرجى تجربة لصق النص على دفعات أصغر.");
      }
      throw new Error(`حدث خطأ من الخادم (رمز ${response.status}). يرجى التأكد من اتصال الإنترنت.`);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "فشل تحليل نصوص الفتاوى");
    }

    return {
      success: true,
      total: data.total || data.fatwas?.length || 0,
      source: data.source,
      extractedTextLength: data.extractedTextLength,
      fatwas: data.fatwas || [],
    };
  } catch (err: any) {
    console.error("Error in parseWordRawText:", err);
    return {
      success: false,
      total: 0,
      fatwas: [],
      error: err.message || "حدث خطأ أثناء معالجة النص",
    };
  }
}

