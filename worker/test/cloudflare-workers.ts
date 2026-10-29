// What the worker imports from 'cloudflare:workers', for its tests in Node (vite.config.ts points
// the import here): the base classes keep what Cloudflare would hand them.
export class DurableObject<Env = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: Env,
  ) {}
}

export class WorkerEntrypoint<Env = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: Env,
  ) {}
}
