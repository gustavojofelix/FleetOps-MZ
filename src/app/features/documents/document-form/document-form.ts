import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DOCUMENT_TYPES, DocumentType, ENTITY_TYPES, EntityType, FleetDocument } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { dateOrder, revealErrors } from '../../../shared/utils/form-utils';
import { DocumentsFacade } from '../documents.facade';

export type DocumentFormMode = 'create' | 'edit' | 'renew';

/** Optional starting values for a new document (e.g. from a filtered list). */
export interface DocumentPreset {
  type?: DocumentType;
  entityType?: EntityType;
  entityId?: string;
}

interface SelectedFile {
  name: string;
  sizeKb: number;
}

const MAX_FILE_KB = 10 * 1024;

/** Create / edit / renew a document, with a simulated (local-only) file selection. */
@Component({
  selector: 'app-document-form',
  imports: [ReactiveFormsModule, TranslatePipe, ...FORMAT_PIPES, FieldError, Icon],
  templateUrl: './document-form.html',
  styleUrl: './document-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentForm {
  readonly document = input<FleetDocument | null>(null);
  readonly mode = input<DocumentFormMode>('create');
  readonly preset = input<DocumentPreset | null>(null);
  readonly saved = output<FleetDocument>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(DocumentsFacade);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly types = DOCUMENT_TYPES;
  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly saving = signal(false);
  protected readonly reference = signal('');
  protected readonly file = signal<SelectedFile | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly dragging = signal(false);
  /** Once the user types a title, suggestions stop overwriting it. */
  private titleEdited = false;

  protected readonly form = this.fb.group(
    {
      type: ['insurance' as DocumentType, Validators.required],
      title: ['', [Validators.required, Validators.maxLength(120)]],
      entityType: ['vehicle' as EntityType, Validators.required],
      entityId: ['', Validators.required],
      issuer: ['', [Validators.required, Validators.maxLength(120)]],
      issueDate: [this.clock.today(), Validators.required],
      expiryDate: [''],
      notes: ['', Validators.maxLength(500)],
    },
    { validators: dateOrder('issueDate', 'expiryDate') },
  );

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly entityOptions = computed(() => this.facade.entityOptions(this.value().entityType ?? 'vehicle'));
  protected readonly suggestion = computed(() => {
    const value = this.value();
    return this.facade.suggestTitle(value.type ?? 'insurance', value.entityType ?? 'vehicle', value.entityId || null);
  });
  protected readonly showSuggestion = computed(() => !!this.value().entityId && this.suggestion() !== (this.value().title ?? '').trim());

  constructor() {
    const controls = this.form.controls;
    controls.entityType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => controls.entityId.setValue(''));
    controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applySuggestion());
    controls.entityId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applySuggestion());
    queueMicrotask(() => void this.populate());
  }

  protected submitLabel(): string {
    switch (this.mode()) {
      case 'edit':
        return 'common.actions.saveChanges';
      case 'renew':
        return 'documents.actions.renew';
      default:
        return 'documents.new';
    }
  }

  protected onTitleInput(): void {
    this.titleEdited = true;
  }

  protected useSuggestion(): void {
    this.form.controls.title.setValue(this.suggestion());
    this.titleEdited = false;
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectFile(input.files?.[0] ?? null);
    // Allow choosing the same file again after removing it.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.selectFile(event.dataTransfer?.files?.[0] ?? null);
  }

  protected removeFile(): void {
    this.file.set(null);
    this.fileError.set(null);
  }

  protected fileSize(sizeKb: number): string {
    return sizeKb >= 1024
      ? this.i18n.t('documents.file.sizeMb', { size: this.format.number(sizeKb / 1024, 1) })
      : this.i18n.t('documents.file.sizeKb', { size: this.format.number(sizeKb) });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const file = this.file();
    try {
      const saved = await this.facade.save(this.mode() === 'create' ? null : (this.document()?.id ?? null), {
        reference: this.reference(),
        type: value.type,
        title: value.title.trim(),
        entityType: value.entityType,
        entityId: value.entityId,
        issuer: value.issuer.trim(),
        issueDate: value.issueDate,
        expiryDate: value.expiryDate || null,
        fileName: file?.name ?? null,
        fileSizeKb: file?.sizeKb ?? null,
        notes: value.notes.trim(),
      });
      this.saved.emit(saved);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private selectFile(file: File | null): void {
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    if (sizeKb > MAX_FILE_KB) {
      this.fileError.set(this.i18n.t('documents.file.tooLarge'));
      return;
    }
    this.fileError.set(null);
    // Only metadata is kept; the file content never leaves (or is read by) the browser.
    this.file.set({ name: file.name, sizeKb });
  }

  private applySuggestion(): void {
    if (this.titleEdited) return;
    this.form.controls.title.setValue(this.suggestion(), { emitEvent: true });
  }

  private async populate(): Promise<void> {
    const document = this.document();
    const mode = this.mode();
    if (document && mode !== 'create') {
      this.reference.set(document.reference);
      this.titleEdited = true;
      const renewal = mode === 'renew' ? this.facade.renewalDates(document) : null;
      const renewNote = document.expiryDate
        ? this.i18n.t('documents.renewNote', { date: this.format.date(this.clock.today()), previous: this.format.date(document.expiryDate) })
        : '';
      this.form.reset({
        type: document.type,
        entityType: document.entityType,
        entityId: document.entityId,
        title: document.title,
        issuer: document.issuer,
        issueDate: renewal?.issueDate ?? document.issueDate,
        expiryDate: (renewal ? renewal.expiryDate : document.expiryDate) ?? '',
        notes: renewal && renewNote ? [document.notes, renewNote].filter(Boolean).join('\n') : document.notes,
      });
      // Reset re-emits entityType, which clears the entity: restore it.
      this.form.controls.entityId.setValue(document.entityId);
      this.form.controls.title.setValue(document.title);
      // A renewal needs the new file; an edit keeps the current one.
      this.file.set(mode === 'edit' && document.fileName ? { name: document.fileName, sizeKb: document.fileSizeKb ?? 0 } : null);
      return;
    }
    const preset = this.preset();
    if (preset) {
      if (preset.type) this.form.controls.type.setValue(preset.type);
      if (preset.entityType) this.form.controls.entityType.setValue(preset.entityType);
      if (preset.entityId) this.form.controls.entityId.setValue(preset.entityId);
    }
    this.applySuggestion();
    this.reference.set(await this.facade.nextReference());
  }
}
