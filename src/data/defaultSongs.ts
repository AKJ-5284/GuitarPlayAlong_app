import { Song, SongData, GuitarEvent } from '../types/song';

const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];

const midiToHz = (midiNote: number): number => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

const mapLinkToAccent = (link?: 'h' | 'p' | '/'): GuitarEvent['acc'] => {
  if (link === '/') return 's';
  return link;
};

const toSongData = (song: Song): SongData => {
  const msPerBeat = 60000 / song.bpm;
  const lead: GuitarEvent[] = [];

  for (const track of song.tracks) {
    for (const note of track.notes) {
      const stringIndex = Math.max(0, Math.min(5, track.string - 1));
      const midiNote = DEFAULT_TUNING[stringIndex] + note.fret;
      lead.push({
        t: Math.round(note.beat * msPerBeat),
        d: Math.max(1, Math.round(note.len * msPerBeat)),
        s: stringIndex,
        f: note.fret,
        hz: midiToHz(midiNote),
        acc: mapLinkToAccent(note.linkNext),
      });
    }
  }

  lead.sort((a, b) => a.t - b.t);

  let durationMs = 0;
  for (const event of lead) {
    durationMs = Math.max(durationMs, event.t + event.d);
  }

  return {
    metadata: {
      id: song.id,
      title: song.name,
      artist: 'Traditional',
      bpm: song.bpm,
      beatsPerBar: song.beatsPerBar,
      difficulty: 3,
      durationMs,
      tuning: [...DEFAULT_TUNING],
    },
    timing: {
      msPerBeat,
      pixelsPerBeat: 80,
    },
    tracks: {
      lead,
    },
  };
};

/**
 * Default songs that come bundled with the app
 */
const LEGACY_DEFAULT_SONGS: Song[] = [
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

const CUSTOM_DEFAULT_SONGS: SongData[] = [
  {
    metadata: {
      id: 'line-without-a-hook',
      title: 'Line without a hook',
      artist: 'Unknown',
      bpm: 120,
      beatsPerBar: 4,
      difficulty: 3,
      durationMs: 16000,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    timing: {
      msPerBeat: 500,
      pixelsPerBeat: 100,
    },
    tracks: {
      lead: [
        { t: 0, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 250, d: 200, s: 2, f: 6, hz: 277.18, v: 0.8 },
        { t: 500, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 750, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 1000, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 1250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 1500, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 1750, d: 200, s: 2, f: 6, hz: 277.18, v: 0.8 },
        { t: 2000, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 2250, d: 200, s: 2, f: 5, hz: 261.63, v: 0.8 },
        { t: 2500, d: 200, s: 2, f: 6, hz: 277.18, v: 0.8 },
        { t: 2750, d: 200, s: 2, f: 5, hz: 261.63, v: 0.8 },
        { t: 3000, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 3250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 3500, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 3750, d: 200, s: 2, f: 6, hz: 277.18, v: 0.8 },
        { t: 4000, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 4250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 4500, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 4750, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 5000, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 5250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 5500, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 5750, d: 200, s: 3, f: 6, hz: 207.65, v: 0.8 },
        { t: 6000, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 6250, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 6500, d: 200, s: 3, f: 6, hz: 207.65, v: 0.8 },
        { t: 6750, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 7000, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 7250, d: 200, s: 3, f: 8, hz: 233.08, v: 0.8 },
        { t: 7500, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 7750, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 8000, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 8250, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 8500, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 8750, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 9000, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 9250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 9500, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 9750, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 10000, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 10250, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 10500, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 10750, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 11000, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 11250, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 11500, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 11750, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 12000, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 12250, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 12500, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 12750, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 13000, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 13250, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 13500, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 13750, d: 200, s: 2, f: 8, hz: 311.13, v: 0.8 },
        { t: 14000, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
        { t: 14250, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 14500, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 14750, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 15000, d: 200, s: 1, f: 8, hz: 392.0, v: 0.8 },
        { t: 15250, d: 200, s: 2, f: 6, hz: 277.18, v: 0.8 },
        { t: 15500, d: 200, s: 1, f: 6, hz: 349.23, v: 0.8 },
        { t: 15750, d: 200, s: 1, f: 5, hz: 329.63, v: 0.8 },
      ],
    },
  },
];

export const DEFAULT_SONGS: SongData[] = [
  ...LEGACY_DEFAULT_SONGS.map(toSongData),
  ...CUSTOM_DEFAULT_SONGS,
];
