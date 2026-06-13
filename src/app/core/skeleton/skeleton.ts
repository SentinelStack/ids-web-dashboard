import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `<span
    class="sk"
    [style.width]="w"
    [style.height]="h"
    [style.borderRadius]="radius"
  ></span>`,
  styles: [
    `
      :host {
        display: block;
      }
      .sk {
        display: block;
        position: relative;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.07);
      }
      .sk::after {
        content: '';
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.13), transparent);
        animation: sk-shimmer 1.4s ease-in-out infinite;
      }
      @keyframes sk-shimmer {
        100% {
          transform: translateX(100%);
        }
      }
    `,
  ],
})
export class SkeletonComponent {
  @Input() w = '100%';
  @Input() h = '14px';
  @Input() radius = '8px';
}
