import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  description?: string;
}

let nextId = 0;

/** Transient feedback messages, announced politely to assistive technology. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  show(tone: ToastTone, message: string, description?: string, durationMs = 4500): void {
    const toast: Toast = { id: ++nextId, tone, message, description };
    this.items.update((list) => [...list.slice(-3), toast]);
    if (durationMs > 0) setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  success(message: string, description?: string): void {
    this.show('success', message, description);
  }

  error(message: string, description?: string): void {
    this.show('error', message, description, 7000);
  }

  info(message: string, description?: string): void {
    this.show('info', message, description);
  }

  warning(message: string, description?: string): void {
    this.show('warning', message, description, 6000);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((toast) => toast.id !== id));
  }
}
