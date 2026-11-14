// Every name, number, line and link shown on the page. Components read from here
// and never hard-code copy of their own.

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Channel {
  id: 'studio' | 'worth' | 'pathwise';
  number: 1 | 2 | 3;
  title: string;
  line: string;
  accent: string;
  /**
   * The colour of the project's links, text and underline. The accent itself
   * where it reads well enough on the paper; Studio's orange is darkened a shade
   * for its link only (his decision, 2026-11-14).
   */
  linkAccent: string;
  video: string;
  poster: string;
  links: ProjectLink[];
}

export interface Result {
  id: 'amplified' | 'orchestrate' | 'amazon' | 'codeforces';
  name: string;
  number: string | null;
  line: string;
}

export const PERSON: {
  name: string;
  tagline: string;
  github: string;
  linkedin: string;
  resume: string;
} = {
  name: 'Anmol Agarwal',
  // The one line under his name: what he is.
  tagline: 'Open to Summer 2027 SWE internships',
  github: 'https://github.com/iAnmolAgarwal',
  linkedin: 'https://linkedin.com/in/anmolagarwal26',
  resume: '/anmol-agarwal-resume.pdf',
};

// What the page says about itself to search engines and link previews. Every fact
// in it is on the page. The address is where the site lives once it is switched on.
export const META: {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
} = {
  title: PERSON.name,
  description: `${PERSON.name}: Studio, Worth and Pathwise playing as channels on a line-drawn television. ${PERSON.tagline}.`,
  url: 'https://anmolagarwal.vercel.app/',
  image: 'https://anmolagarwal.vercel.app/img/og.png',
  imageAlt: `${PERSON.name}'s page: a line-drawn television playing Studio, beside his results`,
};

// The page served for an address the site does not have, such as a link to the
// old site's pages.
export const NOT_FOUND: { title: string; back: string } = {
  title: 'Page not found',
  back: 'Back to the page',
};

/** What the dial says to a screen reader about the channel at `index`. */
export function channelValueText(index: number): string {
  const channel = CHANNELS[index];
  return `Channel ${channel.number}, ${channel.title}`;
}

// The three links in the top bar, in the order they are shown.
export const TOP_LINKS: readonly {
  id: 'github' | 'linkedin' | 'resume';
  label: string;
  href: string;
}[] = [
  { id: 'github', label: 'GitHub', href: PERSON.github },
  { id: 'linkedin', label: 'LinkedIn', href: PERSON.linkedin },
  { id: 'resume', label: 'Resume', href: PERSON.resume },
];

export const CHANNELS: readonly Channel[] = [
  {
    id: 'studio',
    number: 1,
    title: 'Studio',
    line: 'A creator types a script and gets a finished video for Reels, TikTok and Shorts. Paid client work.',
    accent: '#d9481c',
    linkAccent: '#c0400f',
    video: '/media/studio.mp4',
    poster: '/media/studio.jpg',
    links: [
      {
        label: 'Watch the demo',
        href: 'https://x.com/tw_anmolagarwal/status/2120085686854553646',
      },
    ],
  },
  {
    id: 'worth',
    number: 2,
    title: 'Worth',
    line: 'Tells you the day you can actually afford something. Built for the PayPal AI Hackathon.',
    accent: '#1b5fd1',
    linkAccent: '#1b5fd1',
    video: '/media/worth.mp4',
    poster: '/media/worth.jpg',
    links: [
      { label: 'Watch the demo', href: 'https://youtu.be/3RFpuFdSd7c' },
      { label: 'Open the live app', href: 'https://worth.onrender.com' },
    ],
  },
  {
    id: 'pathwise',
    number: 3,
    title: 'Pathwise',
    line: 'A learning plan you can check step by step. Ranked #1 at HCLTech AMPLIfied.',
    accent: '#6f4fe8',
    linkAccent: '#6f4fe8',
    video: '/media/pathwise.mp4',
    poster: '/media/pathwise.jpg',
    links: [
      { label: 'Open the live site', href: 'https://trypathwise.vercel.app' },
      { label: 'GitHub', href: 'https://github.com/iAnmolAgarwal/pathwise' },
    ],
  },
];

export const RESULTS: readonly Result[] = [
  {
    id: 'amplified',
    name: 'HCLTech AMPLIfied',
    number: '#1',
    line: 'National Hackathon Winner',
  },
  {
    id: 'orchestrate',
    name: 'HackerRank Orchestrate',
    number: '#6',
    line: '24 Hr Global Hackathon',
  },
  {
    id: 'amazon',
    name: 'Amazon ML Challenge',
    number: '#66',
    line: 'Top 0.21% of 32,000+ Teams',
  },
  {
    id: 'codeforces',
    name: 'Codeforces Specialist',
    number: '1415',
    line: '28 Rated Contests',
  },
];

// The picture on each result card that has one, and what it shows. The Codeforces
// card is drawn on the page instead: its mark, its name and his rating graph.
export const RESULT_IMAGES: Record<
  Exclude<Result['id'], 'codeforces'>,
  { src: string; alt: string }
> = {
  amplified: {
    src: '/img/hcl-tile.jpg',
    alt: 'Anmol Agarwal, Rank 1, from the HCLTech AMPLIfied winners page',
  },
  orchestrate: {
    src: '/img/medal.png',
    alt: 'HackerRank Orchestrate gold medal',
  },
  amazon: {
    src: '/img/amazon.svg',
    alt: 'Amazon',
  },
};

export const CODEFORCES_WORDMARK = 'Codeforces';

// The handwritten notes: the two beside the cable, in the order they are read (the
// second on two lines), and the one beside the dial.
export const NOTES: {
  first: string;
  second: readonly [string, string];
  dial: string;
  dialPhone: string;
} = {
  first: 'tried a lot of things',
  second: ['stayed for the ones', 'that fix a real problem'],
  dial: 'turn the dial',
  // On a phone the dial is tapped, not turned.
  dialPhone: 'tap the dial',
};

// His Codeforces rating after each of his 28 rated contests, oldest first.
export const CF_RATINGS: readonly number[] = [
  453, 683, 879, 979, 1081, 1140, 1102, 1088, 1019, 1100, 1122, 1160, 1152, 1206, 1193, 1197, 1154,
  1141, 1114, 1153, 1132, 1170, 1246, 1260, 1362, 1358, 1368, 1415,
];

export const TIMING: {
  autoMs: 7000;
  afterManualMs: 20000;
  staticMs: 340;
  osdMs: 1600;
  nudgeAfterMs: 3200;
  powerOnCapMs: 1500;
} = {
  // The set changes channel by itself this often.
  autoMs: 7000,
  // After the visitor turns the dial, automatic switching waits this long.
  afterManualMs: 20000,
  // Static shown while the channel changes.
  staticMs: 340,
  // How long the "CH 2" readout stays in the screen's corner.
  osdMs: 1600,
  // Delay after an automatic change before the dial wiggles.
  nudgeAfterMs: 3200,
  // Longest the power-on waits for the first clip before starting anyway.
  powerOnCapMs: 1500,
};
