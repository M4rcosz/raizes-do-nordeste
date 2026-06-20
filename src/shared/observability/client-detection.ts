// User-Agent is client controlled and trivially spoofable. This detection is
// for observability only (knowing roughly who is calling us in the access log).
// Never use the result for authorization or any security decision.

export type ClientKind = 'postman' | 'curl' | 'insomnia' | 'browser' | 'unknown';

const POSTMAN = /PostmanRuntime/i;
const CURL = /curl/i;
const INSOMNIA = /insomnia/i;
const BROWSER = /Mozilla|Chrome|Safari|Firefox|Edge/i;

export function detectClient(userAgent: string | undefined): { client: ClientKind; raw: string } {
  const raw = userAgent ?? '';

  if (raw.length === 0) {
    return { client: 'unknown', raw };
  }
  if (POSTMAN.test(raw)) {
    return { client: 'postman', raw };
  }
  if (CURL.test(raw)) {
    return { client: 'curl', raw };
  }
  if (INSOMNIA.test(raw)) {
    return { client: 'insomnia', raw };
  }
  if (BROWSER.test(raw)) {
    return { client: 'browser', raw };
  }

  return { client: 'unknown', raw };
}
