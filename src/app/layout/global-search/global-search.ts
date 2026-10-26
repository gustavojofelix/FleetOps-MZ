import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { EntityDirectory } from '../../core/services/entity-directory.service';
import { Icon } from '../../shared/ui/icon/icon';
import { LayoutService } from '../layout.service';
import { SearchResult, searchEverything } from './search-index';

/** Command-palette style search over local mock records (Ctrl/⌘ K or "/"). */
@Component({
  selector: 'app-global-search',
  imports: [TranslatePipe, Icon],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onGlobalKeydown($event)' },
})
export class GlobalSearch {
  protected readonly layout = inject(LayoutService);
  private readonly directory = inject(EntityDirectory);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly term = signal('');
  protected readonly activeIndex = signal(0);

  protected readonly groups = computed(() =>
    searchEverything(this.term(), {
      vehicles: this.directory.vehicles(),
      drivers: this.directory.drivers(),
      trailers: this.directory.trailers(),
      trips: this.directory.trips(),
      customers: this.directory.customers(),
      documents: this.directory.documents(),
      customerName: (id) => this.directory.customerName(id),
    }),
  );
  protected readonly flat = computed(() => this.groups().flatMap((group) => group.results));
  protected readonly loading = this.directory.loading;

  constructor() {
    afterRenderEffect(() => {
      const open = this.layout.searchOpen();
      const element = untracked(() => this.dialog().nativeElement);
      if (open && !element.open) {
        element.showModal();
        this.input()?.nativeElement.focus();
        this.input()?.nativeElement.select();
      } else if (!open && element.open) {
        element.close();
      }
    });
  }

  protected optionId(result: SearchResult): string {
    return `search-option-${result.group}-${result.id}`;
  }

  protected indexOf(result: SearchResult): number {
    return this.flat().indexOf(result);
  }

  protected onInput(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected clear(): void {
    this.term.set('');
    this.activeIndex.set(0);
    this.input()?.nativeElement.focus();
  }

  protected close(): void {
    this.layout.searchOpen.set(false);
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const results = this.flat();
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % results.length);
      this.scrollActiveIntoView();
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + results.length) % results.length);
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      const result = results[this.activeIndex()];
      if (result) {
        event.preventDefault();
        this.open(result);
      }
    }
  }

  protected open(result: SearchResult): void {
    this.close();
    void this.router.navigate(result.link, { queryParams: result.queryParams });
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.layout.openSearch();
    } else if (event.key === '/' && !typing && !this.layout.searchOpen()) {
      event.preventDefault();
      this.layout.openSearch();
    }
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() => {
      const result = this.flat()[this.activeIndex()];
      if (result) this.dialog().nativeElement.querySelector(`#${this.optionId(result)}`)?.scrollIntoView({ block: 'nearest' });
    });
  }
}
