import { Paths, File, Directory } from 'expo-file-system';
import { Song, SongMetadata, Note, Track } from '../types/song';
import { DEFAULT_SONGS } from '../data/defaultSongs';

// Grid snap value for beat positions and durations
export const GRID_SNAP = 0.25;

/**
 * Snaps a value to the nearest grid position (0.25 increments)
 */
export const snapToGrid = (value: number): number => {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
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
export const saveSong = (song: Song): void => {
  ensureSongsDirectory();
  
  // Update lastModified timestamp
  const songToSave: Song = {
    ...song,
    lastModified: Date.now(),
  };
  
  const file = getSongFile(song.id);
  file.write(JSON.stringify(songToSave, null, 2));
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
    return JSON.parse(content) as Song;
  } catch (error) {
    console.error('Error loading song:', error);
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
          const song = JSON.parse(content) as Song;
          songs.push({
            id: song.id,
            name: song.name,
            bpm: song.bpm,
            beatsPerBar: song.beatsPerBar || 4,
            lastModified: song.lastModified,
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
  const song = await loadSong(songId);
  return song ? JSON.stringify(song, null, 2) : null;
};

/**
 * Imports song from JSON string
 */
export const importSongFromJson = (jsonString: string): Song | null => {
  try {
    const song = JSON.parse(jsonString) as Song;
    
    // Assign a new ID to avoid conflicts
    const importedSong: Song = {
      ...song,
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
    const songFile = getSongFile(song.id);
    if (!songFile.exists) {
      saveSong(song);
      console.log(`Added default song: ${song.name}`);
    }
  }

  // Mark as initialized
  if (!isInitialized()) {
    markAsInitialized();
    console.log('Default songs initialized successfully');
  }
};

