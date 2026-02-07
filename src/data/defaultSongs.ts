import { Song } from '../types/song';

/**
 * Default songs that come bundled with the app
 */
export const DEFAULT_SONGS: Song[] = [
  {
    id: 'default-twinkle-twinkle',
    name: 'Twinkle Twinkle Little Star',
    bpm: 90,
    beatsPerBar: 4,
    lastModified: 1705680000000,
    tracks: [
      {
        string: 1,
        notes: [
          { beat: 0, fret: 0, len: 1, string: 1 }, { beat: 1, fret: 0, len: 1, string: 1 },
          { beat: 2, fret: 7, len: 1, string: 1 }, { beat: 3, fret: 7, len: 1, string: 1 },
          { beat: 4, fret: 9, len: 1, string: 1 }, { beat: 5, fret: 9, len: 1, string: 1 },
          { beat: 6, fret: 7, len: 2, string: 1 },
          { beat: 8, fret: 5, len: 1, string: 1 }, { beat: 9, fret: 5, len: 1, string: 1 },
          { beat: 10, fret: 4, len: 1, string: 1 }, { beat: 11, fret: 4, len: 1, string: 1 },
          { beat: 12, fret: 2, len: 1, string: 1 }, { beat: 13, fret: 2, len: 1, string: 1 },
          { beat: 14, fret: 0, len: 2, string: 1 },
        ],
      },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] },
      { string: 6, notes: [] },
    ],
  },
  {
    id: 'default-happy-birthday',
    name: 'Happy Birthday',
    bpm: 100,
    beatsPerBar: 3,
    lastModified: 1705680000000,
    tracks: [
      {
        string: 1,
        notes: [
          { beat: 0, fret: 0, len: 0.5, string: 1 }, { beat: 0.5, fret: 0, len: 0.5, string: 1 },
          { beat: 1, fret: 2, len: 1, string: 1 }, { beat: 2, fret: 0, len: 1, string: 1 },
          { beat: 3, fret: 5, len: 1, string: 1 }, { beat: 4, fret: 4, len: 2, string: 1 },
          { beat: 6, fret: 0, len: 0.5, string: 1 }, { beat: 6.5, fret: 0, len: 0.5, string: 1 },
          { beat: 7, fret: 2, len: 1, string: 1 }, { beat: 8, fret: 0, len: 1, string: 1 },
          { beat: 9, fret: 7, len: 1, string: 1 }, { beat: 10, fret: 5, len: 2, string: 1 },
        ],
      },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] },
      { string: 6, notes: [] },
    ],
  },
  {
    id: 'default-smoke-on-water',
    name: 'Smoke on the Water (Riff)',
    bpm: 112,
    beatsPerBar: 4,
    lastModified: 1705680000000,
    tracks: [
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      {
        string: 4,
        notes: [
          { beat: 0, fret: 0, len: 1, string: 4 }, { beat: 1, fret: 3, len: 1, string: 4 },
          { beat: 2, fret: 5, len: 1.5, string: 4 },
          { beat: 4, fret: 0, len: 1, string: 4 }, { beat: 5, fret: 3, len: 1, string: 4 },
          { beat: 6, fret: 6, len: 0.5, string: 4 }, { beat: 6.5, fret: 5, len: 1.5, string: 4 },
          { beat: 8, fret: 0, len: 1, string: 4 }, { beat: 9, fret: 3, len: 1, string: 4 },
          { beat: 10, fret: 5, len: 1.5, string: 4 },
          { beat: 12, fret: 3, len: 1, string: 4 }, { beat: 13, fret: 0, len: 2, string: 4 },
        ],
      },
      { string: 5, notes: [] },
      { string: 6, notes: [] },
    ],
  },
  {
    id: 'default-techniques-demo',
    name: 'Techniques Demo',
    bpm: 100,
    beatsPerBar: 4,
    lastModified: 1705680000000,
    tracks: [
      {
        string: 1,
        notes: [
          // Hammer-on example: 5 h 7
          { beat: 0, fret: 5, len: 0.5, string: 1, linkNext: 'h' },
          { beat: 0.5, fret: 7, len: 0.5, string: 1 },
          // Pull-off example: 7 p 5
          { beat: 2, fret: 7, len: 0.5, string: 1, linkNext: 'p' },
          { beat: 2.5, fret: 5, len: 0.5, string: 1 },
          // Slide example: 5 / 7
          { beat: 4, fret: 5, len: 0.5, string: 1, linkNext: '/' },
          { beat: 4.5, fret: 7, len: 0.5, string: 1 },
          // Combo: 5 h 7 / 9
          { beat: 6, fret: 5, len: 0.5, string: 1, linkNext: 'h' },
          { beat: 6.5, fret: 7, len: 0.5, string: 1, linkNext: '/' },
          { beat: 7, fret: 9, len: 1, string: 1 },
        ],
      },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] },
      { string: 6, notes: [] },
    ],
  },
  {
    id: 'default-all-strings-test',
    name: 'All Strings Test',
    bpm: 90,
    beatsPerBar: 4,
    lastModified: 1705680000000,
    tracks: [
      {
        string: 1, // High E
        notes: [
          { beat: 0, fret: 0, len: 1, string: 1 },
          { beat: 2, fret: 3, len: 1, string: 1 },
          { beat: 8, fret: 5, len: 0.5, string: 1, linkNext: 'h' },
          { beat: 8.5, fret: 7, len: 0.5, string: 1 },
          { beat: 16, fret: 12, len: 2, string: 1 },
          { beat: 24, fret: 5, len: 1, string: 1 },
        ],
      },
      {
        string: 2, // B
        notes: [
          { beat: 1, fret: 1, len: 1, string: 2 },
          { beat: 4, fret: 3, len: 1, string: 2 },
          { beat: 10, fret: 5, len: 1, string: 2 },
          { beat: 18, fret: 8, len: 1, string: 2 },
          { beat: 26, fret: 3, len: 1, string: 2 },
        ],
      },
      {
        string: 3, // G
        notes: [
          { beat: 3, fret: 0, len: 1, string: 3 },
          { beat: 6, fret: 2, len: 0.5, string: 3, linkNext: '/' },
          { beat: 6.5, fret: 4, len: 0.5, string: 3 },
          { beat: 12, fret: 5, len: 1, string: 3 },
          { beat: 20, fret: 7, len: 1, string: 3 },
          { beat: 28, fret: 0, len: 2, string: 3 },
        ],
      },
      {
        string: 4, // D
        notes: [
          { beat: 5, fret: 2, len: 1, string: 4 },
          { beat: 9, fret: 4, len: 0.5, string: 4, linkNext: 'p' },
          { beat: 9.5, fret: 2, len: 0.5, string: 4 },
          { beat: 14, fret: 5, len: 1, string: 4 },
          { beat: 22, fret: 7, len: 1, string: 4 },
          { beat: 30, fret: 0, len: 2, string: 4 },
        ],
      },
      {
        string: 5, // A
        notes: [
          { beat: 7, fret: 0, len: 1, string: 5 },
          { beat: 11, fret: 2, len: 1, string: 5 },
          { beat: 15, fret: 3, len: 0.5, string: 5, linkNext: 'h' },
          { beat: 15.5, fret: 5, len: 0.5, string: 5, linkNext: '/' },
          { beat: 16, fret: 7, len: 1, string: 5 },
          { beat: 23, fret: 5, len: 1, string: 5 },
        ],
      },
      {
        string: 6, // Low E
        notes: [
          { beat: 0, fret: 0, len: 2, string: 6 },
          { beat: 4, fret: 3, len: 2, string: 6 },
          { beat: 8, fret: 5, len: 2, string: 6 },
          { beat: 12, fret: 7, len: 2, string: 6 },
          { beat: 17, fret: 5, len: 1, string: 6 },
          { beat: 19, fret: 3, len: 1, string: 6 },
          { beat: 21, fret: 0, len: 2, string: 6 },
          { beat: 25, fret: 0, len: 1, string: 6 },
          { beat: 27, fret: 3, len: 1, string: 6 },
          { beat: 29, fret: 5, len: 1, string: 6 },
          { beat: 31, fret: 0, len: 2, string: 6 },
        ],
      },
    ],
  },
];
