// Note on a guitar string
export interface Note {
  beat: number;   // The beat position where the note starts (snaps to 0.25 grid)
  fret: number;   // The fret number (0 = open string)
  len: number;    // Duration in beats (snaps to 0.25 grid)
  string: number; // String number (1-6, where 1 is highest) - for easier editing/drag-drop
  linkNext?: 'h' | 'p' | '/'; // Links to next note: h=hammer-on, p=pull-off, /=slide
}

// A track representing one guitar string
export interface Track {
  string: number; // String number (1-6, where 1 is the thinnest/highest)
  notes: Note[];
}

// Complete song structure
export interface Song {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number; // Time signature (e.g., 4 for 4/4 time)
  lastModified: number; // Unix timestamp in milliseconds
  tracks: Track[];
}

// Song metadata for listing (without full track data)
export interface SongMetadata {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  lastModified: number;
}
