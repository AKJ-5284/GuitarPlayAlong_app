import { Platform } from 'react-native';
import ExpoFluidsynth from '../../modules/expo-fluidsynth';
import { Song, SongData } from '../types/song';

// FluidSynth initialization state
let fluidsynthInitialized = false;
let fluidsynthInitializing = false;
let cachedSoundfontPath: string | null = null;

// Default velocity for notes
const DEFAULT_VELOCITY = 100;
const LEGATO_HAMMER_VELOCITY = 75;
const LEGATO_PULL_VELOCITY = 65;

// SoundFont filename
const SOUNDFONT_FILENAME = 'guitar.sf2';

const isSongData = (value: Song | SongData): value is SongData => {
  return 'metadata' in value && 'timing' in value;
};

/**
 * Get the SoundFont file path.
 * On Android, copies from APK assets to files directory if not already there.
 * Uses native Kotlin code to access assets directly.
 */
async function getSoundfontPath(): Promise<string> {
  // Return cached path if available
  if (cachedSoundfontPath) {
    return cachedSoundfontPath;
  }

  console.log('Getting SoundFont path via native module...');
  
  const result = await ExpoFluidsynth.getAssetPath(SOUNDFONT_FILENAME);
  
  if (!result.success || !result.path) {
    throw new Error(`Failed to get SoundFont path: ${result.error}`);
  }
  
  cachedSoundfontPath = result.path;
  console.log('SoundFont path:', cachedSoundfontPath);
  return cachedSoundfontPath;
}

/**
 * Initialize FluidSynth with the guitar SoundFont.
 * Call this once before playing any notes.
 */
export async function initAudio(): Promise<void> {
  // Only available on Android for now
  if (Platform.OS !== 'android') {
    console.warn('FluidSynth is only available on Android');
    return;
  }

  if (fluidsynthInitialized) {
    console.log('FluidSynth already initialized');
    return;
  }

  if (fluidsynthInitializing) {
    console.log('FluidSynth initialization already in progress');
    // Wait for initialization to complete
    while (fluidsynthInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }

  fluidsynthInitializing = true;

  try {
    console.log('Initializing FluidSynth...');
    
    const soundfontPath = await getSoundfontPath();
    
    const result = await ExpoFluidsynth.initSynth(
      soundfontPath,
      44100, // Sample rate
      1.4    // Gain (0.0 - 10.0)
    );
    
    if (result.success) {
      console.log('FluidSynth initialized successfully:', result);
      fluidsynthInitialized = true;
    } else {
      console.error('FluidSynth initialization failed:', result.error);
      throw new Error(result.error || 'Unknown FluidSynth error');
    }
  } catch (e) {
    console.error('Error initializing FluidSynth:', e);
    throw e;
  } finally {
    fluidsynthInitializing = false;
  }
}

/**
 * Check if FluidSynth is initialized and ready to play.
 */
export function isAudioReady(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  return fluidsynthInitialized && ExpoFluidsynth.isInitialized();
}

/**
 * Preload samples for a song.
 * With FluidSynth, no preloading is needed - all notes are synthesized on demand.
 * This function is kept for API compatibility.
 */
export async function preloadSamplesForSong(song: Song | SongData): Promise<void> {
  // FluidSynth doesn't need preloading - it synthesizes notes on demand
  // Just ensure FluidSynth is initialized
  if (!fluidsynthInitialized) {
    await initAudio();
  }
  const songTitle = isSongData(song) ? song.metadata.title : song.name;
  console.log(`FluidSynth ready for song: ${songTitle} (no preloading needed)`);
}

/**
 * Unload all samples.
 * With FluidSynth, this is a no-op since we don't preload individual samples.
 */
export function unloadAllSamples(): void {
  // No-op for FluidSynth
}

/**
 * Check if samples are loaded.
 * With FluidSynth, returns true if the synth is initialized.
 */
export function areSamplesLoaded(): boolean {
  return fluidsynthInitialized;
}

/**
 * Play a guitar note using FluidSynth.
 * @param stringNumber Guitar string (1 = high E, 6 = low E)
 * @param fret Fret number (0 = open string)
 */
export function playNote(stringNumber: number, fret: number): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    console.warn('FluidSynth not ready, cannot play note');
    return;
  }

  try {
    // playTab handles the string/fret to MIDI conversion internally
    const success = ExpoFluidsynth.playTab(stringNumber, fret, DEFAULT_VELOCITY);
    if (!success) {
      console.warn(`Failed to play note: string ${stringNumber}, fret ${fret}`);
    }
  } catch (e) {
    console.error('Error playing note:', e);
  }
}

/**
 * Stop a guitar note.
 * @param stringNumber Guitar string (1 = high E, 6 = low E)
 * @param fret Fret number (0 = open string)
 */
export function stopNote(stringNumber: number, fret: number): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }

  try {
    ExpoFluidsynth.stopTab(stringNumber, fret);
  } catch (e) {
    console.error('Error stopping note:', e);
  }
}

/**
 * Play a legato note (hammer-on or pull-off).
 * Uses lower velocity for a smoother sound.
 */
export function playLegato(
  stringNumber: number,
  fret: number,
  technique: 'h' | 'p'
): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    console.warn('FluidSynth not ready, cannot play legato');
    return;
  }

  try {
    const velocity = technique === 'h' ? LEGATO_HAMMER_VELOCITY : LEGATO_PULL_VELOCITY;
    ExpoFluidsynth.playTab(stringNumber, fret, velocity);
  } catch (e) {
    console.error('Error playing legato:', e);
  }
}

/**
 * Play a slide from one fret to another.
 * Uses native Kotlin timing for precise audio scheduling.
 */
export function playSlide(
  stringNumber: number,
  fromFret: number,
  toFret: number
): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    console.warn('FluidSynth not ready, cannot play slide');
    return;
  }

  try {
    // Pass everything to Android at once - native code handles the timing
    ExpoFluidsynth.playSlide(stringNumber, fromFret, toFret, 120);
  } catch (e) {
    console.error('Error playing slide:', e);
  }
}

/**
 * Stop all currently playing notes.
 */
export function allNotesOff(): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }

  try {
    ExpoFluidsynth.allNotesOff();
  } catch (e) {
    console.error('Error stopping all notes:', e);
  }
}

/**
 * Alias for allNotesOff - stops all currently playing sounds.
 */
export function stopAllSounds(): void {
  allNotesOff();
}

/**
 * Set the master gain/volume.
 * @param gain Volume level (0.0 to 10.0, default 1.0)
 */
export function setGain(gain: number): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }

  try {
    ExpoFluidsynth.setGain(gain);
  } catch (e) {
    console.error('Error setting gain:', e);
  }
}

/**
 * Cleanup FluidSynth resources.
 * Call this when the app is closing or no longer needs audio.
 */
export async function cleanup(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await ExpoFluidsynth.cleanup();
    fluidsynthInitialized = false;
    console.log('FluidSynth cleaned up');
  } catch (e) {
    console.error('Error cleaning up FluidSynth:', e);
  }
}
