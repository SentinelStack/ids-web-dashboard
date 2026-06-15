import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ActivityService } from '../../core/services/activity.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayoutComponent implements OnInit {
  private readonly activity = inject(ActivityService);

  ngOnInit(): void {
    // Record real in-app navigation for the Profile activity log.
    this.activity.start();
  }
}
