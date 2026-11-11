/** What a stored file belongs to; also the folder in the bucket. */
export type FileKind = 'documents' | 'fuel' | 'expenses' | 'company';

/**
 * Files attached to records (document scans, fuel and expense receipts). Records keep only the
 * file name; the content lives in the backend's storage (SupabaseFileStorage).
 */
export abstract class FileStorage {
  /**
   * Brings the record's stored file in line with the form: uploads `file` (replacing any previous
   * one), or removes the stored file when `cleared` is true and no new file was chosen.
   */
  abstract sync(kind: FileKind, recordId: string, file: File | null, cleared: boolean): Promise<void>;

  /** Short-lived URL to open the record's file, or null when there is none. */
  abstract openUrl(kind: FileKind, recordId: string): Promise<string | null>;

  /** Removes every file of the record (when the record is deleted). */
  abstract removeAll(kind: FileKind, recordId: string): Promise<void>;
}

