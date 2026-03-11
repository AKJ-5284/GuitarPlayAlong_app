import { Platform, NativeEventEmitter, NativeModules, PermissionsAndroid } from 'react-native';
import { EventEmitter } from 'expo-modules-core';
import ExpoFluidsynth from '../../modules/expo-fluidsynth';
import { Song } from '../types/song';

// Event emitter for pitch detection events
const pitchEventEmitter = new EventEmitter(ExpoFluidsynth as any);

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
      5.0    // Gain (0.0 - 10.0)
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
export async function preloadSamplesForSong(song: Song): Promise<void> {
  // FluidSynth doesn't need preloading - it synthesizes notes on demand
  // Just ensure FluidSynth is initialized
  if (!fluidsynthInitialized) {
    await initAudio();
  }
  console.log(`FluidSynth ready for song: ${song.name} (no preloading needed)`);
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

/**
 * Start pitch detection using the device microphone.
 * Requires RECORD_AUDIO permission on Android.
 * @returns Promise<true> if started successfully
 */
export async function startPitchDetection(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    console.warn('Pitch detection only available on Android');
    return false;
  }

  try {
    // Request microphone permission at runtime
    console.log('Requesting microphone permission...');
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'GuitarPlayAlong needs microphone access to detect the notes you play.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      console.warn('Microphone permission denied');
      return false;
    }
    
    console.log('Microphone permission granted, starting pitch detection...');
    const result = ExpoFluidsynth.startPitchDetection();
    console.log('Pitch detection started:', result);
    return result;
  } catch (e) {
    console.error('Error starting pitch detection:', e);
    return false;
  }
}

/**
 * Stop pitch detection.
 * @returns true if stopped successfully
 */
export function stopPitchDetection(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const result = ExpoFluidsynth.stopPitchDetection();
    console.log('Pitch detection stopped:', result);
    return result;
  } catch (e) {
    console.error('Error stopping pitch detection:', e);
    return false;
  }
}

/**
 * Add a listener for pitch detection events.
 * @param callback Called when a pitch is detected with {hz, note, probability}
 * @returns Subscription object with remove() method
 */
export function addPitchDetectionListener(
  callback: (event: { hz: number; note: number; probability: number }) => void
): { remove: () => void } {
  if (Platform.OS !== 'android') {
    // Return a no-op subscription for non-Android platforms
    return { remove: () => {} };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (pitchEventEmitter as any).addListener('onPitchDetected', callback);
}
