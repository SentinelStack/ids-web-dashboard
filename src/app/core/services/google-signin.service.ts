import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

type GoogleCredentialResponse = { credential?: string };

interface GoogleIdApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (resp: GoogleCredentialResponse) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdApi;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Loads Google Identity Services on demand and renders its sign-in button. */
@Injectable({ providedIn: 'root' })
export class GoogleSignInService {
  private loading?: Promise<void>;

  get clientId(): string {
    return environment.googleClientId;
  }

  get enabled(): boolean {
    return !!this.clientId;
  }

  /** Render the official Google button into `parent`; `onToken` gets the ID token. */
  async renderButton(parent: HTMLElement, onToken: (idToken: string) => void): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.load();
    const google = window.google;
    if (!google) {
      return;
    }
    google.accounts.id.initialize({
      client_id: this.clientId,
      callback: (resp) => {
        if (resp.credential) {
          onToken(resp.credential);
        }
      },
    });
    google.accounts.id.renderButton(parent, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 240,
    });
  }

  private load(): Promise<void> {
    if (window.google) {
      return Promise.resolve();
    }
    if (this.loading) {
      return this.loading;
    }
    this.loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
    return this.loading;
  }
}
