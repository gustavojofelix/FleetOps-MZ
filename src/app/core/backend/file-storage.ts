import { Injectable } from '@angular/core';

/** What a stored file belongs to; also the folder in the bucket. */
export type FileKind = 'documents' | 'fuel' | 'expenses';

/**
 * Files attached to records (document scans, fuel and expense receipts). Records keep only the
 * file name; the content lives in the backend's storage. The demo build stores nothing.
 */
export abstract class FileStorage {
  /** False in the demo build: files are not stored and cannot be opened. */
  abstract readonly enabled: boolean;

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

@Injectable()
export class DemoFileStorage extends FileStorage {
  readonly enabled = false;

  sync(): Promise<void> {
    return Promise.resolve();
  }

  openUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }

  removeAll(): Promise<void> {
    return Promise.resolve();
  }
}
