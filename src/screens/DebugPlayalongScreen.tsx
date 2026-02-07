import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Pressable } from 'react-native';
import Animated, { 
  useSharedValue, 
  useFrameCallback, 
  useDerivedValue,
  useAnimatedStyle,
  SharedValue,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Song, Note } from '../types/song';
import { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Playback constants
const HIT_LINE_X = 100;
const TOP_BAR_HEIGHT = 50;
const STRING_SPACING = 35; // Reduced for landscape mode

// Calculate STRING_AREA_TOP dynamically to center strings vertically
const TOTAL_STRINGS_HEIGHT = 5 * STRING_SPACING; // 5 gaps between 6 strings
const STRING_AREA_TOP = TOP_BAR_HEIGHT + ((SCREEN_HEIGHT - TOP_BAR_HEIGHT - TOTAL_STRINGS_HEIGHT) / 2);

// String colors
const STRING_COLORS = [
  '#e94560', // E (high) - string 1
  '#f39c12', // B - string 2
  '#3498db', // G - string 3
  '#2ecc71', // D - string 4
  '#9b59b6', // A - string 5
  '#e74c3c', // E (low) - string 6
];

// Playback constants
const PIXELS_PER_BEAT = 80; // Reduced to show more notes
const NOTE_HEIGHT = 28; // Height of the note bar
const NOTE_BORDER_RADIUS = 6; // Rounded corners
const TECHNIQUE_BRIDGE_WIDTH = 24; // Width of the technique indicator between notes

interface NoteRenderData {
  note: Note;
  stringNumber: number;
  y: number;
  baseBeat: number;
}

// Linked note chain for rendering hammer-ons, pull-offs, slides as single bar
interface LinkedNoteChain {
  notes: Note[];           // All notes in the chain
  techniques: ('h' | 'p' | '/')[];  // Techniques between notes
  stringNumber: number;
  y: number;
  startBeat: number;       // First note's beat
  totalDuration: number;   // Combined duration from first note start to last note end
}



// Hardcoded Smoke on the Water song for debugging
const smokeOnTheWater: Song = {
  id: 'debug-smoke-on-the-water',
  name: 'Smoke on the Water (Debug)',
  bpm: 120,
  beatsPerBar: 4,
  lastModified: Date.now(),
  tracks: [
    {
      string: 4, // D
      notes: [
        { beat: 0, len: 0.5, fret: 2, string: 6 }, // E
        
        { beat: 2, len: 1, fret: 2, string: 6 }, // E
        { beat: 3, len: 0.5, fret: 5, string: 3 }, // G
        
      ]
    },
    {
      string: 3, // G
      notes: [
        
        { beat: 4, len: 1.25, fret: 2, string: 6 }, // E
       
        { beat: 6, len: 1, fret: 2, string: 6 }, // E
        
        { beat: 9, len: 1, fret: 2, string: 6 }, // E
        { beat: 10, len: 1, fret: 7, string: 2 }, // B
        
        { beat: 12, len: 1, fret: 2, string: 6 }, // E
        
      ]
    },
    {
      string: 1, // G
      notes: [

        { beat: 11, len: 1, fret: 5, string: 3 }, // G
        
        { beat: 14, len: 0.25, fret: 7, string: 2 }, // B
        { beat: 15, len: 1, fret: 5, string: 3 }, // G
      ]
    }
  ]
};



export default function DebugPlayalongScreen(): React.JSX.Element {
  console.log('DebugPlayalongScreen mounted');
  console.log('Song:', smokeOnTheWater);

  const navigation = useNavigation<NavigationProp>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(100); // 25-125%, 100 = normal speed
  const playbackSpeedMultiplier = useSharedValue(1.0); // For worklet access
  const currentTimeMs = useSharedValue(0);
  const lastFrameTime = useSharedValue(0);
  const songEndedRef = useSharedValue(false);
  const topBarOffset = useSharedValue(0); // For sliding top bar animation

  // BPM to beats conversion: beats = time(ms) * (BPM / 60000)
  const beatsPerMs = smokeOnTheWater.bpm / 60000;

  // Calculate total song duration in beats (find the last note end)
  const songDurationBeats = useMemo(() => {
    let maxBeat = 0;
    for (const track of smokeOnTheWater.tracks) {
      for (const note of track.notes) {
        const noteEnd = note.beat + note.len;
        if (noteEnd > maxBeat) {
          maxBeat = noteEnd;
        }
      }
    }
    // Add buffer after the last note for final bounce (4 beats)
    return maxBeat + 4;
  }, []);

  // Derived value for current beat
  const currentBeat = useDerivedValue(() => {
    return currentTimeMs.value * beatsPerMs;
  });

  const handleSongEnd = useCallback(() => {
    if (!hasEnded) {
      setHasEnded(true);
      setIsPlaying(false);
      // Don't navigate back in debug mode - just stop
    }
  }, [hasEnded]);

  const togglePlayback = useCallback(() => {
    console.log('Toggle playback pressed, current isPlaying:', isPlaying);
    setIsPlaying(prev => !prev);
  }, [isPlaying]);

  // Handle playback speed change with buttons
  const handleSpeedChange = useCallback((delta: number) => {
    setPlaybackSpeed(prev => {
      const newSpeed = Math.max(25, Math.min(125, prev + delta));
      playbackSpeedMultiplier.value = newSpeed / 100;
      return newSpeed;
    });
  }, [playbackSpeedMultiplier]);

  // Reset speed to 100%
  const handleSpeedReset = useCallback(() => {
    setPlaybackSpeed(100);
    playbackSpeedMultiplier.value = 1.0;
  }, [playbackSpeedMultiplier]);

  // Long press acceleration for speed buttons
  const longPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressStep = useRef(1); // Start with step of 1
  const longPressCount = useRef(0);

  const startLongPress = useCallback((direction: 1 | -1) => {
    longPressStep.current = 1;
    longPressCount.current = 0;
    
    // Immediately apply first change
    handleSpeedChange(direction * longPressStep.current);
    
    // Start interval for continuous changes
    longPressInterval.current = setInterval(() => {
      longPressCount.current++;
      
      // Exponentially increase step: 1, 1, 1, 2, 2, 3, 3, 5, 5, 10...
      if (longPressCount.current > 15) {
        longPressStep.current = 10;
      } else if (longPressCount.current > 10) {
        longPressStep.current = 5;
      } else if (longPressCount.current > 6) {
        longPressStep.current = 3;
      } else if (longPressCount.current > 3) {
        longPressStep.current = 2;
      }
      
      handleSpeedChange(direction * longPressStep.current);
    }, 80); // 80ms interval for smooth acceleration
  }, [handleSpeedChange]);

  const stopLongPress = useCallback(() => {
    if (longPressInterval.current) {
      clearInterval(longPressInterval.current);
      longPressInterval.current = null;
    }
    longPressStep.current = 1;
    longPressCount.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressInterval.current) {
        clearInterval(longPressInterval.current);
      }
    };
  }, []);

  // Animate top bar slide up/down based on playing state
  useEffect(() => {
    topBarOffset.value = withTiming(isPlaying ? -TOP_BAR_HEIGHT : 0, { duration: 300 });
  }, [isPlaying, topBarOffset]);

  // Animated style for top bar
  const topBarAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: topBarOffset.value }],
    };
  });

  // Frame callback for smooth animation
  useFrameCallback((frameInfo) => {
    if (!isPlaying || songEndedRef.value) {
      lastFrameTime.value = frameInfo.timestamp;
      return;
    }

    const delta = frameInfo.timestamp - lastFrameTime.value;
    // Cap delta to prevent large jumps (e.g., when app is backgrounded)
    const cappedDelta = Math.min(delta, 100); // Max 100ms per frame
    lastFrameTime.value = frameInfo.timestamp;
    // Multiply delta by playback speed multiplier (0.25 to 1.25)
    currentTimeMs.value += cappedDelta * playbackSpeedMultiplier.value;

    // Check if song has ended
    const currentBeatValue = currentTimeMs.value * beatsPerMs;
    if (currentBeatValue >= songDurationBeats && !songEndedRef.value) {
      songEndedRef.value = true;
      runOnJS(handleSongEnd)();
    }
  }, true);

  // Calculate Y position for each string
  const getStringY = (stringNumber: number): number => {
    return STRING_AREA_TOP + (stringNumber - 1) * STRING_SPACING;
  };

  // Prepare all linked note chains (memoized)
  const allNoteChains = useMemo((): LinkedNoteChain[] => {
    const chains: LinkedNoteChain[] = [];
    
    for (const track of smokeOnTheWater.tracks) {
      // Sort notes by beat position
      const sortedNotes = [...track.notes].sort((a, b) => a.beat - b.beat);
      const processedIndices = new Set<number>();
      
      for (let i = 0; i < sortedNotes.length; i++) {
        if (processedIndices.has(i)) continue;
        
        const chainNotes: Note[] = [sortedNotes[i]];
        const techniques: ('h' | 'p' | '/')[] = [];
        let currentIndex = i;
        
        // Follow the chain while linkNext is defined
        while (sortedNotes[currentIndex]?.linkNext && currentIndex + 1 < sortedNotes.length) {
          techniques.push(sortedNotes[currentIndex].linkNext!);
          currentIndex++;
          chainNotes.push(sortedNotes[currentIndex]);
          processedIndices.add(currentIndex);
        }
        
        processedIndices.add(i);
        
        // Calculate total duration: from first note's beat to last note's end
        const firstNote = chainNotes[0];
        const lastNote = chainNotes[chainNotes.length - 1];
        const totalDuration = (lastNote.beat + lastNote.len) - firstNote.beat;
        
        chains.push({
          notes: chainNotes,
          techniques,
          stringNumber: track.string,
          y: getStringY(track.string),
          startBeat: firstNote.beat,
          totalDuration,
        });
      }
    }
    
    return chains;
  }, []);

  // Prepare sorted flat notes for ball animation
  const sortedFlatNotes = useMemo(() => {
    const notes: (Note & { stringY: number })[] = [];
    for (const track of smokeOnTheWater.tracks) {
      const trackStringY = getStringY(track.string);
      for (const note of track.notes) {
        notes.push({ ...note, stringY: trackStringY });
      }
    }
    return notes.sort((a, b) => a.beat - b.beat);
  }, []);

  // Ball animation constants
  const activeNoteIndex = useSharedValue(0);
  const MAX_BOUNCE_Y = 40;
  const MIN_BOUNCE_V = 8;
  const NOTE_TOP_OFFSET = 20;

  // Ball Y position calculation
  const ballY = useDerivedValue(() => {
    const beat = currentBeat.value;
    const notes = sortedFlatNotes;
    const totalNotes = notes.length;

    if (totalNotes === 0) return STRING_AREA_TOP;

    // O(1) INDEX TRACKING
    let idx = activeNoteIndex.value;
    while (idx < totalNotes - 1 && beat > notes[idx + 1].beat) {
      idx++;
    }
    while (idx > 0 && beat < notes[idx].beat) {
      idx--;
    }
    activeNoteIndex.value = idx;

    const currentNote = notes[idx];
    const nextNote = notes[idx + 1];

    // If we are at the end of the song
    if (!nextNote) return currentNote.stringY - NOTE_TOP_OFFSET;

    // DYNAMIC HEIGHT CALCULATION
    const gap = nextNote.beat - currentNote.beat;
    const progress = (beat - currentNote.beat) / gap;
    const clampedProgress = Math.max(0, Math.min(1, progress));

    // Determine the dynamic height based on the gap
    const availableRoom = currentNote.stringY - NOTE_TOP_OFFSET - MAX_BOUNCE_Y;
    const targetHeight = Math.max(MIN_BOUNCE_V, (gap / 4) * availableRoom);
    const finalHeight = Math.min(targetHeight, availableRoom);

    // PARABOLIC JUMP
    const jumpOffset = 4 * finalHeight * clampedProgress * (1 - clampedProgress);

    // Linear Y interpolation
    const lerpY = currentNote.stringY + (nextNote.stringY - currentNote.stringY) * clampedProgress;

    return lerpY - NOTE_TOP_OFFSET - jumpOffset;
  });

  // Calculate bar numbers to render (memoized)
  const barNumbers = useMemo((): number[] => {
    const beatsPerBar = smokeOnTheWater.beatsPerBar || 4; // Default to 4/4 if not specified
    const totalBars = Math.ceil(songDurationBeats / beatsPerBar);
    return Array.from({ length: totalBars + 1 }, (_, i) => i);
  }, [songDurationBeats]);

  // Total strings height for bar lines
  const totalStringsHeight = 5 * STRING_SPACING;

  return (
    <View style={styles.container}>
      {/* Top Bar - slides up when playing */}
      <Animated.View style={[styles.topBar, topBarAnimatedStyle]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.songTitle} numberOfLines={1}>{smokeOnTheWater.name}</Text>
        <Text style={styles.bpmText}>{smokeOnTheWater.bpm} BPM</Text>
      </Animated.View>

      {/* Playalong Area */}
      <TouchableOpacity 
        style={styles.playArea} 
        onPress={togglePlayback}
        activeOpacity={1}
      >
        {/* Floating Speed Control - Top Right */}
        <View style={styles.floatingSpeedControl} pointerEvents="box-none">
          <View style={styles.speedControlContainer}>
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(-1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>-</Text>
            </Pressable>
            
            <TouchableOpacity 
              style={styles.speedValueContainer}
              onPress={handleSpeedReset}
              activeOpacity={0.7}
            >
              <Text style={[styles.speedValueText, playbackSpeed === 100 && styles.speedValueNormal]}>
                {playbackSpeed}%
              </Text>
            </TouchableOpacity>
            
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        {/* Static strings display */}
        <View style={styles.stringsContainer}>
          {[1, 2, 3, 4, 5, 6].map((stringNum) => (
            <View
              key={`string-${stringNum}`}
              style={[
                styles.stringLine,
                {
                  top: getStringY(stringNum) - 1,
                  backgroundColor: STRING_COLORS[stringNum - 1],
                  height: stringNum <= 3 ? 2 : 3,
                }
              ]}
            />
          ))}

          {/* Subtle hit zone indicator line */}
          <View style={styles.hitLine} />
        </View>

        {/* Animated Bar Lines Layer */}
        <View style={styles.barLinesContainer}>
          {barNumbers.map((barNumber) => {
            const barBeat = barNumber * (smokeOnTheWater.beatsPerBar || 4);
            const barStyle = useAnimatedStyle(() => {
              const x = HIT_LINE_X + ((barBeat - currentBeat.value) * PIXELS_PER_BEAT);
              const isVisible = x > -10 && x < SCREEN_WIDTH + 10;
              return {
                position: 'absolute' as const,
                left: x,
                top: STRING_AREA_TOP - 30,
                height: totalStringsHeight + 60,
                width: 2,
                backgroundColor: '#ffffff',
                opacity: isVisible ? 0.4 : 0,
              };
            });

            return (
              <Animated.View key={`bar-${barNumber}`} style={barStyle}>
                <View style={styles.barLineLabel}>
                  <Text style={styles.barLineLabelText}>{barNumber + 1}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* Animated Notes Layer */}
        <View style={styles.notesContainer}>
          {allNoteChains.map((chainData, index) => {
            const totalWidth = Math.max(chainData.totalDuration * PIXELS_PER_BEAT, 30);
            const chainStyle = useAnimatedStyle(() => {
              const beatDiff = chainData.startBeat - currentBeat.value;
              const x = HIT_LINE_X + (beatDiff * PIXELS_PER_BEAT);
              const isVisible = x > -totalWidth && x < SCREEN_WIDTH + 100;
              return {
                position: 'absolute' as const,
                left: x,
                top: chainData.y - (NOTE_HEIGHT / 2),
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                height: NOTE_HEIGHT,
                opacity: isVisible ? 1 : 0,
              };
            });

            const stringColor = STRING_COLORS[chainData.stringNumber - 1];

            return (
              <Animated.View key={`chain-${chainData.stringNumber}-${chainData.startBeat}-${index}`} style={chainStyle}>
                {chainData.notes.map((note, noteIndex) => {
                  const noteWidth = Math.max(note.len * PIXELS_PER_BEAT, 30);
                  const technique = noteIndex > 0 ? chainData.techniques[noteIndex - 1] : null;
                  const hasNextLink = noteIndex < chainData.techniques.length;

                  return (
                    <React.Fragment key={`note-${noteIndex}`}>
                      {technique && (
                        <View style={[styles.techniqueBridge, { backgroundColor: stringColor }]}>
                          <Text style={styles.techniqueText}>{technique}</Text>
                        </View>
                      )}
                      <View style={[styles.noteBar, { backgroundColor: stringColor, width: noteWidth - (hasNextLink ? TECHNIQUE_BRIDGE_WIDTH / 2 : 0) }]}>
                        <Text style={styles.fretText}>{note.fret}</Text>
                      </View>
                    </React.Fragment>
                  );
                })}
              </Animated.View>
            );
          })}
        </View>

        {/* Ball Animation */}
        <Animated.View style={useAnimatedStyle(() => ({
          position: 'absolute',
          left: HIT_LINE_X - 10,
          top: ballY.value,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#ff0000',
          zIndex: 10,
        }))} />

        {/* Play/Pause indicator */}
        <View style={styles.playIndicator}>
          <Text style={styles.playIndicatorText}>
            {isPlaying ? 'Tap to pause' : 'Tap to play'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  songTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bpmText: {
    color: '#888',
    fontSize: 14,
  },
  playArea: {
    flex: 1,
  },
  floatingSpeedControl: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 100,
  },
  speedControlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 52, 96, 0.95)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  speedBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#16213e',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  speedValueContainer: {
    paddingHorizontal: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  speedValueText: {
    color: '#e94560',
    fontSize: 15,
    fontWeight: 'bold',
  },
  speedValueNormal: {
    color: '#2ecc71',
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  stringsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  stringLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0.6,
  },
  hitLine: {
    position: 'absolute',
    left: HIT_LINE_X,
    top: STRING_AREA_TOP - 20,
    width: 1,
    height: 5 * STRING_SPACING + 40,
    backgroundColor: '#ffffff',
    opacity: 0.3,
  },
  barLinesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  notesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  playIndicator: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  playIndicatorText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '500',
  },
  // AnimatedBarLine styles
  barLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#666',
    opacity: 0.5,
  },
  barLineLabel: {
    position: 'absolute',
    top: -20,
    left: -10,
    width: 22,
    height: 18,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLineLabelText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
  },
  // AnimatedNote styles
  noteContainer: {
    position: 'absolute',
  },
  noteBar: {
    height: NOTE_HEIGHT,
    borderRadius: NOTE_BORDER_RADIUS,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 30,
  },
  fretText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  techniqueBridge: {
    width: TECHNIQUE_BRIDGE_WIDTH,
    height: NOTE_HEIGHT - 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
    marginHorizontal: -2, // Overlap slightly with notes for visual connection
  },
  techniqueText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  lineCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  animatedLine: {
    position: 'absolute',
    top: STRING_AREA_TOP - 20,
    width: 2,
    height: 5 * STRING_SPACING + 40,
    backgroundColor: '#fff',
    opacity: 0.8,
  },

  // Legacy styles (keeping for compatibility)
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playbackBar: {
    position: 'absolute',
    top: STRING_AREA_TOP - 20,
    width: 4,
    height: 5 * STRING_SPACING + 40,
    backgroundColor: '#ffffff',
    opacity: 0.8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  songName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  bpm: {
    color: '#888',
    fontSize: 16,
    marginBottom: 20,
  },
  status: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#e94560',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});