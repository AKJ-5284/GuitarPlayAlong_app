import { Paths, File, Directory } from 'expo-file-system';
import { Song, SongMetadata, Note, Track, SongData, GuitarEvent } from '../types/song';
import { DEFAULT_SONGS } from '../data/defaultSongs';

// Grid snap value for beat positions and durations
export const GRID_SNAP = 0.25;

/**
 * Snaps a value to the nearest grid position (0.25 increments)
 */
export const snapToGrid = (value: number): number => {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
};

const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];

const isSongData = (value: Song | SongData): value is SongData => {
  return 'metadata' in value && 'timing' in value;
};

const mapLinkToAccent = (link?: 'h' | 'p' | '/'): GuitarEvent['acc'] => {
  if (link === '/') return 's';
  return link;
};

const mapAccentToLink = (accent?: GuitarEvent['acc']): Note['linkNext'] => {
  if (accent === 's') return '/';
  if (accent === 'h' || accent === 'p') return accent;
  return undefined;
};

const midiToHz = (midiNote: number): number => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

const computeDurationMsFromEvents = (events: GuitarEvent[]): number => {
  let maxEnd = 0;
  for (const event of events) {
    const end = event.t + event.d;
    if (end > maxEnd) {
      maxEnd = end;
    }
  }
  return maxEnd;
};

const songToSongData = (song: Song): SongData => {
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

  return {
    metadata: {
      id: song.id,
      title: song.name,
      artist: 'Unknown',
      bpm: song.bpm,
      beatsPerBar: song.beatsPerBar,
      difficulty: 3,
      durationMs: computeDurationMsFromEvents(lead),
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

const songDataToSong = (songData: SongData): Song => {
  const msPerBeat = songData.timing.msPerBeat > 0
    ? songData.timing.msPerBeat
    : (60000 / songData.metadata.bpm);
  const allEvents = [
    ...songData.tracks.lead,
    ...(songData.tracks.rhythm || []),
    ...(songData.tracks.bass || []),
  ];

  const tracks = Array.from({ length: 6 }, (_, idx) => ({
    string: idx + 1,
    notes: [] as Note[],
  }));

  for (const event of allEvents) {
    const stringNumber = Math.max(1, Math.min(6, event.s + 1));
    tracks[stringNumber - 1].notes.push({
      beat: snapToGrid(event.t / msPerBeat),
      fret: Math.max(0, Math.min(24, event.f)),
      len: Math.max(GRID_SNAP, snapToGrid(event.d / msPerBeat)),
      string: stringNumber,
      linkNext: mapAccentToLink(event.acc),
    });
  }

  for (const track of tracks) {
    track.notes.sort((a, b) => a.beat - b.beat);
  }

  return {
    id: songData.metadata.id,
    name: songData.metadata.title,
    bpm: songData.metadata.bpm,
    beatsPerBar: songData.metadata.beatsPerBar || 4,
    lastModified: Date.now(),
    tracks,
  };
};

const normalizeToSongData = (songLike: Song | SongData): SongData => {
  return isSongData(songLike) ? songLike : songToSongData(songLike);
};

const normalizeToSong = (songLike: Song | SongData): Song => {
  return isSongData(songLike) ? songDataToSong(songLike) : songLike;
};

/**
 * Creates a new note with proper defaults
 */
export const createNote = (
  beat: number,
  fret: number,
  stringNumber: number,
  len: number = 1,
  linkNext?: 'h' | 'p' | '/'
): Note => {
  return {
    beat: snapToGrid(beat),
    fret: Math.max(0, Math.min(24, fret)), // Clamp fret 0-24
    len: snapToGrid(Math.max(GRID_SNAP, len)), // Min duration is one grid unit
    string: stringNumber,
    linkNext,
  };
};

/**
 * Sorts notes in a track by beat position
 */
export const sortTrackNotes = (track: Track): void => {
  track.notes.sort((a, b) => a.beat - b.beat);
};

/**
 * Sorts all notes in all tracks of a song
 */
export const sortSongNotes = (song: Song): void => {
  for (const track of song.tracks) {
    sortTrackNotes(track);
  }
};

/**
 * Adds a note to the correct track and keeps it sorted
 */
export const addNoteToSong = (song: Song, note: Note): void => {
  const track = song.tracks.find(t => t.string === note.string);
  if (track) {
    track.notes.push(note);
    sortTrackNotes(track);
  }
};

/**
 * Removes a note from the song
 */
export const removeNoteFromSong = (song: Song, note: Note): void => {
  const track = song.tracks.find(t => t.string === note.string);
  if (track) {
    const index = track.notes.findIndex(
      n => n.beat === note.beat && n.fret === note.fret && n.string === note.string
    );
    if (index !== -1) {
      track.notes.splice(index, 1);
    }
  }
};

/**
 * Moves a note to a different string
 */
export const moveNoteToString = (song: Song, note: Note, newString: number): void => {
  removeNoteFromSong(song, note);
  note.string = newString;
  addNoteToSong(song, note);
};

// Key to track if default songs have been initialized
const INIT_FLAG_FILE = '.initialized';

// Directory where songs are stored
const getSongsDirectory = (): Directory => {
  return new Directory(Paths.document, 'songs');
};

/**
 * Generates a unique ID for a new song
 */
export const generateSongId = (): string => {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Ensures the songs directory exists
 */
const ensureSongsDirectory = (): Directory => {
  const songsDir = getSongsDirectory();
  if (!songsDir.exists) {
    songsDir.create();
  }
  return songsDir;
};

/**
 * Gets the file for a song
 */
const getSongFile = (songId: string): File => {
  return new File(getSongsDirectory(), `${songId}.json`);
};

/**
 * Saves a song to local storage
 */
export const saveSong = (song: Song | SongData): void => {
  ensureSongsDirectory();

  const songToSave = normalizeToSongData(song);
  const updatedSongToSave: SongData = {
    ...songToSave,
    metadata: {
      ...songToSave.metadata,
      durationMs: computeDurationMsFromEvents([
        ...songToSave.tracks.lead,
        ...(songToSave.tracks.rhythm || []),
        ...(songToSave.tracks.bass || []),
      ]),
    },
  };

  const file = getSongFile(updatedSongToSave.metadata.id);
  file.write(JSON.stringify(updatedSongToSave, null, 2));
};

/**
 * Loads a song by ID
 */
export const loadSong = async (songId: string): Promise<Song | null> => {
  try {
    const file = getSongFile(songId);
    
    if (!file.exists) {
      return null;
    }
    
    const content = await file.text();
    const parsed = JSON.parse(content) as Song | SongData;
    return normalizeToSong(parsed);
  } catch (error) {
    console.error('Error loading song:', error);
    return null;
  }
};

/**
 * Loads a song by ID as SongData schema.
 */
export const loadSongData = async (songId: string): Promise<SongData | null> => {
  try {
    const file = getSongFile(songId);

    if (!file.exists) {
      return null;
    }

    const content = await file.text();
    const parsed = JSON.parse(content) as Song | SongData;
    return normalizeToSongData(parsed);
  } catch (error) {
    console.error('Error loading song data:', error);
    return null;
  }
};

/**
 * Deletes a song by ID
 */
export const deleteSong = (songId: string): boolean => {
  try {
    const file = getSongFile(songId);
    
    if (file.exists) {
      file.delete();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting song:', error);
    return false;
  }
};

/**
 * Lists all saved songs (metadata only)
 */
export const listSongs = async (): Promise<SongMetadata[]> => {
  try {
    const songsDir = ensureSongsDirectory();
    
    const contents = songsDir.list();
    const songs: SongMetadata[] = [];
    
    for (const item of contents) {
      if (item instanceof File && item.uri.endsWith('.json')) {
        try {
          const content = await item.text();
          const song = JSON.parse(content) as Song | SongData;
          const normalizedSong = normalizeToSong(song);
          const fallbackLastModified = item.modificationTime ? Math.floor(item.modificationTime) : Date.now();
          const lastModified = isSongData(song)
            ? fallbackLastModified
            : (song.lastModified || fallbackLastModified);
          songs.push({
            id: normalizedSong.id,
            name: normalizedSong.name,
            bpm: normalizedSong.bpm,
            beatsPerBar: normalizedSong.beatsPerBar || 4,
            lastModified,
          });
        } catch {
          // Skip corrupted files
          console.warn(`Skipping corrupted song file: ${item.uri}`);
        }
      }
    }
    
    // Sort by last modified (newest first)
    return songs.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    console.error('Error listing songs:', error);
    return [];
  }
};

/**
 * Creates a new empty song
 */
export const createNewSong = (name: string = 'Untitled Song', bpm: number = 120, beatsPerBar: number = 4): Song => {
  return {
    id: generateSongId(),
    name,
    bpm,
    beatsPerBar,
    lastModified: Date.now(),
    tracks: [
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] },
      { string: 6, notes: [] },
    ],
  };
};

/**
 * Generates a unique song name by appending (1), (2), etc. if name already exists
 * @param desiredName The name the user wants
 * @param excludeSongId Optional song ID to exclude from the check (for editing existing song)
 */
export const getUniqueSongName = async (desiredName: string, excludeSongId?: string): Promise<string> => {
  const songs = await listSongs();
  const existingNames = new Set(
    songs
      .filter(s => s.id !== excludeSongId)
      .map(s => s.name.toLowerCase())
  );
  
  // If the name doesn't exist, use it as-is
  if (!existingNames.has(desiredName.toLowerCase())) {
    return desiredName;
  }
  
  // Find the next available number
  let counter = 1;
  let newName = `${desiredName} (${counter})`;
  while (existingNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${desiredName} (${counter})`;
  }
  
  return newName;
};

/**
 * Checks if a song name already exists
 * @param name The name to check
 * @param excludeSongId Optional song ID to exclude from the check
 */
export const doesSongNameExist = async (name: string, excludeSongId?: string): Promise<boolean> => {
  const songs = await listSongs();
  return songs.some(s => s.id !== excludeSongId && s.name.toLowerCase() === name.toLowerCase());
};

/**
 * Duplicates an existing song with a new ID
 */
export const duplicateSong = async (songId: string): Promise<Song | null> => {
  const originalSong = await loadSong(songId);
  
  if (!originalSong) {
    return null;
  }
  
  const duplicatedSong: Song = {
    ...originalSong,
    id: generateSongId(),
    name: `${originalSong.name} (Copy)`,
    lastModified: Date.now(),
  };
  
  saveSong(duplicatedSong);
  return duplicatedSong;
};

/**
 * Exports song as JSON string (for sharing)
 */
export const exportSongAsJson = async (songId: string): Promise<string | null> => {
  const song = await loadSongData(songId);
  return song ? JSON.stringify(song, null, 2) : null;
};

/**
 * Imports song from JSON string
 */
export const importSongFromJson = (jsonString: string): Song | null => {
  try {
    const songLike = JSON.parse(jsonString) as Song | SongData;
    const normalizedSong = normalizeToSong(songLike);

    // Assign a new ID to avoid conflicts
    const importedSong: Song = {
      ...normalizedSong,
      id: generateSongId(),
      lastModified: Date.now(),
    };

    saveSong(importedSong);
    return importedSong;
  } catch (error) {
    console.error('Error importing song:', error);
    return null;
  }
};

/**
 * Checks if default songs have been initialized
 */
const isInitialized = (): boolean => {
  const flagFile = new File(getSongsDirectory(), INIT_FLAG_FILE);
  return flagFile.exists;
};

/**
 * Marks the app as initialized
 */
const markAsInitialized = (): void => {
  ensureSongsDirectory();
  const flagFile = new File(getSongsDirectory(), INIT_FLAG_FILE);
  flagFile.write('initialized');
};

/**
 * Initializes default songs on first app launch
 * Call this once when the app starts
 */
export const initializeDefaultSongs = (): void => {
  ensureSongsDirectory();
  
  // Check each default song and add if missing
  for (const song of DEFAULT_SONGS) {
    const songFile = getSongFile(song.metadata.id);
    if (!songFile.exists) {
      saveSong(song);
      console.log(`Added default song: ${song.metadata.title}`);
    }
  }

  // Mark as initialized
  if (!isInitialized()) {
    markAsInitialized();
    console.log('Default songs initialized successfully');
  }
};

