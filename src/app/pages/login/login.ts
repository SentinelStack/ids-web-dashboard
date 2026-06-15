import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  activeTab: 'login' | 'register' = 'login';

  username = '';
  password = '';
  regUsername = '';
  regEmail = '';
  regPassword = '';

  busy = false;
  error = '';

  async onLogin(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.error = '';
    this.busy = true;
    try {
      await this.auth.login(this.username.trim(), this.password);
      void this.router.navigate(['/app/dashboard']);
    } catch (e) {
      this.error = this.messageFor(e, 'Login failed — check your credentials.');
    } finally {
      this.busy = false;
    }
  }

  async onRegister(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.error = '';
    this.busy = true;
    try {
      await this.auth.register(
        this.regUsername.trim(),
        this.regPassword,
        this.regEmail.trim(),
        this.regUsername.trim(),
      );
      await this.auth.login(this.regUsername.trim(), this.regPassword);
      void this.router.navigate(['/app/dashboard']);
    } catch (e) {
      this.error = this.messageFor(e, 'Registration failed.');
    } finally {
      this.busy = false;
    }
  }

  private messageFor(e: unknown, fallback: string): string {
    const msg = e instanceof Error ? e.message : '';
    if (/invalid/i.test(msg)) {
      return 'Invalid username or password.';
    }
    if (/taken/i.test(msg)) {
      return 'That username is already taken.';
    }
    return fallback;
  }
}
