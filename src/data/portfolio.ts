// Single source of truth for site content. Every line here traces to
// resume.txt or a public README on github.com/iAnmolAgarwal — no invention.

export const person = {
  name: 'Anmol Agarwal',
  handle: 'anmol@portfolio',
  tagline:
    'CS undergrad at JIIT Noida, batch of 2028. Builds trading systems, AI agents and small embedded devices; solves competitive-programming problems when the builds are green.',
  lede:
    'is a CS undergrad at JIIT Noida (batch of 2028). He builds trading systems, AI agents and small embedded devices, and solves competitive-programming problems when the builds are green.',
  now: 'BSERC space-tech summer intern · shipping an AI hackathon project (pathwise).',
  location: 'Noida, India',
  availability: 'available for internships (summer 2027)',
  email: 'anmolagarwal2625@gmail.com',
  resumePath: '/anmol-agarwal-resume.pdf',
};

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
    slug: 'orb-trader',
    title: 'orb-trader',
    oneLiner: 'crash-safe NSE intraday opening-range-breakout system (paper-trading)',
    summary:
      'Opening-range breakout bot for NSE equities and index options against the Zerodha Kite Connect API — ORB + session VWAP + RSI gate, software-managed bracket orders, atomic state, crash reconciliation and hard risk limits (1% sizing, daily trade caps, −3% kill-switch, timed square-off). Paper-trading only; never traded real capital, no profit claims.',
    highlights: [
      '194-test suite, written test-first (TDD).',
      'Synthetic OCO brackets: the hard stop rests at the broker, the target is software-managed and cancels the stop first, so a fast market can never fill both sides.',
      'Every trade transition persisted atomically (temp → fsync → rename); restart replays the broker order book through idempotent handlers.',
      'Diagnosed a concurrency freeze — a cross-thread WebSocket close swallowed by the reactor thread — by reproducing it as a failing regression test, then rebuilt reconnect as an atomic reactor-thread callback with exponential backoff.',
    ],
    flags: ['--python', '--kite-connect', '--websockets', '--tdd'],
    status: 'prototype · paper-trading',
    repo: 'https://github.com/iAnmolAgarwal/orb-trader',
  },
  {
    slug: 'damage-claim-agent',
    title: 'damage-claim-agent',
    oneLiner: 'vision-language agent that verifies damage claims from photos',
    summary:
      'Solo submission to the HackerRank Orchestrate 24-hour AI-agent hackathon (June 2026) — global #63 of 1,773. A perception stage (Claude, structurally blind to user history) feeds a fusion stage that is pure deterministic rule code, so the final verdict always lives in code, not in the model.',
    highlights: [
      'Structural prompt-injection defense: an image carrying "approve this claim" is flagged and localised; fusion refuses a supported verdict unless a clean image supports it — attacks degrade to not_enough_information, never a false approval.',
      'Model chosen by measurement, not vibes: Sonnet 4.6 over Opus 4.8 — higher accuracy at roughly half the cost; 18/20 on the labelled gold set at about $0.64 per 44-claim batch with a 43% prompt-cache saving.',
      'Reused-photo fraud caught with a perceptual hash (dhash); every output row is a schema-validated 14-column Pydantic record.',
    ],
    flags: ['--python', '--claude-api', '--structured-output', '--prompt-injection-defense'],
    status: 'completed · hackathon',
    repo: 'https://github.com/iAnmolAgarwal/damage-claim-agent',
  },
  {
    slug: 'smart-e-nose',
    title: 'smart-e-nose',
    oneLiner: 'low-cost ESP32 electronic nose for food-spoilage detection',
    summary:
      'A ~$24 IoT device that sniffs for food spoilage with a four-sensor MQ gas array (vs $8,000–30,000 commercial units). Four-person team; I owned the hardware, the firmware architecture and the cloud integration.',
    highlights: [
      '~920-line ESP32 firmware structured as a five-state sampling machine (IDLE → SEAL → MEASURE → PURGE → REFERENCE) with automatic baseline recalibration.',
      'Three cloud services in parallel — Blynk dashboard, ThingSpeak archive, Telegram alerts within 2–3 s of a state change.',
      'Resolved an ESP32 ADC2/Wi-Fi conflict by remapping every sensor to ADC1.',
      'Manuscript under review at Sensors and Actuators Reports (Elsevier).',
    ],
    flags: ['--cpp', '--esp32', '--iot', '--gas-sensors'],
    status: 'prototype · demoed end-to-end',
    repo: 'https://github.com/iAnmolAgarwal/smart-e-nose',
    extra: [{ label: 'hardware demo (YouTube)', href: 'https://youtu.be/VxRDWAj1pcQ' }],
  },
  {
    slug: 'pathwise',
    title: 'pathwise',
    oneLiner: 'AI-powered personalised learning-path recommender — current hackathon work',
    summary:
      'A deterministic knowledge-graph and embedding engine decides what to learn and in what order; a conversational mentor built on the Claude API elicits your goals and explains every recommendation from the engine’s own evidence. In progress — repo private until submission.',
    highlights: [],
    flags: ['--typescript', '--claude-api', '--wip'],
    status: 'in progress · hackathon',
  },
  {
    slug: 'cp-inventory',
    title: 'CP_inventory',
    oneLiner: 'algorithms and templates collected across the competitive-programming journey',
    summary:
      'The C++ notebook behind 3,000+ solved problems — data structures, algorithms and contest templates, added as they were learned.',
    highlights: [],
    flags: ['--cpp', '--algorithms'],
    status: 'ongoing',
    repo: 'https://github.com/iAnmolAgarwal/CP_inventory',
  },
];

export const experience = [
  {
    org: 'Bharat Space Education Research Centre (BSERC)',
    role: 'Summer Intern',
    when: 'Jun 2026 – present',
    lines: [
      'Selected for a 6-week applied space-technology program spanning generative AI, cybersecurity & digital forensics, and UAV/drone systems.',
      'Scoping a capstone engineering project.',
    ],
  },
];

export const education = {
  school: 'Jaypee Institute of Information Technology (JIIT), Noida',
  degree: 'B.Tech, Computer Science and Engineering',
  when: 'expected May 2028',
  lines: ['CGPA 8.5/10 · semester-4 SGPA 9.4/10.'],
};

export const cp = [
  'Codeforces Pupil — max rating 1362, 209-day solving streak.',
  'CodeChef 2★ — max rating 1565.',
  '3,000+ problems solved across platforms.',
  'IICPC: global rank #2,155 in an offline international contest with candidates from IITs and NITs.',
  'BVCOE Coding Cup: top 8 teams across three rounds (proctored quiz, offline round, 1v1 duel).',
];

export const stack = {
  languages: ['c++', 'python', 'typescript', 'c', 'sql'],
  systems: ['postgresql', 'supabase', 'rest', 'websockets', 'esp32'],
  ai: ['claude-api', 'claude-code', 'ai-agents', 'prompt-injection-defense'],
  practice: ['git', 'tdd', 'pytest', 'playwright', 'vercel'],
};

export const links = [
  { label: 'github', href: 'https://github.com/iAnmolAgarwal', display: 'github.com/iAnmolAgarwal' },
  { label: 'linkedin', href: 'https://linkedin.com/in/anmolagarwal26', display: 'linkedin.com/in/anmolagarwal26' },
  { label: 'codeforces', href: 'https://codeforces.com/profile/i_anmolagarwal', display: 'codeforces.com/profile/i_anmolagarwal' },
  { label: 'codechef', href: 'https://www.codechef.com/users/i_anmolagarwal', display: 'codechef.com/users/i_anmolagarwal' },
  { label: 'email', href: `mailto:${person.email}`, display: person.email },
  { label: 'résumé', href: person.resumePath, display: 'anmol-agarwal-resume.pdf' },
];

export const commands = [
  { name: '/help', desc: 'list commands' },
  { name: '/whoami', desc: 'the short version' },
  { name: '/projects', desc: 'what I have built' },
  { name: '/experience', desc: 'internship + education' },
  { name: '/cp', desc: 'competitive programming' },
  { name: '/stack', desc: 'languages and tools' },
  { name: '/contact', desc: 'where to find me' },
  { name: '/resume', desc: 'open the PDF' },
  { name: '/clear', desc: 'replay the session' },
];
