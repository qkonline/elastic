/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set in the last build left at an old address: the app's new one (src/lib/move.ts). */
  readonly VITE_MOVED_TO?: string;
  /** Base URL of the push worker (worker/), e.g. https://elastic-day-push.example.workers.dev */
  readonly VITE_PUSH_URL?: string;
  /** The worker's VAPID public key (base64url, uncompressed P-256 point). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
