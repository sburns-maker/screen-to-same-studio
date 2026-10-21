declare module "virtual:pwa-register" {
  export function registerSW(options?: { immediate?: boolean; onRegistered?: (r: ServiceWorkerRegistration | undefined) => void }): (reloadPage?: boolean) => Promise<void>;
}
