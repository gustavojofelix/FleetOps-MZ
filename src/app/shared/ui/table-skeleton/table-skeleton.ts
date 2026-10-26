import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Placeholder rows shown while a list loads for the first time. */
@Component({
  selector: 'app-table-skeleton',
  imports: [TranslatePipe],
  templateUrl: './table-skeleton.html',
  styleUrl: './table-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSkeleton {
  readonly rows = input(6);
  readonly columns = input(5);
  protected readonly rowList = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly columnList = computed(() => Array.from({ length: this.columns() }, (_, i) => i));
}
