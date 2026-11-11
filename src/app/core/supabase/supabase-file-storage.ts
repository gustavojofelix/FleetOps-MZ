import { Injectable, inject } from '@angular/core';
import { FileKind, FileStorage } from '../backend/file-storage';
import { CurrentOrganization } from './current-organization.service';
import { SUPABASE, toError } from './supabase-client';

const BUCKET = 'files';
const SIGNED_URL_SECONDS = 10 * 60;

/**
 * Private bucket `files`, one folder per record: `{organization_id}/{kind}/{record_id}/{file}`.
 * Storage policies (migration 5) restrict reading to members and writing to the right roles.
 */
@Injectable()
export class SupabaseFileStorage extends FileStorage {
  readonly enabled = true;

  private readonly client = inject(SUPABASE);
  private readonly organization = inject(CurrentOrganization);

  async sync(kind: FileKind, recordId: string, file: File | null, cleared: boolean): Promise<void> {
    if (!file) {
      if (cleared) await this.removeAll(kind, recordId);
      return;
    }
    await this.removeAll(kind, recordId);
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(`${this.folder(kind, recordId)}/${storageName(file.name)}`, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw toError(error);
  }

  async openUrl(kind: FileKind, recordId: string): Promise<string | null> {
    const [name] = await this.list(kind, recordId);
    if (!name) return null;
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrl(`${this.folder(kind, recordId)}/${name}`, SIGNED_URL_SECONDS);
    if (error) throw toError(error);
    return data.signedUrl;
  }

  async removeAll(kind: FileKind, recordId: string): Promise<void> {
    const names = await this.list(kind, recordId);
    if (!names.length) return;
    const { error } = await this.client.storage.from(BUCKET).remove(names.map((name) => `${this.folder(kind, recordId)}/${name}`));
    if (error) throw toError(error);
  }

  private async list(kind: FileKind, recordId: string): Promise<string[]> {
    const { data, error } = await this.client.storage.from(BUCKET).list(this.folder(kind, recordId));
    if (error) throw toError(error);
    return (data ?? []).map((object) => object.name).filter((name) => !name.startsWith('.'));
  }

  private folder(kind: FileKind, recordId: string): string {
    return `${this.organization.organizationId()}/${kind}/${recordId}`;
  }
}

/** Storage keys accept a limited character set: keep letters, digits, dot, dash and underscore. */
export function storageName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
  return cleaned || 'ficheiro';
}
