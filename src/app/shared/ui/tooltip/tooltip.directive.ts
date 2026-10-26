import { DOCUMENT, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

let nextId = 0;

/**
 * `[appTooltip]="label"` shows a small label on hover and keyboard focus.
 * Supplementary only: the trigger must still have an accessible name (aria-label).
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class TooltipDirective implements OnDestroy {
  readonly appTooltip = input<string | null>('');
  readonly tooltipPlacement = input<'right' | 'top' | 'bottom'>('top');
  readonly tooltipDisabled = input(false);

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private element: HTMLElement | null = null;
  private readonly id = `tooltip-${++nextId}`;

  show(): void {
    const text = this.appTooltip();
    if (!text || this.tooltipDisabled() || this.element) return;
    const tip = this.document.createElement('div');
    tip.className = 'app-tooltip';
    tip.id = this.id;
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    this.document.body.appendChild(tip);
    this.element = tip;
    this.position();
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private position(): void {
    if (!this.element) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const tip = this.element.getBoundingClientRect();
    const gap = 8;
    let top: number;
    let left: number;
    switch (this.tooltipPlacement()) {
      case 'right':
        top = rect.top + rect.height / 2 - tip.height / 2;
        left = rect.right + gap;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tip.width / 2;
        break;
      default:
        top = rect.top - tip.height - gap;
        left = rect.left + rect.width / 2 - tip.width / 2;
    }
    const maxLeft = window.innerWidth - tip.width - 8;
    this.element.style.top = `${Math.max(8, top)}px`;
    this.element.style.left = `${Math.min(Math.max(8, left), maxLeft)}px`;
  }
}
