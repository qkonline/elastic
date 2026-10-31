# Elastic

A planner where **the order of the list is the plan**, with habits, quarterly goals and weekly reviews around it. It was called Elastic Day until it grew beyond the day.

You add what you want to do and roughly how long it takes. You never type a start or end time: they're worked out from the order of the list, from anything pinned to a fixed time, and from what actually happened. Run a task long, pause it, push it to later, and the rest of the day moves to fit.

Live at **[elastic.kaiserkhan.com](https://elastic.kaiserkhan.com/)**. It works on a phone or a desktop, in light or dark, installs like an app, and keeps working offline.

<p>
  <img src="docs/screenshot-light.png" width="300" alt="A day in progress in the light theme, with a task running">
  <img src="docs/screenshot-dark.png" width="300" alt="The same day later on in the dark theme, with missed tasks">
</p>

## How it works

- **Your day, your hours.** On a first visit, two questions shape the plan: when your day usually starts (or that it varies) and how long a productive day is for you. With a start that varies, the day's length counts from when you press _Start my day_. Change either in Settings → _Your day_.
- **Tasks, buffers and fixed times.** A task has a duration: pick a preset or set your own hours and minutes. A buffer is slack you can't start. A fixed item (a meeting, say) sits at its time and everything else flows around it. Put more in front of it than fits and it moves later, showing the time it was set for; a timer running over doesn't move it, you get a warning instead. The New task sheet explains each type in a line under the choice, and each has its own mark (a dot, a dashed ring, a clock). Give each one of five colours, or any colour you like.
- **The day at a glance.** The top of the day says when you started and when you're likely to be done, with the time worked and left. Between them, a ribbon shows every task as long as it takes, in its colour: done is faded, the running task fills as it goes, buffers are left clear, and a dot marks now. Tap a stretch of it to see which task it is, when it runs and how it's going. The pencil beside the start time changes the day's hours.
- **Start my day, then one timer.** Tasks can be started once you've pressed _Start my day_ (until then the plan is dimmed, but you can still change it). A task counts down; past zero it counts up in red, with a soft two-note chime and a buzz on phones. Starting another task pauses the one that's running rather than marking it done: it keeps the time you put in, and the rest of it comes straight after the new one, and whichever task you start moves up to where you are in the list, so everything still to do is planned after it.
- **Checks for things with no duration.** Each task has a _Length_: _No time_ makes it a check, which goes on the day's checklist above the timeline and is ticked off instead of timed; any length (15 minutes to 2 hours, or your own) gives it a timer and a place on the timeline. New tasks start at _No time_ unless you pick another length in Settings → Your day.
- **Late nights stay one day.** Once you've started a day, it stays _Today_ past midnight until you press _End my day_ at the bottom of the day, so working until 2 am still counts as the day you started. The wrap-up shows what got done and can move whatever's left to tomorrow. A day you forget to end closes at 4 am, or three hours after a later planned wrap-up.
- **Your plan keeps up with you.** Once the day has started, the tasks you haven't started move along with the current time, so a break doesn't leave them behind: the time shows as unaccounted for instead. Fixed-time tasks and buffers keep their times, and a task that no longer fits before one moves after it. Only when what's left won't fit before the end of your day do tasks stack up against it, and the ones the clock passes show as _missed_: reschedule them (start now, later today, another day) or mark them done.
- **Postpone.** Before a task starts, "Later today" moves it to the end of the list. Mid-task, the time you've put in stays logged and the rest becomes a new task, later today, tomorrow or someday.
- **Someday, for tasks with no day yet.** New task asks _When_: today, another day, or _Someday_. Someday tasks keep their length, colour, subtasks and notes, and wait in a folded section at the foot of Today until you open one and plan it for today, tomorrow or a day you pick. On a computer or a wide iPad they sit in a column beside the plan with the next three days under them, each showing when it runs, whether it runs past your wrap-up, and its first few tasks, so you can see where there's room: drag one onto the plan, a day in the week strip, the week or month view, or one of those days.
- **Reorder by dragging.** Drag a task by its colour bar (or press and hold its name on a phone); the other tasks slide aside to show where it will land. The task sheet has Earlier/Later buttons too.
- **Look first, edit on purpose.** Tapping a task shows it: where it sits in the day (picked out of the day's strip), what it's set to, and what you can do now (start, skip, postpone, tick off). Its subtasks can be ticked, added, renamed, removed (with Undo) and moved by pressing and holding, right there. Changing it happens behind Edit task, in the same form as New task, and only saves on Update task. Habits work the same way.
- **Nothing saves as you type.** Anything you type or adjust (a goal, a corrected time, a subtask, a habit's number, a setting with a time in it) waits for its Save, Update or Add button, with Cancel beside it. Taps that are the action themselves, like ticking something off or flipping a switch, happen at once.
- **Repeating tasks.** Every day, weekdays, weekly or every 2 weeks on the days you pick, monthly (on a date, a weekday like the last Friday, or the last day), or every few days, weeks or months. A repeat can go on, stop after a number of times, or stop on a date, and each one then says which time it is ("2 of 6"). Skipping one asks whether to add a day at the end or keep the end date. Editing a repeating task also updates the other days you haven't started yet, before and after the one you edited. Drag one past another repeating task, or delete one, and you choose whether that's just for today or for later days too.
- **Habits.** Add one from New task: something to tick off, an amount to reach (8 glasses of water: each tap adds one, press and hold to type a number), minutes to spend (timed tasks can count towards it), or a habit to break (each day counts as clean until you mark a slip). Every day, on chosen days, or a number of times a week or month, with an optional reminder. Habits sit in the Checklist among your checks, or in a section of their own (Settings), and a habit's sheet shows its streak, how often you've kept it and a month of days. The Checklist is a list under its own title bar that opens folded past three entries (the third fading out, with Show all beneath it), or, if you prefer (Settings), a row of chips that scrolls sideways. Ticks take the task's colour.
- **Day, week and month.** The switch at the top shows one day, a week or a month. The week is a time grid on a computer (each task a block at its time) and, on a phone, seven strips side by side with the chosen day's tasks listed below, with a toggle; in the grid, drag a task to another day or time, or tap an empty slot to add one there. The month shows how full each day is (task names, a bar of time planned and logged and a ring for habits kept on a computer; a small strip of the day's tasks and a line for habits kept on a phone). Tasks that overlap in the week grid sit side by side. Swipe or use the arrows to go back and forward a week or a month.
- **Goals and reviews.** The bar at the bottom switches between Today, Habits (every habit's week, streak and today's tick), Goals and Review, each a screen of its own, with Add task in the middle. Goals belong to a calendar quarter: give one a number to reach, milestones, or just the words and why, and link tasks and habits to it so their time and days count. Once a week, at a day and time you choose, Elastic offers a review: the week in numbers (time logged and which tasks it went on, tasks done, habits kept, what kept being moved) and a check-in on your goals. At the end of a quarter it asks how each goal went and lets you set the next quarter's. Past reviews are kept to read back.
- **Other days** are for planning: the week strip lets you look ahead or back and move things between days. On a phone, swipe sideways to go to the next or previous day, and pull down from the top to refresh.
- **Notifications.** The first time you start a timer or give a task a fixed time, Elastic offers to notify you when time's up and a few minutes before fixed times. You can turn that on, leave it for now (it asks again the next day), or tell it not to ask again. There's a switch in Settings either way, and a choice of how early the heads-up comes (5, 10 or 15 minutes, or none). With the app open, the heads-up is a soft chime and a banner at the top.
- **Fix the record.** Forgot to tap Start, or tapped Done long after you'd finished? Open the task and move when it started or finished on a strip of time; it says how the rest of the day would move, and Save applies it. Done on a task well over time asks whether you finished when time was up, and the day hours let you move when the day started.
- **Ended days are a record.** Once you've ended a day you can look back at it, but not change or reorder it. Today can be reopened if you ended it too soon.
- **Opens at once, always the latest version.** The app opens straight from your device, whatever the connection. As it opens, and when you come back to it, it checks whether a newer version is out and reloads onto it at the first quiet moment, so a copy on your Home Screen never falls behind.
- **Your plan on every device.** Elastic starts with signing in: type your email and you get a six-digit code (the same code makes your account the first time). Sign in on your phone and your computer and you have the same plan on both; a change on one shows up on the others straight away. A new account asks for your name, then offers a passkey (Face ID, Touch ID or your device's screen lock) to sign in quickly; a code to your email always works too. There's no password. Change your name or email at the top of Settings, and see or remove your passkeys under _Sync across devices_, where you can also sign out every other device at once. Changing your email tells the old address and signs you out on your other devices. Changes made offline go up when you're back online, and if two devices change the same day at once, both changes are kept, field by field: a task ticked on your phone and another renamed on your computer both stay, and if both change the same thing, the later change wins. Pull down at the top of the plan to sync right then. Theme, sound and notifications stay set per device.
- **Project cards from Boardo.** If your email has a [Boardo](https://boardo.kaiserkhan.com/) account (a shared project boards app), Elastic offers to show your cards and one tap does it; a Boardo account with another email connects in Settings → _Projects_. The cards assigned to you there show in a folding _Projects_ section on the days they cover (an overdue one stays every day until your part is done or the card is completed). Start one and it counts up with no time limit, sets the card to In progress in Boardo and logs the time you work on it there; Done marks your part done. Starting something else, or ending your day, only sets it aside. The link belongs to your account, so every device you sign in on has it, and changes in Boardo show within seconds.
- **Install it.** Settings has an _Install_ button in browsers that support it (Chrome, Edge, Samsung Internet), and short instructions for Safari on iPhone, iPad and Mac. Installed, it opens from its own icon in its own window. On iPhone and iPad this is also what makes notifications possible.

## Your data

Your plan (days, repeating tasks and the settings for how your days work) is stored with your account on Cloudflare, so your other devices can get it. Each device also keeps its own full copy in the browser (IndexedDB) and works offline; signing in is the only step that needs a connection. Settings → _Your data_ exports a backup file and imports it again. Signing out leaves that copy where it is; deleting the account removes the account's copy and leaves each device's. The account holds your name and email and your passkeys' public keys, and no password. Sign-in codes are emailed through [Resend](https://resend.com).

Notifications while the app is closed (see below) need the push service to know _when_ to ring (your timer running out, a fixed time coming up). Without an account that's all it's told; with one, the account also says what each notification is for, since another device may have changed the plan.

## Development

Needs Node 20.19+ (or 22.12+) to build. The worker's tests run on `node:sqlite`, so `npm test` needs Node 22.13 or newer (CI uses Node 24).

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # unit and integration tests (Vitest)
npm run check      # type-check the Svelte and TypeScript code
npm run format     # Prettier
npm run build      # production build in dist/
npm run preview    # serve the build at http://localhost:4173/
```

Built with Svelte 5, TypeScript and Vite. The only things shipped besides the app's own code are the Instrument Sans and Space Grotesk fonts, [SimpleWebAuthn](https://simplewebauthn.dev)'s browser helpers for passkeys, and about 90 icons from [Lucide](https://lucide.dev) (ISC licence, kept in `src/lib/icons.ts`) for checks and habits.

### Layout

```
src/
  lib/
    schedule.ts        works out every item's start and end from the list (the core of the app)
    today.ts           which day counts as Today, including after midnight
    actions.ts         every change to a day as a pure function: start, pause, postpone, reorder…
    planner.svelte.ts  app state: the loaded days, the clock, what's open, saving, notifications
    db.ts              IndexedDB: one record per day, repeating series, goal, review, settings, and what's still to sync
    repeat.ts          repeat rules and building days from repeating tasks
    rows.ts            what each timeline row looks like at a given moment
    drag.ts            reordering tasks by dragging
    gestures.svelte.ts swiping between days and pulling to refresh
    backup.ts          export, and checking files on import
    account.ts         making an account and signing in (email codes, passkeys)
    sync.ts            keeping this device's plan and the account's the same
shared/
  lww.ts               records as fields with the moment each was set: the latest wins, on every device and the account
    push.ts            booking time's-up pushes with the push worker
    install.svelte.ts  the browser's install prompt
  components/          the screens and sheets
  sw.js                service worker: opening the app from the device (offline too), and showing pushed notifications
worker/                Cloudflare Worker: notification pushes, accounts and sync
public/                icons, web app manifest, _headers (cache rules, security headers)
scripts/deploy.sh      test, build and deploy the worker with the app
```

A few rules the code sticks to:

- Start and end times are never stored. `schedule()` recomputes them on every tick from the order of the list, durations, fixed times and the timer timestamps.
- Times are minutes since midnight of the item's day (570 is 9:30 am), which keeps the scheduling maths simple and lets a running timer survive a reload. A late night keeps counting past 1440, so 1:30 am after a Friday is Friday's minute 1530.
- A day that hasn't been touched isn't stored; it's built from your repeating tasks when you look at it.

## Notifications while the app is closed

A web page can only ring while it's running, and phones pause pages as soon as they're locked or in the background. So when Elastic goes into the background, it books pushes with a small [Cloudflare Worker](worker/) for the moment a running timer runs out and for each heads-up before a fixed time, and cancels them when you come back. The pushes are empty: the app's service worker shows the notification and reads what to say from the browser's own storage. The worker only ever holds a push address and some times.

Signed in, the account does the booking instead: the open device keeps it up to date with what's coming, and when a notification is due, every device of the account with notifications on gets a push, except one that has the app open in front of you (it rings by itself).

Without the worker configured, there are no accounts: the app opens straight to the plan, which stays in the browser only, and notifications still work whenever the page is running (on a desktop, that includes background tabs).

To run your own:

```bash
node worker/scripts/vapid-keys.mjs                # prints a key pair
# put the public key in worker/wrangler.toml (VAPID_PUBLIC_KEY) and .env.production (VITE_VAPID_PUBLIC_KEY)
cd worker                                         # Wrangler needs Node 22+
npx wrangler secret put VAPID_PRIVATE_KEY         # paste the private key
npx wrangler d1 create elastic-day                # put its database_id in wrangler.toml
npx wrangler d1 migrations apply elastic-day --remote
npx wrangler deploy
```

Then set `VITE_PUSH_URL` in `.env.production` to the worker's address and add your site's origin to `ALLOWED_ORIGINS` in `worker/wrangler.toml` (local addresses go in `worker/.dev.vars`; see `worker/README.md`). Passkeys belong to the site they were made on, so accounts work on the origins listed there.

## Deploying the site

The worker in `worker/` serves the built app as well as its API (under `/api`), so the app and the server go out together. `npm run deploy` runs the tests and checks, builds, and deploys the worker with `wrangler deploy` (Node 22 or newer). Point its `routes` in `worker/wrangler.toml` at your own domain, set `VITE_PUSH_URL` in `.env.production` to `https://<that domain>/api`, and list the domain in `ALLOWED_ORIGINS`. `RP_ID` is the domain passkeys belong to; set it to your site's registrable domain, or leave it out to use each page's own host.

Without the worker, the app is plain static files and can go on any web host at the root of a domain (`npm run build`, then copy `dist/`).

## License

[MIT](LICENSE) © Qaisar Khan
