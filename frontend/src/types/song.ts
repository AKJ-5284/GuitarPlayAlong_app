/**
 * Standard Song Schema for Pitch-Detection Apps
 */
export interface SongData {
  metadata: {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    beatsPerBar: number;
    difficulty: number; // 1-10
    durationMs: number;
    // Standard EADGBE is [64, 59, 55, 50, 45, 40] (MIDI Note Numbers)
    tuning: number[];
  };
  // Pre-calculated timing data
  timing: {
    msPerBeat: number;
    pixelsPerBeat: number;
  };
  // The actual notes to play
  tracks: {
    lead: GuitarEvent[];
    rhythm?: GuitarEvent[];
    bass?: GuitarEvent[];
  };
}

export interface GuitarEvent {
  t: number;      // Timestamp (ms) - EXACT moment it hits the line
  d: number;      // Duration (ms) - for "hold" notes or vibrato
  s: number;      // String index (0-5, where 0 is high E)
  f: number;      // Fret number (0 is open)
  hz: number;     // Target Frequency (pre-calculated for faster comparison)
  acc?: 's' | 'h' | 'p' | 'b'; // slide, hammer-on, pull-off, bend
  v?: number;     // Velocity/Intensity (0.0 to 1.0)
}

// Legacy interfaces retained during schema migration.
export interface Note {
  beat: number;
  fret: number;
  len: number;
  string: number;
  linkNext?: 'h' | 'p' | '/';
}

export interface Track {
  string: number;
  notes: Note[];
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  lastModified: number;
  tracks: Track[];
}

export interface SongMetadata {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  lastModified: number;
}
