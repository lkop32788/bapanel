// Lets the panel backend finish a UI update on installs where the Next.js
// server runs in its own container: the backend and the frontend share the
// application volume but not the process namespace, so after a new build is
// swapped in nothing can restart the server and it keeps serving the previous
// build (unstyled pages, 404s on /_next/static). The backend touches
// `.next-restart-request` in the frontend directory and this hook exits, which
// the container's restart policy turns into a restart on the new build.
//
// Node's modules are read through process.getBuiltinModule so this file stays
// loadable when Next compiles it for the Edge runtime as well.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_DISABLE_RESTART_HOOK === '1') return;

  const getModule = (process as unknown as {
    getBuiltinModule?: (id: string) => unknown;
  }).getBuiltinModule;
  if (!getModule) return;

  const fs = getModule('fs') as typeof import('fs');

  // Only inside a container: there the process is supervised and comes back.
  // A bare `next start` would stay down, and pm2 installs are restarted by the
  // backend directly, so they do not need this.
  if (!fs.existsSync('/.dockerenv')) return;

  const flag = '.next-restart-request';
  const startedAt = Date.now();

  const timer = setInterval(() => {
    try {
      const { mtimeMs } = fs.statSync(flag);
      // Ignore a stale request left behind by an earlier update.
      if (mtimeMs > startedAt && Date.now() - mtimeMs < 15 * 60 * 1000) {
        console.log('[wabapanel] restart requested by panel update - exiting to pick up the new build');
        (process as unknown as { exit: (code: number) => void }).exit(0);
      }
    } catch (e) {
      /* no request pending */
    }
  }, 10000);
  timer.unref?.();
}
