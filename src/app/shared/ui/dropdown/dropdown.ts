import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';

let nextId = 0;

/**
 * Lightweight menu button. Closes on outside click, Escape and item selection; arrow keys move
 * between `.menu__item` elements.
 *
 * <app-dropdown align="end">
 *   <button dropdownTrigger class="btn btn--ghost btn--icon">…</button>
 *   <div dropdownMenu>
 *     <button class="menu__item" role="menuitem" (click)="…">…</button>
 *   </div>
 * </app-dropdown>
 */
@Component({
  selector: 'app-dropdown',
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class Dropdown {
  readonly align = input<'start' | 'end'>('start');
  readonly direction = input<'down' | 'up'>('down');
  readonly menuClass = input('');

  readonly isOpen = signal(false);
  readonly menuId = `dropdown-menu-${++nextId}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private trigger: HTMLElement | null = null;

  registerTrigger(element: HTMLElement): void {
    this.trigger = element;
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.openMenu();
  }

  openMenu(focusFirst = false): void {
    this.isOpen.set(true);
    if (focusFirst) setTimeout(() => this.items()[0]?.focus());
  }

  close(restoreFocus = false): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    if (restoreFocus) this.trigger?.focus();
  }

  protected onMenuClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.menu__item') && !target.closest('[data-keep-open]')) this.close(true);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      if (event.key === 'ArrowDown' && event.target === this.trigger) {
        event.preventDefault();
        this.openMenu(true);
      }
      return;
    }
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private items(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('.dropdown__menu .menu__item:not(:disabled)'),
    );
  }
}

/** Marks the element that opens the dropdown and keeps its ARIA state in sync. */
@Directive({
  selector: '[dropdownTrigger]',
  host: {
    'aria-haspopup': 'menu',
    '[attr.aria-expanded]': 'dropdown.isOpen()',
    '[attr.aria-controls]': 'dropdown.menuId',
    '(click)': 'dropdown.toggle()',
  },
})
export class DropdownTrigger {
  protected readonly dropdown = inject(Dropdown);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.dropdown.registerTrigger(this.element.nativeElement));
  }
}
