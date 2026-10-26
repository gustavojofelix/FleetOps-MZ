import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';

let nextId = 0;

/**
 * Accessible dialog on top of the native <dialog> element (focus containment, Escape,
 * inert background). `variant="drawer"` renders a side panel used for create/edit forms.
 *
 * <app-modal [open]="open()" (closed)="open.set(false)" [title]="…" variant="drawer">
 *   …body…
 *   <ng-container modal-footer>…buttons…</ng-container>
 * </app-modal>
 */
@Component({
  selector: 'app-modal',
  imports: [Icon, TranslatePipe],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly variant = input<'dialog' | 'drawer'>('dialog');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Prevents closing by Escape / backdrop (e.g. while saving). */
  readonly dismissible = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${++nextId}`;
  protected readonly descriptionId = `modal-desc-${nextId}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const open = this.open();
      const element = untracked(() => this.dialog().nativeElement);
      if (open && !element.open) {
        element.showModal();
        // Prefer the first form control; fall back to the dialog itself.
        const target = element.querySelector<HTMLElement>('[autofocus], .modal__body input, .modal__body select, .modal__body textarea');
        (target ?? element).focus({ preventScroll: true });
      } else if (!open && element.open) {
        element.close();
      }
    });
  }

  protected requestClose(): void {
    if (this.dismissible()) this.closed.emit();
  }

  protected onCancel(event: Event): void {
    // Escape: keep the element open until the parent flips `open`, so state stays in sync.
    event.preventDefault();
    this.requestClose();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.requestClose();
  }
}
