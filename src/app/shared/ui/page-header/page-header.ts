import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';

export interface Breadcrumb {
  /** Already translated label, or a translation key when `translate` is true. */
  label: string;
  link?: string | readonly unknown[];
  translate?: boolean;
}

/**
 * Page title row with optional breadcrumbs and actions:
 * <app-page-header [title]="…" [subtitle]="…" [breadcrumbs]="…">
 *   <ng-container actions>…buttons…</ng-container>
 *   <ng-container meta>…badges…</ng-container>
 * </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, TranslatePipe, Icon],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
}
