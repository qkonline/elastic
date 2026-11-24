<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // How the day works, in the app's own words, and a way to reach someone.
  const STATUS = {
    live: 'syncing',
    off: 'not signed in',
    connecting: 'connecting',
    offline: 'offline',
    paused: 'paused',
    full: 'account full',
    refused: 'changes refused',
  };
  const build = document.querySelector('meta[name="build"]')?.getAttribute('content') ?? 'dev';
  const mail = $derived(
    'mailto:kaiser@kaiserkhan.com?subject=' +
      encodeURIComponent('Elastic') +
      '&body=' +
      encodeURIComponent(
        `\n\n\nElastic v2.4 (${build}), ${STATUS[P.syncStatus]}, ${innerWidth} by ${innerHeight}\n${navigator.userAgent}`,
      ),
  );
  const QA: [string, string][] = [
    [
      'How are the times worked out?',
      'From the order of your list and how long each task takes. Move a task and the times after it change. A fixed time stays where it is, and tasks go around it.',
    ],
    [
      'Why did my tasks move?',
      "Once your day has started, tasks you haven't begun move along with the clock, so a break or a long task pushes them later. The time in between shows as unaccounted for.",
    ],
    [
      'What does Missed mean?',
      "What's left no longer fits before your wrap-up, and the clock has passed that task. Reschedule it, or mark it done.",
    ],
    [
      'What happens when I start another task?',
      'The one that was running is set aside with its time kept, and the rest of it comes straight after, marked continued. If it was really finished, tap It was done.',
    ],
    [
      'What if I forget to stop a timer, or to end my day?',
      'Today asks about it the next morning. Nothing moves until you choose, and a timer left running counts up to when its time was up.',
    ],
    [
      'Can I change a time that was recorded?',
      'Yes. Open the task and tap its start or finish time, any time before the day is ended. Reopen today at the bottom of the day.',
    ],
    [
      'Why is there no timer on my task?',
      'It was added with No time, which makes it a check. Open it, tap Edit task, and pick a length.',
    ],
    [
      'What can I undo?',
      "Most taps show Undo for a few seconds. Erase everything and Import can be undone for 30 days, in Your data, if you're signed in.",
    ],
    [
      "I can't get into my email",
      "A passkey signs you in without it. Add one on a device where you're still signed in, under Account. If you're locked out, write to us.",
    ],
  ];
</script>

<section class="card" aria-label="How Elastic works">
  {#each QA as [q, a] (q)}
    <details>
      <summary>{q}</summary>
      <p>{a}</p>
    </details>
  {/each}
</section>
<section class="card pad" aria-label="Contact">
  <span class="ct">Something wrong, or an idea?</span>
  <p>
    Write to the person who makes Elastic. The email says which version and browser you have, and nothing from your
    plan.
  </p>
  <a class="btn-plain self" href={mail}>Write an email</a>
</section>
<p class="links"><a href="/privacy" target="_blank">Privacy</a><a href="/terms" target="_blank">Terms</a></p>

<style>
  .card {
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
  }
  .pad {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  details + details {
    border-top: 1px solid var(--border);
  }
  summary {
    min-height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font: 400 15px/1.35 var(--font);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    margin: -3px 3px 0 0;
    border: solid var(--muted);
    border-width: 0 1.5px 1.5px 0;
    rotate: 45deg;
  }
  details[open] summary::after {
    rotate: 225deg;
    margin-top: 3px;
  }
  p {
    margin: 0;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  details p {
    padding: 0 16px 16px;
  }
  .ct {
    font: 500 15px/1.3 var(--font);
  }
  a.btn-plain {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    color: var(--text);
    text-decoration: none;
  }
  .links {
    display: flex;
    gap: 20px;
  }
  .links a {
    padding: 12px 0;
    color: var(--muted);
  }
</style>
