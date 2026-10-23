// Sending email through Resend's HTTP API (the same account and verified domain as Boardo's).
// Without a key, mail is switched off; with DEV_MAIL set and no key (local development) it's
// kept for `/dev/mail` instead, so tests can read the codes.

import { Refusal } from './auth';

export interface MailEnv {
  /** A secret. Without it (or empty), email is off. */
  RESEND_API_KEY?: string;
  /** Who the mail comes from, e.g. "Elastic <elastic@kaiserkhan.com>". */
  EMAIL_FROM?: string;
  /** Local development: keep mail for /dev/mail rather than sending it. */
  DEV_MAIL?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Mail kept in local development, newest last. */
export const devOutbox: Mail[] = [];

/** Mail kept for /dev/mail. Never where a real key is set, so a stray DEV_MAIL can't show codes. */
export const devMail = (env: MailEnv) => !!env.DEV_MAIL && !env.RESEND_API_KEY;

export const mailOn = (env: MailEnv) => devMail(env) || (!!env.RESEND_API_KEY && !!env.EMAIL_FROM);

export async function sendMail(env: MailEnv, mail: Mail): Promise<void> {
  if (devMail(env)) {
    devOutbox.push(mail);
    if (devOutbox.length > 50) devOutbox.shift();
    console.log(`Mail to ${mail.to}: ${mail.subject}`);
    return;
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Refusal(503, "Email isn't set up yet.");
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      // A sign-in waits on this: give up rather than hang.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('Resend', e);
    throw new Refusal(502, "The email couldn't be sent. Try again in a minute.");
  }
  if (!res.ok) {
    console.error('Resend', res.status, await res.text().catch(() => ''));
    throw new Refusal(502, "The email couldn't be sent. Try again in a minute.");
  }
}
