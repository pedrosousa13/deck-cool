import { beforeAll, describe, expect, it } from 'vitest';
import { expectSettledTo, mockReducedMotion, mount, unmount } from './fixtures';

/** `style-src 'self'`, the same rule `sites/drawerdeck/src/csp.ts` sends: no
 * inline `<style>` and no unhashed one. A `<meta http-equiv>` enforces it in
 * vitest browser mode as long as it lands before anything else writes to
 * `<head>` -- true here only because vitest isolates each test file in its
 * own iframe, so this file's `<head>` is still empty when it runs. */
function setStyleSrcSelfCsp() {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "style-src 'self'";
  document.head.prepend(meta);
}

function onceViolation() {
  return new Promise<SecurityPolicyViolationEvent>((resolve) => {
    document.addEventListener(
      'securitypolicyviolation',
      (event) => resolve(event as SecurityPolicyViolationEvent),
      { once: true }
    );
  });
}

describe("style-src 'self'", () => {
  beforeAll(() => {
    setStyleSrcSelfCsp();
  });

  it('actually blocks an inline <style> tag (sanity check for the meta CSP above)', async () => {
    const violation = onceViolation();
    const style = document.createElement('style');
    style.textContent = 'body{}';
    document.head.append(style);

    const event = await violation;

    expect(event.violatedDirective).toMatch(/^style-src/);
    style.remove();
  });

  it('opens a drawer with no CSP violation, and the native backdrop is transparent', async () => {
    mockReducedMotion();
    const violations: SecurityPolicyViolationEvent[] = [];
    const onViolation = (event: Event) =>
      violations.push(event as SecurityPolicyViolationEvent);
    document.addEventListener('securitypolicyviolation', onViolation);

    const fixture = mount({ snapPoints: [0.5] });
    try {
      fixture.drawer.open();
      await expectSettledTo(() => fixture.drawer.phase, 'open');

      expect(violations).toEqual([]);
      const backdrop = getComputedStyle(fixture.dialog, '::backdrop');
      expect(backdrop.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    } finally {
      document.removeEventListener('securitypolicyviolation', onViolation);
      unmount(fixture);
    }
  });
});
