// Icons for checks and habits, picked from the title (iconFor) unless one was chosen in Edit
// (Item.icon). Nothing to store for the automatic ones, so entries made before icons existed
// get theirs too, and renaming one picks again.
//
// The shapes are from Lucide 0.544.0 (https://lucide.dev), drawn on a 24 px grid with a 2 px
// round stroke and no fill. Lucide's licence:
//
// ISC License
//
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT).
// All other copyright (c) for Lucide are held by Lucide Contributors 2025.
//
// Permission to use, copy, modify, and/or distribute this software for any purpose with or
// without fee is hereby granted, provided that the above copyright notice and this permission
// notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
// SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
// AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
// NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
// PERFORMANCE OF THIS SOFTWARE.
//
// The MIT License (MIT) (for portions derived from Feather)
//
// Copyright (c) 2013-2023 Cole Bemis
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software
// and associated documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or
// substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/** An icon's shapes: each element's tag and attributes. */
export type IconNode = [tag: string, attrs: Record<string, string>][];

export const ICONS = {
  activity: [
    [
      'path',
      {
        d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
      },
    ],
  ],
  'alarm-clock': [
    ['circle', { cx: '12', cy: '13', r: '8' }],
    ['path', { d: 'M12 9v4l2 2' }],
    ['path', { d: 'M5 3 2 6' }],
    ['path', { d: 'm22 6-3-3' }],
    ['path', { d: 'M6.38 18.7 4 21' }],
    ['path', { d: 'M17.64 18.67 20 21' }],
  ],
  apple: [
    ['path', { d: 'M12 6.528V3a1 1 0 0 1 1-1h0' }],
    [
      'path',
      {
        d: 'M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21',
      },
    ],
  ],
  baby: [
    ['path', { d: 'M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5' }],
    ['path', { d: 'M15 12h.01' }],
    [
      'path',
      {
        d: 'M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1',
      },
    ],
    ['path', { d: 'M9 12h.01' }],
  ],
  bath: [
    ['path', { d: 'M10 4 8 6' }],
    ['path', { d: 'M17 19v2' }],
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'M7 19v2' }],
    ['path', { d: 'M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5' }],
  ],
  bed: [
    ['path', { d: 'M2 4v16' }],
    ['path', { d: 'M2 8h18a2 2 0 0 1 2 2v10' }],
    ['path', { d: 'M2 17h20' }],
    ['path', { d: 'M6 8v9' }],
  ],
  bike: [
    ['circle', { cx: '18.5', cy: '17.5', r: '3.5' }],
    ['circle', { cx: '5.5', cy: '17.5', r: '3.5' }],
    ['circle', { cx: '15', cy: '5', r: '1' }],
    ['path', { d: 'M12 17.5V14l-3-3 4-3 2 3h2' }],
  ],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    [
      'path',
      {
        d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
      },
    ],
  ],
  brain: [
    ['path', { d: 'M12 18V5' }],
    ['path', { d: 'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4' }],
    ['path', { d: 'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5' }],
    ['path', { d: 'M17.997 5.125a4 4 0 0 1 2.526 5.77' }],
    ['path', { d: 'M18 18a4 4 0 0 0 2-7.464' }],
    ['path', { d: 'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517' }],
    ['path', { d: 'M6 18a4 4 0 0 1-2-7.464' }],
    ['path', { d: 'M6.003 5.125a4 4 0 0 0-2.526 5.77' }],
  ],
  briefcase: [
    ['path', { d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }],
    ['rect', { width: '20', height: '14', x: '2', y: '6', rx: '2' }],
  ],
  'brush-cleaning': [
    ['path', { d: 'm16 22-1-4' }],
    [
      'path',
      {
        d: 'M19 13.99a1 1 0 0 0 1-1V12a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v.99a1 1 0 0 0 1 1',
      },
    ],
    ['path', { d: 'M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z' }],
    ['path', { d: 'm8 22 1-4' }],
  ],
  calculator: [
    ['rect', { width: '16', height: '20', x: '4', y: '2', rx: '2' }],
    ['line', { x1: '8', x2: '16', y1: '6', y2: '6' }],
    ['line', { x1: '16', x2: '16', y1: '14', y2: '18' }],
    ['path', { d: 'M16 10h.01' }],
    ['path', { d: 'M12 10h.01' }],
    ['path', { d: 'M8 10h.01' }],
    ['path', { d: 'M12 14h.01' }],
    ['path', { d: 'M8 14h.01' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M8 18h.01' }],
  ],
  calendar: [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
  ],
  camera: [
    [
      'path',
      {
        d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
      },
    ],
    ['circle', { cx: '12', cy: '13', r: '3' }],
  ],
  candy: [
    ['path', { d: 'M10 7v10.9' }],
    ['path', { d: 'M14 6.1V17' }],
    [
      'path',
      {
        d: 'M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4',
      },
    ],
    ['path', { d: 'M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07' }],
    [
      'path',
      {
        d: 'M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4',
      },
    ],
  ],
  car: [
    [
      'path',
      {
        d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
      },
    ],
    ['circle', { cx: '7', cy: '17', r: '2' }],
    ['path', { d: 'M9 17h6' }],
    ['circle', { cx: '17', cy: '17', r: '2' }],
  ],
  cat: [
    [
      'path',
      {
        d: 'M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z',
      },
    ],
    ['path', { d: 'M8 14v.5' }],
    ['path', { d: 'M16 14v.5' }],
    ['path', { d: 'M11.25 16.25h1.5L12 17l-.75-.75Z' }],
  ],
  'chart-line': [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'm19 9-5 5-4-4-3 3' }],
  ],
  'chef-hat': [
    [
      'path',
      {
        d: 'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z',
      },
    ],
    ['path', { d: 'M6 17h12' }],
  ],
  cigarette: [
    ['path', { d: 'M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14' }],
    ['path', { d: 'M18 8c0-2.5-2-2.5-2-5' }],
    ['path', { d: 'M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' }],
    ['path', { d: 'M22 8c0-2.5-2-2.5-2-5' }],
    ['path', { d: 'M7 12v4' }],
  ],
  'circle-dot': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['circle', { cx: '12', cy: '12', r: '1' }],
  ],
  coffee: [
    ['path', { d: 'M10 2v2' }],
    ['path', { d: 'M14 2v2' }],
    ['path', { d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1' }],
    ['path', { d: 'M6 2v2' }],
  ],
  'credit-card': [
    ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '2' }],
    ['line', { x1: '2', x2: '22', y1: '10', y2: '10' }],
  ],
  dog: [
    ['path', { d: 'M11.25 16.25h1.5L12 17z' }],
    ['path', { d: 'M16 14v.5' }],
    [
      'path',
      {
        d: 'M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309',
      },
    ],
    ['path', { d: 'M8 14v.5' }],
    [
      'path',
      {
        d: 'M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5',
      },
    ],
  ],
  droplet: [
    [
      'path',
      { d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' },
    ],
  ],
  droplets: [
    [
      'path',
      {
        d: 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z',
      },
    ],
    ['path', { d: 'M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97' }],
  ],
  dumbbell: [
    [
      'path',
      {
        d: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
      },
    ],
    ['path', { d: 'm2.5 21.5 1.4-1.4' }],
    ['path', { d: 'm20.1 3.9 1.4-1.4' }],
    [
      'path',
      {
        d: 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
      },
    ],
    ['path', { d: 'm9.6 14.4 4.8-4.8' }],
  ],
  eye: [
    [
      'path',
      { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  'file-text': [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  footprints: [
    [
      'path',
      {
        d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
      },
    ],
    [
      'path',
      {
        d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
      },
    ],
    ['path', { d: 'M16 17h4' }],
    ['path', { d: 'M4 13h4' }],
  ],
  'gamepad-2': [
    ['line', { x1: '6', x2: '10', y1: '11', y2: '11' }],
    ['line', { x1: '8', x2: '8', y1: '9', y2: '13' }],
    ['line', { x1: '15', x2: '15.01', y1: '12', y2: '12' }],
    ['line', { x1: '18', x2: '18.01', y1: '10', y2: '10' }],
    [
      'path',
      {
        d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
      },
    ],
  ],
  gift: [
    ['rect', { x: '3', y: '8', width: '18', height: '4', rx: '1' }],
    ['path', { d: 'M12 8v13' }],
    ['path', { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' }],
    ['path', { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' }],
  ],
  'glass-water': [
    [
      'path',
      {
        d: 'M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z',
      },
    ],
    ['path', { d: 'M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0' }],
  ],
  'graduation-cap': [
    [
      'path',
      {
        d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
      },
    ],
    ['path', { d: 'M22 10v6' }],
    ['path', { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }],
  ],
  hand: [
    ['path', { d: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2' }],
    ['path', { d: 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2' }],
    ['path', { d: 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8' }],
    [
      'path',
      { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' },
    ],
  ],
  headphones: [
    [
      'path',
      {
        d: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
      },
    ],
  ],
  heart: [
    [
      'path',
      {
        d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
      },
    ],
  ],
  'heart-pulse': [
    [
      'path',
      {
        d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
      },
    ],
    ['path', { d: 'M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27' }],
  ],
  house: [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    [
      'path',
      { d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    ],
  ],
  landmark: [
    ['path', { d: 'M10 18v-7' }],
    [
      'path',
      { d: 'M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z' },
    ],
    ['path', { d: 'M14 18v-7' }],
    ['path', { d: 'M18 18v-7' }],
    ['path', { d: 'M3 22h18' }],
    ['path', { d: 'M6 18v-7' }],
  ],
  languages: [
    ['path', { d: 'm5 8 6 6' }],
    ['path', { d: 'm4 14 6-6 2-3' }],
    ['path', { d: 'M2 5h12' }],
    ['path', { d: 'M7 2h1' }],
    ['path', { d: 'm22 22-5-10-5 10' }],
    ['path', { d: 'M14 18h6' }],
  ],
  laptop: [
    [
      'path',
      {
        d: 'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z',
      },
    ],
    ['path', { d: 'M20.054 15.987H3.946' }],
  ],
  leaf: [
    ['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }],
    ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }],
  ],
  lightbulb: [
    [
      'path',
      { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' },
    ],
    ['path', { d: 'M9 18h6' }],
    ['path', { d: 'M10 22h4' }],
  ],
  'list-checks': [
    ['path', { d: 'M13 5h8' }],
    ['path', { d: 'M13 12h8' }],
    ['path', { d: 'M13 19h8' }],
    ['path', { d: 'm3 17 2 2 4-4' }],
    ['path', { d: 'm3 7 2 2 4-4' }],
  ],
  mail: [
    ['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }],
    ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
  ],
  'map-pin': [
    [
      'path',
      { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' },
    ],
    ['circle', { cx: '12', cy: '10', r: '3' }],
  ],
  megaphone: [
    [
      'path',
      {
        d: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
      },
    ],
    ['path', { d: 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14' }],
    ['path', { d: 'M8 6v8' }],
  ],
  'message-circle': [
    [
      'path',
      {
        d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
      },
    ],
  ],
  mic: [
    ['path', { d: 'M12 19v3' }],
    ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }],
    ['rect', { x: '9', y: '2', width: '6', height: '13', rx: '3' }],
  ],
  moon: [
    [
      'path',
      {
        d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
      },
    ],
  ],
  'moon-star': [
    ['path', { d: 'M18 5h4' }],
    ['path', { d: 'M20 3v4' }],
    [
      'path',
      {
        d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
      },
    ],
  ],
  music: [
    ['path', { d: 'M9 18V5l12-2v13' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
    ['circle', { cx: '18', cy: '16', r: '3' }],
  ],
  package: [
    [
      'path',
      {
        d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
      },
    ],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
  palette: [
    [
      'path',
      {
        d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
      },
    ],
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  'pen-line': [
    ['path', { d: 'M13 21h8' }],
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
  ],
  'person-standing': [
    ['circle', { cx: '12', cy: '5', r: '1' }],
    ['path', { d: 'm9 20 3-6 3 6' }],
    ['path', { d: 'm6 8 6 2 6-2' }],
    ['path', { d: 'M12 10v4' }],
  ],
  phone: [
    [
      'path',
      {
        d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
      },
    ],
  ],
  'piggy-bank': [
    [
      'path',
      {
        d: 'M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z',
      },
    ],
    ['path', { d: 'M16 10h.01' }],
    ['path', { d: 'M2 8v1a2 2 0 0 0 2 2h1' }],
  ],
  pill: [
    ['path', { d: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z' }],
    ['path', { d: 'm8.5 8.5 7 7' }],
  ],
  'pill-bottle': [
    ['path', { d: 'M18 11h-4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4' }],
    ['path', { d: 'M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7' }],
    ['rect', { width: '16', height: '5', x: '4', y: '2', rx: '1' }],
  ],
  pipette: [
    [
      'path',
      {
        d: 'm12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12',
      },
    ],
    ['path', { d: 'm18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z' }],
    ['path', { d: 'm2 22 .414-.414' }],
  ],
  plane: [
    [
      'path',
      {
        d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
      },
    ],
  ],
  presentation: [
    ['path', { d: 'M2 3h20' }],
    ['path', { d: 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3' }],
    ['path', { d: 'm7 21 5-5 5 5' }],
  ],
  receipt: [
    ['path', { d: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z' }],
    ['path', { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' }],
    ['path', { d: 'M12 17.5v-11' }],
  ],
  salad: [
    ['path', { d: 'M7 21h10' }],
    ['path', { d: 'M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z' }],
    [
      'path',
      {
        d: 'M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1',
      },
    ],
    ['path', { d: 'm13 12 4-4' }],
    ['path', { d: 'M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2' }],
  ],
  scissors: [
    ['circle', { cx: '6', cy: '6', r: '3' }],
    ['path', { d: 'M8.12 8.12 12 12' }],
    ['path', { d: 'M20 4 8.12 15.88' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
    ['path', { d: 'M14.8 14.8 20 20' }],
  ],
  shirt: [
    [
      'path',
      {
        d: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
      },
    ],
  ],
  'shopping-cart': [
    ['circle', { cx: '8', cy: '21', r: '1' }],
    ['circle', { cx: '19', cy: '21', r: '1' }],
    ['path', { d: 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12' }],
  ],
  smartphone: [
    ['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }],
    ['path', { d: 'M12 18h.01' }],
  ],
  smile: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }],
    ['line', { x1: '9', x2: '9.01', y1: '9', y2: '9' }],
    ['line', { x1: '15', x2: '15.01', y1: '9', y2: '9' }],
  ],
  'soap-dispenser-droplet': [
    ['path', { d: 'M10.5 2v4' }],
    ['path', { d: 'M14 2H7a2 2 0 0 0-2 2' }],
    [
      'path',
      {
        d: 'M19.29 14.76A6.67 6.67 0 0 1 17 11a6.6 6.6 0 0 1-2.29 3.76c-1.15.92-1.71 2.04-1.71 3.19 0 2.22 1.8 4.05 4 4.05s4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19',
      },
    ],
    ['path', { d: 'M9.607 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h7V7a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3' }],
  ],
  'spray-can': [
    ['path', { d: 'M3 3h.01' }],
    ['path', { d: 'M7 5h.01' }],
    ['path', { d: 'M11 7h.01' }],
    ['path', { d: 'M3 7h.01' }],
    ['path', { d: 'M7 9h.01' }],
    ['path', { d: 'M3 11h.01' }],
    ['rect', { width: '4', height: '4', x: '15', y: '5' }],
    ['path', { d: 'm19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2' }],
    ['path', { d: 'm13 14 8-2' }],
    ['path', { d: 'm13 19 8-2' }],
  ],
  sprout: [
    [
      'path',
      { d: 'M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3' },
    ],
    ['path', { d: 'M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4' }],
    ['path', { d: 'M5 21h14' }],
  ],
  stethoscope: [
    ['path', { d: 'M11 2v2' }],
    ['path', { d: 'M5 2v2' }],
    ['path', { d: 'M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1' }],
    ['path', { d: 'M8 15a6 6 0 0 0 12 0v-3' }],
    ['circle', { cx: '20', cy: '10', r: '2' }],
  ],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }],
  ],
  syringe: [
    ['path', { d: 'm18 2 4 4' }],
    ['path', { d: 'm17 7 3-3' }],
    ['path', { d: 'M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5' }],
    ['path', { d: 'm9 11 4 4' }],
    ['path', { d: 'm5 19-3 3' }],
    ['path', { d: 'm14 4 6 6' }],
  ],
  target: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['circle', { cx: '12', cy: '12', r: '6' }],
    ['circle', { cx: '12', cy: '12', r: '2' }],
  ],
  thermometer: [['path', { d: 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' }]],
  'trash-2': [
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
  ],
  trees: [
    ['path', { d: 'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z' }],
    ['path', { d: 'M7 16v6' }],
    ['path', { d: 'M13 19v3' }],
    ['path', { d: 'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5' }],
  ],
  tv: [
    ['path', { d: 'm17 2-5 5-5-5' }],
    ['rect', { width: '20', height: '15', x: '2', y: '7', rx: '2' }],
  ],
  users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
  ],
  utensils: [
    ['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }],
    ['path', { d: 'M7 2v20' }],
    ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }],
  ],
  video: [
    ['path', { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }],
    ['rect', { x: '2', y: '6', width: '14', height: '12', rx: '2' }],
  ],
  wallet: [
    [
      'path',
      {
        d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
      },
    ],
    ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
  ],
  waves: [
    ['path', { d: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
    ['path', { d: 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
    ['path', { d: 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
  ],
  weight: [
    ['circle', { cx: '12', cy: '5', r: '3' }],
    [
      'path',
      { d: 'M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z' },
    ],
  ],
  wine: [
    ['path', { d: 'M8 22h8' }],
    ['path', { d: 'M7 10h10' }],
    ['path', { d: 'M12 15v7' }],
    ['path', { d: 'M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z' }],
  ],
  wrench: [
    [
      'path',
      {
        d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
      },
    ],
  ],
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** For a title that matches nothing: the dot that marks a task elsewhere, in a ring. */
export const DEFAULT_ICON: IconName = 'circle-dot';

/**
 * Words in a title, and the icon each calls for. Earlier rows win, so the specific ones (things,
 * places, medicines) come before the general ones (verbs like call, write, read). A word also
 * matches with an s or es on the end; a row's phrases ("wash face") match as whole words.
 */
const WORDS: [IconName, string[]][] = [
  [
    'pill',
    [
      'pill',
      'tablet',
      'meds',
      'medicine',
      'medication',
      'epuris',
      'isotretinoin',
      'accutane',
      'antibiotic',
      'ibuprofen',
      'paracetamol',
      'aspirin',
      'capsule',
    ],
  ],
  [
    'pill-bottle',
    ['supplement', 'vitamin', 'multivitamin', 'omega', 'magnesium', 'creatine', 'prescription', 'pharmacy'],
  ],
  ['pipette', ['minoxidil', 'dropper', 'serum', 'tincture', 'retinol', 'tretinoin']],
  ['syringe', ['injection', 'insulin', 'vaccine', 'jab', 'blood test']],
  ['stethoscope', ['doctor', 'gp', 'dentist', 'checkup', 'check-up', 'physio', 'therapist', 'clinic', 'hospital']],
  ['heart-pulse', ['blood pressure', 'heart rate', 'cardio']],
  ['thermometer', ['temperature', 'fever']],
  ['weight', ['weigh', 'weight', 'weigh in', 'scale']],
  ['eye', ['eye', 'contact lens', 'lens', 'optician']],
  ['smile', ['face', 'skincare', 'skin', 'teeth', 'tooth', 'floss', 'brush teeth', 'smile']],
  ['soap-dispenser-droplet', ['soap', 'cleanser', 'wash hands', 'handwash']],
  ['droplets', ['moisturise', 'moisturize', 'moisturiser', 'moisturizer', 'lotion', 'cream', 'sunscreen', 'spf']],
  ['droplet', ['oil', 'drops', 'oiling']],
  ['scissors', ['haircut', 'barber', 'trim', 'nails', 'shave']],
  ['hand', ['massage']],
  ['bath', ['shower', 'bath', 'bathe']],
  ['bed', ['sleep', 'bed', 'nap', 'bedtime', 'lights out']],
  ['alarm-clock', ['wake', 'wake up', 'alarm']],
  [
    'moon-star',
    [
      'pray',
      'prayer',
      'salah',
      'salat',
      'namaz',
      'quran',
      'fajr',
      'dhuhr',
      'zuhr',
      'asr',
      'maghrib',
      'isha',
      'dua',
      'dhikr',
      'tahajjud',
      'church',
      'mass',
      'bible',
    ],
  ],
  ['brain', ['meditate', 'meditation', 'mindfulness', 'breathe', 'breathing', 'therapy', 'gratitude']],
  ['glass-water', ['water', 'hydrate', 'hydration', 'glass']],
  ['coffee', ['coffee', 'tea', 'latte', 'espresso', 'matcha']],
  ['wine', ['alcohol', 'wine', 'beer', 'drinking']],
  ['cigarette', ['smoke', 'smoking', 'cigarette', 'vape', 'vaping', 'nicotine']],
  ['candy', ['sugar', 'sweets', 'candy', 'chocolate', 'dessert', 'junk food']],
  ['salad', ['salad', 'vegetable', 'veggie', 'greens']],
  ['apple', ['fruit', 'snack', 'apple', 'diet', 'calorie', 'protein']],
  ['chef-hat', ['cook', 'cooking', 'recipe', 'meal prep', 'bake', 'baking']],
  ['utensils', ['breakfast', 'lunch', 'dinner', 'brunch', 'eat', 'meal', 'food', 'supper', 'iftar', 'suhoor', 'sehri']],
  ['shopping-cart', ['groceries', 'grocery', 'supermarket', 'shopping', 'shop']],
  ['dog', ['dog', 'puppy', 'vet']],
  ['cat', ['cat', 'kitten', 'litter']],
  ['baby', ['baby', 'kid', 'child', 'children', 'school run', 'nursery', 'daycare']],
  [
    'dumbbell',
    [
      'gym',
      'workout',
      'weights',
      'lift',
      'lifting',
      'strength',
      'exercise',
      'training',
      'push-up',
      'pushup',
      'squat',
      'plank',
    ],
  ],
  ['activity', ['run', 'running', 'jog', 'jogging', 'hiit', 'sprint', 'marathon']],
  ['person-standing', ['yoga', 'stretch', 'stretching', 'posture', 'pilates', 'mobility']],
  ['footprints', ['walk', 'walking', 'steps', 'hike', 'hiking']],
  ['bike', ['bike', 'cycle', 'cycling', 'spin', 'bicycle']],
  ['waves', ['swim', 'swimming', 'pool']],
  ['gift', ['birthday', 'gift', 'present', 'anniversary']],
  ['heart', ['date night', 'date', 'partner', 'wife', 'husband', 'mum', 'mom', 'dad', 'parents', 'family', 'love']],
  [
    'graduation-cap',
    [
      'study',
      'class',
      'course',
      'lecture',
      'homework',
      'exam',
      'revise',
      'revision',
      'msc',
      'degree',
      'module',
      'assignment',
      'coursera',
      'udemy',
      'scrimba',
      'edx',
      'tutorial',
      'lesson',
      'school',
      'university',
      'uni',
    ],
  ],
  ['languages', ['language', 'spanish', 'french', 'german', 'arabic', 'urdu', 'duolingo', 'vocab', 'vocabulary']],
  ['calculator', ['math', 'maths', 'mathematics', 'calculus', 'algebra', 'statistics', 'tax']],
  ['laptop', ['code', 'coding', 'programming', 'computer', 'laptop', 'website', 'app', 'deploy', 'bug']],
  ['video', ['video', 'zoom', 'record', 'recording', 'youtube', 'film', 'vlog', 'webinar']],
  ['presentation', ['presentation', 'slides', 'deck', 'pitch', 'demo']],
  [
    'users',
    ['meeting', 'team', 'standup', 'stand-up', 'one-on-one', '1:1', 'interview', 'group', 'workshop', 'networking'],
  ],
  ['mail', ['email', 'mail', 'inbox', 'newsletter']],
  ['message-circle', ['text', 'message', 'chat', 'reply', 'whatsapp', 'slack', 'dm']],
  ['phone', ['call', 'phone', 'ring']],
  ['megaphone', ['post', 'marketing', 'social', 'linkedin', 'tweet', 'twitter', 'announce', 'promote', 'ads']],
  ['camera', ['photo', 'picture', 'instagram', 'camera', 'shoot']],
  ['mic', ['podcast', 'voice', 'mic', 'sing', 'singing']],
  ['headphones', ['listen', 'audiobook', 'headphones']],
  ['music', ['music', 'guitar', 'piano', 'song', 'playlist', 'drums', 'violin']],
  ['palette', ['draw', 'drawing', 'paint', 'painting', 'art', 'design', 'sketch', 'illustration']],
  ['gamepad-2', ['game', 'gaming', 'chess', 'play']],
  ['tv', ['tv', 'netflix', 'movie', 'show', 'series', 'episode']],
  ['smartphone', ['screen time', 'scroll', 'scrolling', 'doomscroll', 'social media', 'phone-free']],
  [
    'file-text',
    [
      'report',
      'document',
      'doc',
      'proposal',
      'contract',
      'cv',
      'resume',
      'form',
      'paperwork',
      'application',
      'visa',
      'immigration',
    ],
  ],
  ['receipt', ['invoice', 'receipt', 'expense', 'expenses']],
  ['credit-card', ['pay', 'bill', 'payment', 'rent', 'subscription']],
  ['piggy-bank', ['save', 'saving', 'savings', 'invest', 'investing', 'pension']],
  ['wallet', ['budget', 'money', 'spend', 'spending', 'finance', 'finances']],
  ['landmark', ['bank', 'council', 'embassy', 'post office']],
  ['chart-line', ['analytics', 'metrics', 'stats', 'kpi', 'sales', 'revenue', 'numbers']],
  ['briefcase', ['work', 'office', 'job', 'client', 'business', 'shift']],
  ['shirt', ['laundry', 'ironing', 'iron', 'clothes', 'outfit', 'washing']],
  ['trash-2', ['trash', 'bin', 'rubbish', 'garbage', 'recycling', 'declutter']],
  ['brush-cleaning', ['clean', 'cleaning', 'tidy', 'dust', 'vacuum', 'hoover', 'mop', 'dishes', 'chores']],
  ['spray-can', ['spray', 'disinfect']],
  ['wrench', ['fix', 'repair', 'maintenance', 'diy', 'plumber']],
  ['sprout', ['plant', 'garden', 'gardening', 'seeds']],
  ['trees', ['outside', 'outdoors', 'park', 'nature', 'fresh air']],
  ['leaf', ['vegan', 'detox', 'herbal']],
  ['car', ['car', 'drive', 'driving', 'commute', 'petrol', 'fuel', 'mot', 'parking']],
  ['plane', ['flight', 'fly', 'travel', 'trip', 'airport', 'holiday', 'vacation', 'pack', 'packing']],
  ['package', ['parcel', 'package', 'delivery', 'return', 'returns', 'ship', 'shipping']],
  ['map-pin', ['errand', 'visit', 'pick up', 'drop off', 'collect']],
  ['house', ['home', 'house', 'flat', 'apartment', 'move']],
  ['sun', ['morning', 'sunlight', 'sunrise']],
  ['moon', ['night', 'evening', 'wind down', 'unwind']],
  ['calendar', ['plan', 'planning', 'schedule', 'appointment', 'calendar', 'book', 'booking']],
  ['list-checks', ['todo', 'to-do', 'tasks', 'checklist', 'review']],
  ['lightbulb', ['idea', 'brainstorm', 'think', 'research', 'learn']],
  ['target', ['goal', 'focus', 'deep work', 'okr']],
  ['book-open', ['read', 'reading', 'book', 'chapter', 'novel', 'kindle', 'notes']],
  ['pen-line', ['write', 'writing', 'journal', 'diary', 'blog', 'essay', 'draft', 'edit']],
];

const word = (w: string) => w.toLowerCase().replace(/[’']/g, '');
const SINGLE = new Map<string, IconName>();
const PHRASES: [string, IconName][] = [];
for (const [icon, words] of WORDS)
  for (const w of words.map(word)) {
    if (/\s/.test(w)) PHRASES.push([w, icon]);
    else if (!SINGLE.has(w)) SINGLE.set(w, icon);
  }
const RANK = new Map(WORDS.map(([icon], i) => [icon, i]));

/** The icon a title calls for: the first row of WORDS any of its words match, else the default. */
export function iconFor(title: string): IconName {
  const t = word(title)
    .replace(/[^a-z0-9:+-]+/g, ' ')
    .trim();
  const padded = ` ${t} `;
  let best: IconName | null = null;
  const consider = (icon: IconName | undefined) => {
    if (icon && (best == null || RANK.get(icon)! < RANK.get(best)!)) best = icon;
  };
  for (const [p, icon] of PHRASES) if (padded.includes(` ${p} `)) consider(icon);
  for (const w of t.split(' ')) {
    consider(SINGLE.get(w));
    if (w.length > 3 && w.endsWith('s')) consider(SINGLE.get(w.slice(0, -1)));
    if (w.length > 4 && w.endsWith('es')) consider(SINGLE.get(w.slice(0, -2)));
  }
  return best ?? DEFAULT_ICON;
}

export const isIcon = (v: unknown): v is IconName => typeof v === 'string' && Object.hasOwn(ICONS, v);

/** An entry's icon: the one chosen for it, else the one its title calls for. */
export const iconOf = (it: { icon?: string | null; title: string }): IconName =>
  isIcon(it.icon) ? it.icon : iconFor(it.title);

/** The icons to choose from in Edit, grouped. */
export const ICON_GROUPS: [string, IconName[]][] = [
  [
    'Health',
    [
      'pill',
      'pill-bottle',
      'pipette',
      'syringe',
      'stethoscope',
      'heart-pulse',
      'thermometer',
      'weight',
      'eye',
      'smile',
      'soap-dispenser-droplet',
      'droplets',
      'droplet',
      'scissors',
      'hand',
      'bath',
      'bed',
      'alarm-clock',
      'brain',
      'moon-star',
    ],
  ],
  [
    'Food and drink',
    ['glass-water', 'coffee', 'utensils', 'chef-hat', 'apple', 'salad', 'candy', 'wine', 'cigarette', 'shopping-cart'],
  ],
  ['Moving', ['dumbbell', 'activity', 'person-standing', 'footprints', 'bike', 'waves', 'trees']],
  [
    'Work and study',
    [
      'briefcase',
      'laptop',
      'graduation-cap',
      'book-open',
      'pen-line',
      'languages',
      'calculator',
      'file-text',
      'presentation',
      'users',
      'video',
      'mail',
      'message-circle',
      'phone',
      'chart-line',
      'megaphone',
      'lightbulb',
      'target',
      'list-checks',
      'calendar',
    ],
  ],
  ['Money', ['wallet', 'credit-card', 'receipt', 'piggy-bank', 'landmark']],
  [
    'Home and life',
    [
      'house',
      'brush-cleaning',
      'spray-can',
      'shirt',
      'trash-2',
      'wrench',
      'sprout',
      'leaf',
      'dog',
      'cat',
      'baby',
      'heart',
      'gift',
      'car',
      'plane',
      'package',
      'map-pin',
      'smartphone',
    ],
  ],
  ['Free time', ['music', 'mic', 'headphones', 'camera', 'palette', 'gamepad-2', 'tv', 'sun', 'moon', 'circle-dot']],
];
