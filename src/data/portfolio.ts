// Single source of truth for site content. Every line here traces to
// Anmol_Agarwal_Resume.tex (Sep 2026) or a public README on
// github.com/iAnmolAgarwal — no invention.

export const person = {
  name: 'Anmol Agarwal',
  handle: 'anmol@portfolio',
  tagline:
    'Third-year CS student at JIIT Noida. I like to compete and develop solutions in hackathons. Competitive Programmer (C++).',
  lede:
    'is a third-year CS student at JIIT Noida. He likes to compete and develop solutions in hackathons, and is a competitive programmer (C++).',
  now: 'Student Placement Coordinator at JIIT since Aug 2026; most recent result #6 of 3,062 (top 0.2%) at HackerRank Orchestrate (Sep 2026).',
  location: 'Noida, India',
  availability: 'open to internships (summer 2027)',
  availabilityShort: 'open to internships',
  email: 'anmolagarwal2625@gmail.com',
  resumePath: '/anmol-agarwal-resume.pdf',
};

export type Achievement = { label: string; text: string };

export const achievements: Achievement[] = [
  {
    label: 'HCLTech AMPLIfied (Season 1)',
    text: 'National hackathon winner — #1 overall among 4,500+ participants from 97 colleges; scored 100.00 on the Round 1 ML leaderboard.',
  },
  {
    label: 'HackerRank Orchestrate (24-hour global hackathon)',
    text: '#6 of 3,062 worldwide (top 0.2%) in September 2026, after #63 of 1,773 (top 3.6%) in June and #63 of 1,983 (top 3.2%) in August.',
  },
  {
    label: 'Amazon ML Challenge 2026',
    text: '#66 out of 10,000+ submissions (top 0.7%). Led Team Apprentice through a 72-hour business entity-resolution problem; public leaderboard macro F0.5 0.9902.',
  },
  {
    label: 'KIET CODE RUSH 3.0',
    text: '1st place at an offline inter-college programming contest (530+ registrations) — won a 32-team knockout and the top-3 final; prize INR 15,000.',
  },
  {
    label: 'IICPC',
    text: 'Top 16% of 13,800 registered at an offline international contest with candidates from IITs and NITs.',
  },
  {
    label: 'Research',
    text: 'Co-authored a manuscript on a low-cost IoT gas-sensor array for food-spoilage monitoring, under review at Sensors and Actuators Reports (Elsevier); wrote the C++ sensor firmware.',
  },
  {
    label: 'Leadership & certifications',
    text: 'Student Placement Coordinator, JIIT (Aug 2026 – present); Anthropic Claude Code 101.',
  },
];

export type Project = {
  slug: string;
  title: string;
  oneLiner: string;
  summary: string;
  highlights: string[];
  flags: string[];
  status: string;
  repo?: string; // omit for private work
  extra?: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    slug: 'pathwise',
    title: 'pathwise',
    oneLiner: 'AI-powered personalized learning path recommender',
    summary:
      'Turns a vague learning goal into an ordered, week-by-week plan sized to the hours a learner has. Ranked #1 of the 25 prototypes shortlisted to pitch at HCLTech AMPLIfied. Team entry (Team Apprentice).',
    highlights: [
      'The model runs the conversation; plain code picks and orders the courses, so every step can show why it is there.',
      'The prerequisite map was cross-checked against the question order of 2.1M Stack Overflow users.',
      'Spec written before any code; finished in two weeks.',
    ],
    flags: ['--nextjs', '--react', '--typescript', '--postgresql', '--python', '--claude-api'],
    status: 'shipped · hackathon winner',
    repo: 'https://github.com/iAnmolAgarwal/pathwise',
    extra: [{ label: 'live: trypathwise.vercel.app', href: 'https://trypathwise.vercel.app' }],
  },
  {
    slug: 'buy-or-wait',
    title: 'Buy or Wait?',
    oneLiner: 'affordability agent that answers "can I afford this?"',
    summary:
      'Answers "can I afford this?" from bank history, receipts and chat messages — the model only reads the documents; every amount, date and payment plan is computed in plain Python. #6 of 3,062 (top 0.2%) at HackerRank Orchestrate (September 2026, a 24-hour hackathon).',
    highlights: [
      'Built in 2h22m: the contract first, then eight Claude subagents directed against it.',
      'All 250 requests answered for $0.0139 each, with zero fallbacks or refused rows.',
    ],
    flags: ['--python', '--claude-api'],
    status: 'completed · hackathon',
    repo: 'https://github.com/iAnmolAgarwal/buy-or-wait',
  },
  {
    slug: 'business-entity-resolution',
    title: 'business-entity-resolution',
    oneLiner: 'matches the same business across messy data sources (Amazon ML Challenge 2026)',
    summary:
      'For each of 1.73M businesses, find every record in a pool of ~10M that is the same real business, despite typos, aliases, Indic-script names and missing addresses. #66 out of 10,000+ submissions (top 0.7%); team leader, Team Apprentice.',
    highlights: [
      'Worked out how the fake look-alike records were made (house number shifted by one of ten fixed steps, one extra word, a swapped legal form) and turned that into features that need no labels.',
      'Measured without labels that the test set had about twice as many look-alikes as training, and threw out any change that won cross-validation but added extra matches on test.',
      'France had no training labels (15% of test); its rules were set by training on one country and scoring the other.',
    ],
    flags: ['--python', '--lightgbm', '--multilingual-e5', '--entity-resolution'],
    status: 'completed · ML challenge (Sep 2026)',
    repo: 'https://github.com/iAnmolAgarwal/amazon-ml-challenge-2026',
  },
  {
    slug: 'jbites',
    title: 'jbites',
    oneLiner: 'food-ordering app for the campus cafe',
    summary:
      'Students order from their phones instead of queuing at the counter. Two concurrent buyers of the last item get exactly one order — a PostgreSQL function locks those rows FOR UPDATE first.',
    highlights: [
      'A mixed order is split the moment cooking starts, so the drink is handed over while the dish is still cooking.',
    ],
    flags: ['--typescript', '--react-native-expo', '--supabase', '--postgresql'],
    status: 'in development (Jun 2026 – present)',
    extra: [{ label: 'demo', href: 'https://jbites-ui-revamp.vercel.app' }],
  },
  {
    slug: 'thwip',
    title: 'thwip',
    oneLiner: 'browser game: swing through a procedurally generated comic-book city',
    summary:
      'Swing between the towers of a procedurally generated comic-book city on two ropes, in 90-second runs. The meshes, textures and sounds are generated in code; the repo ships no art or audio files for the game.',
    highlights: [
      'Ranking up raises the animation rate from 12 fps to 24 fps while the camera stays smooth — two clocks, one for motion and one for poses.',
      'The city is seeded: the same seed builds the same city on every machine.',
    ],
    flags: ['--typescript', '--threejs', '--webgl'],
    status: 'playable',
    repo: 'https://github.com/iAnmolAgarwal/thwip',
    extra: [{ label: 'play', href: 'https://ianmolagarwal.github.io/thwip/' }],
  },
  {
    slug: 'damage-claim-agent',
    title: 'damage-claim-agent',
    oneLiner: 'vision-language agent that verifies damage claims from photos',
    summary:
      'Solo submission to the HackerRank Orchestrate 24-hour AI-agent hackathon (June 2026) — #63 of 1,773 (top 3.6%). Two stages: a vision model reports structured findings, blind to the user’s claim history, and plain Python rules produce the verdict.',
    highlights: [
      'Images the model flags as carrying planted text are struck from the cited evidence.',
      'Reused-photo fraud caught with a perceptual hash (dhash).',
      'Every output row is a schema-validated 14-column record; about $0.64 per 44-claim batch.',
    ],
    flags: ['--python', '--claude-api', '--structured-output', '--prompt-injection-defense'],
    status: 'completed · hackathon',
    repo: 'https://github.com/iAnmolAgarwal/damage-claim-agent',
  },
  {
    slug: 'orb-trader',
    title: 'orb-trader',
    oneLiner: 'crash-safe NSE intraday opening-range-breakout system (paper-trading)',
    summary:
      'Opening-range breakout bot for NSE equities and index options against the Zerodha Kite Connect API — ORB + session VWAP + RSI gate, software-managed bracket orders, atomic state, crash reconciliation and hard risk limits (1% sizing, daily trade caps, −3% kill-switch, timed square-off). Paper-trading only; never traded real capital, no profit claims.',
    highlights: [
      '194-test suite, written test-first (TDD).',
      'Synthetic OCO brackets: the hard stop rests at the broker, the target is held in software and cancels the stop first; a late fill on either side is reconciled after the fact.',
      'Every trade transition persisted atomically (temp → fsync → rename); restart replays the broker order book through idempotent handlers.',
      'Diagnosed a concurrency freeze — a cross-thread WebSocket close swallowed by the reactor thread — by reproducing it as a failing regression test, then rebuilt reconnect as an atomic reactor-thread callback with exponential backoff.',
    ],
    flags: ['--python', '--kite-connect', '--websockets', '--tdd'],
    status: 'prototype · paper-trading',
    repo: 'https://github.com/iAnmolAgarwal/orb-trader',
  },
  {
    slug: 'smart-e-nose',
    title: 'smart-e-nose',
    oneLiner: 'low-cost ESP32 electronic nose for food-spoilage detection',
    summary:
      'A low-cost IoT device that sniffs for food spoilage with a four-sensor MQ gas array. Four-person course project; I wrote the ESP32 firmware and the cloud integration.',
    highlights: [
      '~920-line ESP32 firmware structured as a five-state sampling machine (IDLE → SEAL → MEASURE → PURGE → REFERENCE) with automatic baseline recalibration.',
      'Three cloud services — Blynk dashboard, ThingSpeak archive, Telegram alerts.',
      'Resolved an ESP32 ADC2/Wi-Fi conflict by remapping every sensor to ADC1.',
      'Manuscript under review at Sensors and Actuators Reports (Elsevier).',
    ],
    flags: ['--c++', '--esp32', '--iot', '--gas-sensors'],
    status: 'prototype · demoed end-to-end',
    repo: 'https://github.com/iAnmolAgarwal/smart-e-nose',
    extra: [{ label: 'hardware demo (YouTube)', href: 'https://youtu.be/VxRDWAj1pcQ' }],
  },
];

export const experience = [
  {
    org: 'Bharat Space Education Research Centre (BSERC)',
    role: 'Summer Intern',
    when: 'Jun – Jul 2026',
    lines: [
      'Completed a 6-week applied space-technology internship.',
      'Capstone: SkyWatch — a Python pipeline that reads the live public ADS-B aircraft feed and flags unusual flight behaviour on a browser map.',
      'Alert state is persisted atomically (temp file, fsync, replace), so a crash mid-write leaves the last good state intact, and every alert passes one triage gate for duplicates, cooldown and rate limits.',
    ],
    link: { label: 'github.com/iAnmolAgarwal/skywatch', href: 'https://github.com/iAnmolAgarwal/skywatch' },
  },
];

export const education = {
  school: 'Jaypee Institute of Information Technology (JIIT), Noida',
  degree: 'B.Tech, Computer Science and Engineering',
  when: 'expected May 2028',
  lines: [
    'CGPA 8.5/10 · semester-4 SGPA 9.4/10.',
    'Coursework: data structures & algorithms, OOP, DBMS, theory of computation. In progress: operating systems, computer networks.',
  ],
};

// Practice only — contest results live in `achievements`, not here.
export const cp = [
  'Codeforces Specialist — 275-day solving streak.',
  '3,000+ problems solved across Codeforces and CodeChef.',
];

export const cpLinks = [
  { label: 'codeforces.com/profile/i_anmolagarwal', href: 'https://codeforces.com/profile/i_anmolagarwal' },
  { label: 'codechef.com/users/i_anmolagarwal', href: 'https://www.codechef.com/users/i_anmolagarwal' },
];

export const stack = {
  languages: ['c++', 'python', 'typescript', 'javascript', 'sql', 'html', 'css'],
  ai: ['claude-api-and-sdk', 'claude-code', 'openai-codex', 'llm-agents', 'prompt-injection-defense'],
  web: ['next.js', 'react', 'react-native-expo', 'rest', 'postgresql', 'supabase'],
  practice: ['git', 'github-actions', 'pytest', 'playwright', 'vercel'],
  hardware: ['esp32'],
};

export const howIBuild =
  'Four months of building and shipping in Claude Code since May 2026: I direct the build from problem statement to architecture, split it across parallel subagents under a lead model, then gate the result on independent review loops.';

export const links = [
  { label: 'github', href: 'https://github.com/iAnmolAgarwal', display: 'github.com/iAnmolAgarwal' },
  { label: 'linkedin', href: 'https://linkedin.com/in/anmolagarwal26', display: 'linkedin.com/in/anmolagarwal26' },
  { label: 'codeforces', href: 'https://codeforces.com/profile/i_anmolagarwal', display: 'codeforces.com/profile/i_anmolagarwal' },
  { label: 'codechef', href: 'https://www.codechef.com/users/i_anmolagarwal', display: 'codechef.com/users/i_anmolagarwal' },
  { label: 'email', href: `mailto:${person.email}`, display: person.email },
  { label: 'résumé', href: person.resumePath, display: 'anmol-agarwal-resume.pdf' },
];

export const whatsNew = [
  '#66 at Amazon ML Challenge 2026, out of 10,000+ submissions (top 0.7%).',
  'buy-or-wait placed #6 of 3,062 (top 0.2%) at HackerRank Orchestrate (Sep 2026).',
  'pathwise won HCLTech AMPLIfied — #1 overall among 4,500+ participants.',
];

export const stats = {
  streakDays: 275,
  rows: [
    ['Codeforces', 'Specialist', 'Solving streak', '275 days'],
    ['Problems solved', '3,000+', 'HackerRank Orchestrate', '#6 of 3,062'],
    ['HCLTech AMPLIfied', '#1 of 4,500+', 'KIET CODE RUSH 3.0', '1st place'],
  ] as [string, string, string, string][],
  footnote: 'Codeforces + CodeChef · figures from the résumé, Sep 2026',
  quip: '275 days ≈ 39.3 weeks of not missing a single day.',
};

export const commands = [
  { name: '/help', desc: 'list commands' },
  { name: '/whoami', desc: 'the short version' },
  { name: '/achievements', desc: 'contests, research, leadership' },
  { name: '/projects', desc: 'what I have built' },
  { name: '/experience', desc: 'internship + education' },
  { name: '/cp', desc: 'competitive programming' },
  { name: '/stack', desc: 'languages and tools' },
  { name: '/stats', desc: 'the numbers' },
  { name: '/contact', desc: 'where to find me' },
  { name: '/resume', desc: 'open the PDF' },
  { name: '/clear', desc: 'replay the session' },
];
