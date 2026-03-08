import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Song } from '../types/song';

// Guitar sample asset mapping - all samples must be statically required
// Format: string{s}_fret{ff}_{note}.wav
// Strings: 1 (high E) to 6 (low E)
// Frets: 0 (open) to 22

const ALL_SAMPLES: { [key: string]: any } = {
  // String 1 (High E)
  '1_0': require('../../assets/guitar_fret_samples/string1_fret00_E4.wav'),
  '1_1': require('../../assets/guitar_fret_samples/string1_fret01_F4.wav'),
  '1_2': require('../../assets/guitar_fret_samples/string1_fret02_Fs4.wav'),
  '1_3': require('../../assets/guitar_fret_samples/string1_fret03_G4.wav'),
  '1_4': require('../../assets/guitar_fret_samples/string1_fret04_Gs4.wav'),
  '1_5': require('../../assets/guitar_fret_samples/string1_fret05_A4.wav'),
  '1_6': require('../../assets/guitar_fret_samples/string1_fret06_As4.wav'),
  '1_7': require('../../assets/guitar_fret_samples/string1_fret07_B4.wav'),
  '1_8': require('../../assets/guitar_fret_samples/string1_fret08_C5.wav'),
  '1_9': require('../../assets/guitar_fret_samples/string1_fret09_Cs5.wav'),
  '1_10': require('../../assets/guitar_fret_samples/string1_fret10_D5.wav'),
  '1_11': require('../../assets/guitar_fret_samples/string1_fret11_Ds5.wav'),
  '1_12': require('../../assets/guitar_fret_samples/string1_fret12_E5.wav'),
  '1_13': require('../../assets/guitar_fret_samples/string1_fret13_F5.wav'),
  '1_14': require('../../assets/guitar_fret_samples/string1_fret14_Fs5.wav'),
  '1_15': require('../../assets/guitar_fret_samples/string1_fret15_G5.wav'),
  '1_16': require('../../assets/guitar_fret_samples/string1_fret16_Gs5.wav'),
  '1_17': require('../../assets/guitar_fret_samples/string1_fret17_A5.wav'),
  '1_18': require('../../assets/guitar_fret_samples/string1_fret18_As5.wav'),
  '1_19': require('../../assets/guitar_fret_samples/string1_fret19_B5.wav'),
  '1_20': require('../../assets/guitar_fret_samples/string1_fret20_C6.wav'),
  '1_21': require('../../assets/guitar_fret_samples/string1_fret21_Cs6.wav'),
  '1_22': require('../../assets/guitar_fret_samples/string1_fret22_D6.wav'),
  // String 2 (B)
  '2_0': require('../../assets/guitar_fret_samples/string2_fret00_B3.wav'),
  '2_1': require('../../assets/guitar_fret_samples/string2_fret01_C4.wav'),
  '2_2': require('../../assets/guitar_fret_samples/string2_fret02_Cs4.wav'),
  '2_3': require('../../assets/guitar_fret_samples/string2_fret03_D4.wav'),
  '2_4': require('../../assets/guitar_fret_samples/string2_fret04_Ds4.wav'),
  '2_5': require('../../assets/guitar_fret_samples/string2_fret05_E4.wav'),
  '2_6': require('../../assets/guitar_fret_samples/string2_fret06_F4.wav'),
  '2_7': require('../../assets/guitar_fret_samples/string2_fret07_Fs4.wav'),
  '2_8': require('../../assets/guitar_fret_samples/string2_fret08_G4.wav'),
  '2_9': require('../../assets/guitar_fret_samples/string2_fret09_Gs4.wav'),
  '2_10': require('../../assets/guitar_fret_samples/string2_fret10_A4.wav'),
  '2_11': require('../../assets/guitar_fret_samples/string2_fret11_As4.wav'),
  '2_12': require('../../assets/guitar_fret_samples/string2_fret12_B4.wav'),
  '2_13': require('../../assets/guitar_fret_samples/string2_fret13_C5.wav'),
  '2_14': require('../../assets/guitar_fret_samples/string2_fret14_Cs5.wav'),
  '2_15': require('../../assets/guitar_fret_samples/string2_fret15_D5.wav'),
  '2_16': require('../../assets/guitar_fret_samples/string2_fret16_Ds5.wav'),
  '2_17': require('../../assets/guitar_fret_samples/string2_fret17_E5.wav'),
  '2_18': require('../../assets/guitar_fret_samples/string2_fret18_F5.wav'),
  '2_19': require('../../assets/guitar_fret_samples/string2_fret19_Fs5.wav'),
  '2_20': require('../../assets/guitar_fret_samples/string2_fret20_G5.wav'),
  '2_21': require('../../assets/guitar_fret_samples/string2_fret21_Gs5.wav'),
  '2_22': require('../../assets/guitar_fret_samples/string2_fret22_A5.wav'),
  // String 3 (G)
  '3_0': require('../../assets/guitar_fret_samples/string3_fret00_G3.wav'),
  '3_1': require('../../assets/guitar_fret_samples/string3_fret01_Gs3.wav'),
  '3_2': require('../../assets/guitar_fret_samples/string3_fret02_A3.wav'),
  '3_3': require('../../assets/guitar_fret_samples/string3_fret03_As3.wav'),
  '3_4': require('../../assets/guitar_fret_samples/string3_fret04_B3.wav'),
  '3_5': require('../../assets/guitar_fret_samples/string3_fret05_C4.wav'),
  '3_6': require('../../assets/guitar_fret_samples/string3_fret06_Cs4.wav'),
  '3_7': require('../../assets/guitar_fret_samples/string3_fret07_D4.wav'),
  '3_8': require('../../assets/guitar_fret_samples/string3_fret08_Ds4.wav'),
  '3_9': require('../../assets/guitar_fret_samples/string3_fret09_E4.wav'),
  '3_10': require('../../assets/guitar_fret_samples/string3_fret10_F4.wav'),
  '3_11': require('../../assets/guitar_fret_samples/string3_fret11_Fs4.wav'),
  '3_12': require('../../assets/guitar_fret_samples/string3_fret12_G4.wav'),
  '3_13': require('../../assets/guitar_fret_samples/string3_fret13_Gs4.wav'),
  '3_14': require('../../assets/guitar_fret_samples/string3_fret14_A4.wav'),
  '3_15': require('../../assets/guitar_fret_samples/string3_fret15_As4.wav'),
  '3_16': require('../../assets/guitar_fret_samples/string3_fret16_B4.wav'),
  '3_17': require('../../assets/guitar_fret_samples/string3_fret17_C5.wav'),
  '3_18': require('../../assets/guitar_fret_samples/string3_fret18_Cs5.wav'),
  '3_19': require('../../assets/guitar_fret_samples/string3_fret19_D5.wav'),
  '3_20': require('../../assets/guitar_fret_samples/string3_fret20_Ds5.wav'),
  '3_21': require('../../assets/guitar_fret_samples/string3_fret21_E5.wav'),
  '3_22': require('../../assets/guitar_fret_samples/string3_fret22_F5.wav'),
  // String 4 (D)
  '4_0': require('../../assets/guitar_fret_samples/string4_fret00_D3.wav'),
  '4_1': require('../../assets/guitar_fret_samples/string4_fret01_Ds3.wav'),
  '4_2': require('../../assets/guitar_fret_samples/string4_fret02_E3.wav'),
  '4_3': require('../../assets/guitar_fret_samples/string4_fret03_F3.wav'),
  '4_4': require('../../assets/guitar_fret_samples/string4_fret04_Fs3.wav'),
  '4_5': require('../../assets/guitar_fret_samples/string4_fret05_G3.wav'),
  '4_6': require('../../assets/guitar_fret_samples/string4_fret06_Gs3.wav'),
  '4_7': require('../../assets/guitar_fret_samples/string4_fret07_A3.wav'),
  '4_8': require('../../assets/guitar_fret_samples/string4_fret08_As3.wav'),
  '4_9': require('../../assets/guitar_fret_samples/string4_fret09_B3.wav'),
  '4_10': require('../../assets/guitar_fret_samples/string4_fret10_C4.wav'),
  '4_11': require('../../assets/guitar_fret_samples/string4_fret11_Cs4.wav'),
  '4_12': require('../../assets/guitar_fret_samples/string4_fret12_D4.wav'),
  '4_13': require('../../assets/guitar_fret_samples/string4_fret13_Ds4.wav'),
  '4_14': require('../../assets/guitar_fret_samples/string4_fret14_E4.wav'),
  '4_15': require('../../assets/guitar_fret_samples/string4_fret15_F4.wav'),
  '4_16': require('../../assets/guitar_fret_samples/string4_fret16_Fs4.wav'),
  '4_17': require('../../assets/guitar_fret_samples/string4_fret17_G4.wav'),
  '4_18': require('../../assets/guitar_fret_samples/string4_fret18_Gs4.wav'),
  '4_19': require('../../assets/guitar_fret_samples/string4_fret19_A4.wav'),
  '4_20': require('../../assets/guitar_fret_samples/string4_fret20_As4.wav'),
  '4_21': require('../../assets/guitar_fret_samples/string4_fret21_B4.wav'),
  '4_22': require('../../assets/guitar_fret_samples/string4_fret22_C5.wav'),
  // String 5 (A)
  '5_0': require('../../assets/guitar_fret_samples/string5_fret00_A2.wav'),
  '5_1': require('../../assets/guitar_fret_samples/string5_fret01_As2.wav'),
  '5_2': require('../../assets/guitar_fret_samples/string5_fret02_B2.wav'),
  '5_3': require('../../assets/guitar_fret_samples/string5_fret03_C3.wav'),
  '5_4': require('../../assets/guitar_fret_samples/string5_fret04_Cs3.wav'),
  '5_5': require('../../assets/guitar_fret_samples/string5_fret05_D3.wav'),
  '5_6': require('../../assets/guitar_fret_samples/string5_fret06_Ds3.wav'),
  '5_7': require('../../assets/guitar_fret_samples/string5_fret07_E3.wav'),
  '5_8': require('../../assets/guitar_fret_samples/string5_fret08_F3.wav'),
  '5_9': require('../../assets/guitar_fret_samples/string5_fret09_Fs3.wav'),
  '5_10': require('../../assets/guitar_fret_samples/string5_fret10_G3.wav'),
  '5_11': require('../../assets/guitar_fret_samples/string5_fret11_Gs3.wav'),
  '5_12': require('../../assets/guitar_fret_samples/string5_fret12_A3.wav'),
  '5_13': require('../../assets/guitar_fret_samples/string5_fret13_As3.wav'),
  '5_14': require('../../assets/guitar_fret_samples/string5_fret14_B3.wav'),
  '5_15': require('../../assets/guitar_fret_samples/string5_fret15_C4.wav'),
  '5_16': require('../../assets/guitar_fret_samples/string5_fret16_Cs4.wav'),
  '5_17': require('../../assets/guitar_fret_samples/string5_fret17_D4.wav'),
  '5_18': require('../../assets/guitar_fret_samples/string5_fret18_Ds4.wav'),
  '5_19': require('../../assets/guitar_fret_samples/string5_fret19_E4.wav'),
  '5_20': require('../../assets/guitar_fret_samples/string5_fret20_F4.wav'),
  '5_21': require('../../assets/guitar_fret_samples/string5_fret21_Fs4.wav'),
  '5_22': require('../../assets/guitar_fret_samples/string5_fret22_G4.wav'),
  // String 6 (Low E)
  '6_0': require('../../assets/guitar_fret_samples/string6_fret00_E2.wav'),
  '6_1': require('../../assets/guitar_fret_samples/string6_fret01_F2.wav'),
  '6_2': require('../../assets/guitar_fret_samples/string6_fret02_Fs2.wav'),
  '6_3': require('../../assets/guitar_fret_samples/string6_fret03_G2.wav'),
  '6_4': require('../../assets/guitar_fret_samples/string6_fret04_Gs2.wav'),
  '6_5': require('../../assets/guitar_fret_samples/string6_fret05_A2.wav'),
  '6_6': require('../../assets/guitar_fret_samples/string6_fret06_As2.wav'),
  '6_7': require('../../assets/guitar_fret_samples/string6_fret07_B2.wav'),
  '6_8': require('../../assets/guitar_fret_samples/string6_fret08_C3.wav'),
  '6_9': require('../../assets/guitar_fret_samples/string6_fret09_Cs3.wav'),
  '6_10': require('../../assets/guitar_fret_samples/string6_fret10_D3.wav'),
  '6_11': require('../../assets/guitar_fret_samples/string6_fret11_Ds3.wav'),
  '6_12': require('../../assets/guitar_fret_samples/string6_fret12_E3.wav'),
  '6_13': require('../../assets/guitar_fret_samples/string6_fret13_F3.wav'),
  '6_14': require('../../assets/guitar_fret_samples/string6_fret14_Fs3.wav'),
  '6_15': require('../../assets/guitar_fret_samples/string6_fret15_G3.wav'),
  '6_16': require('../../assets/guitar_fret_samples/string6_fret16_Gs3.wav'),
  '6_17': require('../../assets/guitar_fret_samples/string6_fret17_A3.wav'),
  '6_18': require('../../assets/guitar_fret_samples/string6_fret18_As3.wav'),
  '6_19': require('../../assets/guitar_fret_samples/string6_fret19_B3.wav'),
  '6_20': require('../../assets/guitar_fret_samples/string6_fret20_C4.wav'),
  '6_21': require('../../assets/guitar_fret_samples/string6_fret21_Cs4.wav'),
  '6_22': require('../../assets/guitar_fret_samples/string6_fret22_D4.wav'),
};

// Preloaded AudioPlayers for the current song (only the needed samples)
const loadedPlayers: { [key: string]: AudioPlayer } = {};

// Track if audio mode is initialized
let audioModeInitialized = false;

// Get the sample key for a string and fret
function getSampleKey(stringNumber: number, fret: number): string {
  const clampedFret = Math.max(0, Math.min(22, fret));
  return `${stringNumber}_${clampedFret}`;
}

// Initialize audio mode (call once on app start)
export async function initAudio(): Promise<void> {
  if (audioModeInitialized) return;
  
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
    });
    audioModeInitialized = true;
  } catch (e) {
    console.warn('Error setting audio mode:', e);
  }
}

// Extract unique note keys from a song
export function getRequiredSampleKeys(song: Song): string[] {
  const keys = new Set<string>();
  
  for (const track of song.tracks) {
    for (const note of track.notes) {
      const key = getSampleKey(track.string, note.fret);
      keys.add(key);
    }
  }
  
  return Array.from(keys);
}

// Preload only the samples needed for a specific song
export async function preloadSamplesForSong(song: Song): Promise<void> {
  // First, unload any previously loaded samples
  unloadAllSamples();
  
  const requiredKeys = getRequiredSampleKeys(song);
  console.log(`Preloading ${requiredKeys.length} samples for song: ${song.name}`);
  
  // Create AudioPlayers for each required sample
  for (const key of requiredKeys) {
    const sample = ALL_SAMPLES[key];
    if (sample) {
      try {
        const player = createAudioPlayer(sample);
        loadedPlayers[key] = player;
      } catch (e) {
        console.warn(`Failed to load sample ${key}:`, e);
      }
    }
  }
  
  console.log(`Preloaded ${Object.keys(loadedPlayers).length} samples`);
}

// Unload all currently loaded samples
export function unloadAllSamples(): void {
  for (const key in loadedPlayers) {
    try {
      loadedPlayers[key].release();
    } catch (e) {
      // Ignore cleanup errors
    }
    delete loadedPlayers[key];
  }
}

// Check if samples are loaded
export function areSamplesLoaded(): boolean {
  return Object.keys(loadedPlayers).length > 0;
}

// Play a note - uses preloaded player, seeks to start and plays
// Note: Let the full sample play without duration cutoff
export function playNote(stringNumber: number, fret: number): void {
  const key = getSampleKey(stringNumber, fret);
  const player = loadedPlayers[key];
  
  if (!player) {
    console.warn(`No preloaded sample for string ${stringNumber}, fret ${fret}`);
    return;
  }
  
  try {
    player.seekTo(0);
    player.volume = 1.0;
    player.play();
  } catch (e) {
    console.error('Error playing note:', e);
  }
}

// Play a legato note (hammer-on or pull-off)
// Skips the pick attack for a smoother transition
export function playLegato(
  stringNumber: number,
  fret: number,
  technique: 'h' | 'p'
): void {
  const key = getSampleKey(stringNumber, fret);
  const player = loadedPlayers[key];
  
  if (!player) {
    console.warn(`No preloaded sample for string ${stringNumber}, fret ${fret}`);
    return;
  }
  
  try {
    player.seekTo(0.04); // Skip 40ms pick attack
    player.volume = technique === 'h' ? 0.75 : 0.65;
    player.play();
  } catch (e) {
    console.error('Error playing legato:', e);
  }
}

// Play a slide between two frets
export function playSlide(
  stringNumber: number,
  startFret: number,
  endFret: number
): void {
  const key = getSampleKey(stringNumber, startFret);
  const player = loadedPlayers[key];
  
  if (!player) {
    console.warn(`No preloaded sample for string ${stringNumber}, fret ${startFret}`);
    return;
  }
  
  try {
    player.seekTo(0);
    player.volume = 0.85;
    player.play();
    
    // Animate the playback rate for slide effect
    const semitones = endFret - startFret;
    const targetRate = Math.pow(2, semitones / 12);
    const steps = 20;
    const stepDuration = 100; // 100ms per step = 2 seconds total
    let currentStep = 0;
    
    const slideInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const currentRate = 1 + (targetRate - 1) * progress;
      
      try {
        player.setPlaybackRate(currentRate);
      } catch (e) {
        // Ignore rate errors
      }
      
      if (currentStep >= steps) {
        clearInterval(slideInterval);
      }
    }, stepDuration);
  } catch (e) {
    console.error('Error playing slide:', e);
  }
}

// Stop all sounds (cleanup)
export function stopAllSounds(): void {
  for (const key in loadedPlayers) {
    try {
      loadedPlayers[key].pause();
      loadedPlayers[key].seekTo(0);
    } catch (e) {
      // Ignore errors
    }
  }
}
