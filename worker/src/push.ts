// Sending one empty push to a browser. The service worker works out what to show.

import { vapidAuthorization, type VapidKeys } from './vapid';

/** 'gone': the browser dropped its subscription, so stop sending to it. */
export async function sendPush(endpoint: string, env: VapidKeys): Promise<'ok' | 'gone' | 'failed'> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(endpoint, env),
      ttl: '1800', // if the phone is offline, still worth showing for half an hour
      urgency: 'high',
    },
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (res.ok) return 'ok';
  console.warn('push failed', res.status, await res.text());
  return 'failed';
}
