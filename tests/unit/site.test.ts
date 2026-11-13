import { describe, expect, it } from 'vitest';
import {
  CF_RATINGS,
  CHANNELS,
  CODEFORCES_WORDMARK,
  NOTES,
  PERSON,
  RESULT_IMAGES,
  RESULTS,
  TIMING,
  TOP_LINKS,
} from '../../src/data/site';

const [studio, worth, pathwise] = CHANNELS;

describe('CHANNELS', () => {
  it('has the three projects in channel order', () => {
    expect(CHANNELS.length).toBe(3);
    expect(CHANNELS.map((c) => c.id)).toEqual(['studio', 'worth', 'pathwise']);
    expect(CHANNELS.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(CHANNELS.map((c) => c.title)).toEqual(['Studio', 'Worth', 'Pathwise']);
  });

  it('gives each channel its accent colour', () => {
    expect(CHANNELS.map((c) => c.accent)).toEqual(['#d9481c', '#1b5fd1', '#6f4fe8']);
  });

  it('points each channel at its clip and poster', () => {
    expect(CHANNELS.map((c) => c.video)).toEqual([
      '/media/studio.mp4',
      '/media/worth.mp4',
      '/media/pathwise.mp4',
    ]);
    expect(CHANNELS.map((c) => c.poster)).toEqual([
      '/media/studio.jpg',
      '/media/worth.jpg',
      '/media/pathwise.jpg',
    ]);
  });

  it('uses the spec line for each project exactly', () => {
    expect(studio.line).toBe(
      'A creator types a script and gets a finished video for Reels, TikTok and Shorts. Paid client work.',
    );
    expect(worth.line).toBe(
      'Tells you the day you can actually afford something. Built for the PayPal AI Hackathon.',
    );
    expect(pathwise.line).toBe(
      'A learning plan you can check step by step. Ranked #1 at HCLTech AMPLIfied.',
    );
  });

  it('links Studio only to its demo post', () => {
    expect(studio.links).toEqual([
      {
        label: 'Watch the demo',
        href: 'https://x.com/tw_anmolagarwal/status/2120085686854553646',
      },
    ]);
  });

  it('links Worth to its demo and live app', () => {
    expect(worth.links).toEqual([
      { label: 'Watch the demo', href: 'https://youtu.be/3RFpuFdSd7c' },
      { label: 'Open the live app', href: 'https://worth.onrender.com' },
    ]);
  });

  it('links Pathwise to its live site and repository', () => {
    expect(pathwise.links).toEqual([
      { label: 'Open the live site', href: 'https://trypathwise.vercel.app' },
      { label: 'GitHub', href: 'https://github.com/iAnmolAgarwal/pathwise' },
    ]);
  });
});

describe('RESULTS', () => {
  it('matches the four rows of the spec', () => {
    expect(RESULTS).toEqual([
      {
        id: 'amplified',
        name: 'HCLTech AMPLIfied',
        number: null,
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
    ]);
  });
});

describe('TOP_LINKS', () => {
  it('reads GitHub, LinkedIn, Resume and points where PERSON does', () => {
    expect(TOP_LINKS).toEqual([
      { id: 'github', label: 'GitHub', href: 'https://github.com/iAnmolAgarwal' },
      { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/anmolagarwal26' },
      { id: 'resume', label: 'Resume', href: '/anmol-agarwal-resume.pdf' },
    ]);
  });
});

describe('RESULT_IMAGES', () => {
  it('gives three cards their picture and says what it shows', () => {
    expect(RESULT_IMAGES).toEqual({
      amplified: {
        src: '/img/hcl-tile.png',
        alt: 'Anmol Agarwal, Rank 1, from the HCLTech AMPLIfied winners page',
      },
      orchestrate: { src: '/img/medal.png', alt: 'HackerRank Orchestrate gold medal' },
      amazon: { src: '/img/amazon.svg', alt: 'Amazon' },
    });
  });

  it('names Codeforces beside its mark', () => {
    expect(CODEFORCES_WORDMARK).toBe('Codeforces');
  });
});

describe('NOTES', () => {
  it('carries the handwritten notes word for word', () => {
    expect(NOTES).toEqual({
      tangle: 'tried a lot of things',
      run: ['stayed for the ones', 'that fix a real problem'],
      dial: 'turn the dial',
    });
  });
});

describe('CF_RATINGS', () => {
  it('is the full 28-contest history ending at the current rating', () => {
    expect(CF_RATINGS).toEqual([
      453, 683, 879, 979, 1081, 1140, 1102, 1088, 1019, 1100, 1122, 1160, 1152, 1206, 1193, 1197,
      1154, 1141, 1114, 1153, 1132, 1170, 1246, 1260, 1362, 1358, 1368, 1415,
    ]);
    expect(CF_RATINGS.length).toBe(28);
    expect(CF_RATINGS.at(-1)).toBe(1415);
  });
});

describe('TIMING', () => {
  it('switches channel every 7 seconds and waits 20 after a manual turn', () => {
    expect(TIMING.autoMs).toBe(7000);
    expect(TIMING.afterManualMs).toBe(20000);
  });

  it('carries the remaining timings from the interface', () => {
    expect(TIMING).toEqual({
      autoMs: 7000,
      afterManualMs: 20000,
      staticMs: 340,
      osdMs: 1600,
      nudgeAfterMs: 3200,
      powerOnCapMs: 1500,
    });
  });
});

describe('PERSON', () => {
  it('names him and points at his profiles and the résumé served by the site', () => {
    expect(PERSON).toEqual({
      name: 'Anmol Agarwal',
      github: 'https://github.com/iAnmolAgarwal',
      linkedin: 'https://linkedin.com/in/anmolagarwal26',
      resume: '/anmol-agarwal-resume.pdf',
    });
  });
});
