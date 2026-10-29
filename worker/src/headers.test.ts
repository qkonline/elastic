// The headers the Worker serves the app with (public/_headers, copied into dist/): the content security policy names the
// inline theme script in index.html by its hash, so a change to the script needs a new hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('_headers', () => {
  const headers = read('../../public/_headers');

  it("allows the inline theme script by its hash, and nothing else that's inline", () => {
    const scripts = [...read('../../index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256').update(scripts[0]).digest('base64');
    const csp = /Content-Security-Policy-Report-Only: (.*)/.exec(headers)![1];
    const scriptSrc = /script-src ([^;]*)/.exec(csp)![1];
    expect(scriptSrc).toContain(`'sha256-${hash}'`);
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src [^;]*wss:\/\/elastic\.kaiserkhan\.com/);
  });

  it('sends the security headers with everything', () => {
    const all = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/*\n'))!;
    for (const h of [
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Strict-Transport-Security: max-age=',
      'Permissions-Policy: camera=()',
    ])
      expect(all).toContain(h);
  });
});
