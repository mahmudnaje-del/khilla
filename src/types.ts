export type FatwaStatus = 'مسودة' | 'تحتاج مراجعة' | 'مراجعة' | 'معتمدة' | 'منشورة';

export interface CardTemplateSettings {
  templateStyle?: 'official_khalla' | 'classic' | 'uthmanic';
  aspectRatio: '1:1' | '4:5' | '9:16' | 'auto';
  theme: 'emerald' | 'warm-sand' | 'navy' | 'monochrome' | 'olive' | 'gold-official';
  fontSize: 'sm' | 'md' | 'lg' | 'auto';
  showSheikhTitle: boolean;
  showFatwaNumber: boolean;
  showDate: boolean;
  showWallahuAalam: boolean;
  watermark: string;
}

export interface Fatwa {
  id: string;
  fatwaNumber: number;
  question_original: string;
  question_clean: string;
  question_tashkeel?: string;
  audio_file?: {
    name: string;
    size: number;
    duration?: number;
    dataUrl?: string;
    mimeType?: string;
    isVideo?: boolean;
  } | null;
  transcription_raw: string;
  answer_clean: string;
  answer_tashkeel?: string;
  fatwaType?: 'normal' | 'moasala';
  mediaType?: 'audio' | 'video' | 'text';
  evidence_citations?: string[];
  unclear_segments: string[];
  editing_notes: string[];
  created_at: string;
  updated_at: string;
  status: FatwaStatus;
  reviewed: boolean;
  approved: boolean;
  approved_by?: string;
  approved_at?: string;
  has_wallahu_aalam: boolean;
  category?: string;
  tags?: string[];
  template_settings: CardTemplateSettings;
  image_url?: string;
  transcription_engine?: 'gemini' | 'whisper_offline';
  transcribed_offline?: boolean;
  model_used?: string;
  version?: number;
  deleted?: boolean;
  deleted_at?: string;
  pendingSync?: boolean;
}

export type SyncStatus = 'initializing' | 'connecting' | 'synced' | 'offline' | 'error' | 'permission-denied' | 'quota-exceeded';

export type FirestoreFetchResult =
  | { success: true; fatwas: Fatwa[]; deletedIds: string[] }
  | { success: false; status: 'timeout' | 'offline' | 'quota-exceeded' | 'permission-denied' | 'error'; error: string };

export interface PendingSyncItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  fatwa: Fatwa;
  expectedVersion?: number;
  createdAt: string;
  timestamp: string;
  retries: number;
}

export interface TranscribeResponse {
  question_clean: string;
  question_tashkeel?: string;
  transcription_raw: string;
  answer_clean: string;
  answer_tashkeel?: string;
  fatwa_type?: 'normal' | 'moasala';
  evidence_citations?: string[];
  unclear_segments: string[];
  editing_notes: string[];
  detected_wallahu_aalam: boolean;
  status: FatwaStatus;
  transcription_engine?: 'gemini' | 'whisper_offline';
  transcribed_offline?: boolean;
  model_used?: string;
}
