import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { Permission } from '../../../core/models';
import { PermissionService } from '../../../core/services/permission.service';

/**
 * Renders its element only when the signed-in user has the permission (or any of a list):
 * `<button *appCan="'fleet.manage'">…</button>`, `<div *appCan="['trips.manage', 'costs.manage']">`.
 * Hiding is a convenience: the backend refuses the action anyway.
 */
@Directive({ selector: '[appCan]' })
export class CanDirective {
  readonly appCan = input.required<Permission | readonly Permission[]>();

  private readonly permissions = inject(PermissionService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.permissions.can(this.appCan());
      if (allowed && !this.shown) this.container.createEmbeddedView(this.template);
      if (!allowed && this.shown) this.container.clear();
      this.shown = allowed;
    });
  }
}
