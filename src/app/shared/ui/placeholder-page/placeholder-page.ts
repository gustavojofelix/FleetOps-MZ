import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyState } from '../empty-state/empty-state';

/** Temporary page used while a feature module is being built. */
@Component({
  selector: 'app-placeholder-page',
  imports: [EmptyState, TranslatePipe],
  templateUrl: './placeholder-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderPage {
  protected readonly titleKey: string = inject(ActivatedRoute).snapshot.parent?.data['titleKey'] ?? 'common.appName';
}
