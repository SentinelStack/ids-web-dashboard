import { AfterViewInit, Component, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { GoogleSignInService } from '../../core/services/google-signin.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPageComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly googleSignIn = inject(GoogleSignInService);
  private readonly zone = inject(NgZone);

  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLElement>;

  activeTab: 'login' | 'register' = 'login';
  step: 'credentials' | 'mfa' = 'credentials';

  username = '';
  password = '';
  regUsername = '';
  regEmail = '';
  regPassword = '';

  mfaToken = '';
  mfaCode = '';

  busy = false;
  error = '';

  get googleEnabled(): boolean {
    return this.googleSignIn.enabled;
  }

  ngAfterViewInit(): void {
    if (this.googleBtn) {
      void this.googleSignIn.renderButton(this.googleBtn.nativeElement, (idToken) =>
        this.zone.run(() => this.onGoogle(idToken)),
      );
    }
  }

  async onLogin(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.error = '';
    this.busy = true;
    try {
      const result = await this.auth.login(this.username.trim(), this.password);
      this.afterAuth(result);
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
      const result = await this.auth.login(this.regUsername.trim(), this.regPassword);
      this.afterAuth(result);
    } catch (e) {
      this.error = this.messageFor(e, 'Registration failed.');
    } finally {
      this.busy = false;
    }
  }

  async onVerifyMfa(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!/^\d{6}$/.test(this.mfaCode.trim())) {
      this.error = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    this.error = '';
    this.busy = true;
    try {
      await this.auth.loginMfa(this.mfaToken, this.mfaCode.trim());
      void this.router.navigate(['/app/dashboard']);
    } catch (e) {
      this.error = this.messageFor(e, 'Invalid code — try again.');
    } finally {
      this.busy = false;
    }
  }

  cancelMfa(): void {
    this.step = 'credentials';
    this.mfaToken = '';
    this.mfaCode = '';
    this.error = '';
  }

  private async onGoogle(idToken: string): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      const result = await this.auth.loginGoogle(idToken);
      this.afterAuth(result);
    } catch (e) {
      this.error = this.messageFor(e, 'Google sign-in failed.');
    } finally {
      this.busy = false;
    }
  }

  /** Branch on a sign-in result: go to the dashboard, or prompt for the 2FA code. */
  private afterAuth(result: { mfaRequired: boolean; mfaToken?: string }): void {
    if (result.mfaRequired && result.mfaToken) {
      this.mfaToken = result.mfaToken;
      this.mfaCode = '';
      this.step = 'mfa';
      return;
    }
    void this.router.navigate(['/app/dashboard']);
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
