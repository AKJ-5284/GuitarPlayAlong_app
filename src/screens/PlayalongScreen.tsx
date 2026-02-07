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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Song, Note } from '../types/song';
import { RootStackParamList } from '../../App';

type PlayalongRouteProp = RouteProp<RootStackParamList, 'Playalong'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Playback constants
const PIXELS_PER_BEAT = 80; // Reduced to show more notes
const HIT_LINE_X = 100;
const TOP_BAR_HEIGHT = 50;
const STRING_SPACING = 35; // Reduced for landscape mode
const NOTE_HEIGHT = 28; // Height of the note bar
const NOTE_BORDER_RADIUS = 6; // Rounded corners
const TECHNIQUE_BRIDGE_WIDTH = 24; // Width of the technique indicator between notes

// Ball animation constants
const MAX_BOUNCE_Y = 30;
const MIN_BOUNCE_V = 10;
const NOTE_TOP_OFFSET = 20;

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

// Animated Bar Line Component
const AnimatedBarLine = ({ 
  barNumber, 
  beatsPerBar,
  currentBeat,
  stringAreaTop,
  totalStringsHeight,
}: { 
  barNumber: number;
  beatsPerBar: number;
  currentBeat: SharedValue<number>;
  stringAreaTop: number;
  totalStringsHeight: number;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // barLineX = (barNumber * beatsPerBar * PixelsPerBeat) - (currentBeat * PixelsPerBeat)
    const barBeat = barNumber * beatsPerBar;
    const x = HIT_LINE_X + ((barBeat - currentBeat.value) * PIXELS_PER_BEAT);
    
    // Hide if off screen
    const isVisible = x > -10 && x < SCREEN_WIDTH + 10;
    
    return {
      position: 'absolute' as const,
      left: x,
      top: stringAreaTop - 30,
      height: totalStringsHeight + 60,
      width: 2,
      backgroundColor: '#ffffff',
      opacity: isVisible ? 0.4 : 0,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <View style={styles.barLineLabel}>
        <Text style={styles.barLineLabelText}>{barNumber + 1}</Text>
      </View>
    </Animated.View>
  );
};

// Animated Note Component - renders linked notes with bridges between them
const AnimatedNote = ({ 
  chainData, 
  currentBeat 
}: { 
  chainData: LinkedNoteChain; 
  currentBeat: SharedValue<number>;
}) => {
  // Calculate total width needed for the chain
  const totalWidth = Math.max(chainData.totalDuration * PIXELS_PER_BEAT, 30);
  
  const animatedStyle = useAnimatedStyle(() => {
    const beatDiff = chainData.startBeat - currentBeat.value;
    const x = HIT_LINE_X + (beatDiff * PIXELS_PER_BEAT);
    
    // Hide if off screen (account for total width)
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
    <Animated.View style={animatedStyle}>
      {chainData.notes.map((note, index) => {
        // Calculate this note's width based on its duration
        const noteWidth = Math.max(note.len * PIXELS_PER_BEAT, 30);
        const technique = index > 0 ? chainData.techniques[index - 1] : null;
        
        // Calculate gap to next note (if there's a technique bridge)
        // Gap is the time between this note's end and the next note's start
        const nextNote = chainData.notes[index + 1];
        const hasNextLink = index < chainData.techniques.length;
        
        // Calculate offset: position relative to chain start
        const noteOffset = (note.beat - chainData.startBeat) * PIXELS_PER_BEAT;
        
        return (
          <React.Fragment key={`note-${index}`}>
            {/* Technique bridge before this note (if not first note) */}
            {technique && (
              <View style={[styles.techniqueBridge, { backgroundColor: stringColor }]}>
                <Text style={styles.techniqueText}>{technique}</Text>
              </View>
            )}
            {/* The note box */}
            <View style={[styles.noteBar, { backgroundColor: stringColor, width: noteWidth - (hasNextLink ? TECHNIQUE_BRIDGE_WIDTH / 2 : 0) }]}>
              <Text style={styles.fretText}>{note.fret}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </Animated.View>
  );
};

export default function PlayalongScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayalongRouteProp>();
  const { song } = route.params;
  
  const activeNoteIndex = useSharedValue(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(100); // 25-125%, 100 = normal speed
  const playbackSpeedMultiplier = useSharedValue(1.0); // For worklet access
  const currentTimeMs = useSharedValue(0);
  const lastFrameTime = useSharedValue(0);
  const songEndedRef = useSharedValue(false);
  const topBarOffset = useSharedValue(0); // For sliding top bar animation

  // BPM to beats conversion: beats = time(ms) * (BPM / 60000)
  const beatsPerMs = song.bpm / 60000;

  // Calculate total song duration in beats (find the last note end)
  const songDurationBeats = useMemo(() => {
    let maxBeat = 0;
    for (const track of song.tracks) {
      for (const note of track.notes) {
        const noteEnd = note.beat + note.len;
        if (noteEnd > maxBeat) {
          maxBeat = noteEnd;
        }
      }
    }
    // Add buffer after the last note for final bounce (4 beats)
    return maxBeat + 4;
  }, [song]);

  // Derived value for current beat
  const currentBeat = useDerivedValue(() => {
    return currentTimeMs.value * beatsPerMs;
  });

  const handleSongEnd = useCallback(() => {
    if (!hasEnded) {
      setHasEnded(true);
      setIsPlaying(false);
      navigation.goBack();
    }
  }, [navigation, hasEnded]);

  const togglePlayback = useCallback(() => {
    setIsPlaying(prev => !prev);
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

  // Frame callback for smooth animation
  useFrameCallback((frameInfo) => {
    if (!isPlaying || songEndedRef.value) {
      lastFrameTime.value = frameInfo.timestamp;
      return;
    }

    const delta = frameInfo.timestamp - lastFrameTime.value;
    lastFrameTime.value = frameInfo.timestamp;
    // Multiply delta by playback speed multiplier (0.25 to 1.25)
    currentTimeMs.value += delta * playbackSpeedMultiplier.value;

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
    
    for (const track of song.tracks) {
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
  }, [song]);

  // Prepare sorted flat notes for ball animation
  const sortedFlatNotes = useMemo(() => {
    const notes: (Note & { stringY: number; stringNumber: number })[] = [];
    for (const track of song.tracks) {
      const trackStringY = getStringY(track.string);
      for (const note of track.notes) {
        notes.push({ ...note, stringY: trackStringY, stringNumber: track.string });
      }
    }
    return notes.sort((a, b) => a.beat - b.beat);
  }, [song]);

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

    if (idx === 0 && beat < notes[0].beat) {
      // Bounce on the first note from the start
      const progress = beat / notes[0].beat;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const jumpOffset = 4 * MAX_BOUNCE_Y * clampedProgress * (1 - clampedProgress);
      return notes[0].stringY - NOTE_TOP_OFFSET - jumpOffset;
    }

    // If we are at the end of the song
    if (!nextNote) {
      // Bounce on the last note with max height until the end
      const remainingBeats = songDurationBeats - currentNote.beat;
      if (remainingBeats <= 0) return currentNote.stringY - NOTE_TOP_OFFSET;
      const progress = (beat - currentNote.beat) / remainingBeats;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const jumpOffset = 4 * MAX_BOUNCE_Y * clampedProgress * (1 - clampedProgress);
      return currentNote.stringY - NOTE_TOP_OFFSET - jumpOffset;
    }

    // DYNAMIC HEIGHT CALCULATION
    const gap = nextNote.beat - currentNote.beat;
    const progress = (beat - currentNote.beat) / gap;
    const clampedProgress = Math.max(0, Math.min(1, progress));

    // Determine the dynamic height based on the gap
    let availableRoom = currentNote.stringY - NOTE_TOP_OFFSET - MAX_BOUNCE_Y;
    if (currentNote.stringNumber === 1) {
      availableRoom *= 2; // Increase bounce height for the first string
    }
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
    const beatsPerBar = song.beatsPerBar || 4; // Default to 4/4 if not specified
    const totalBars = Math.ceil(songDurationBeats / beatsPerBar);
    return Array.from({ length: totalBars + 1 }, (_, i) => i);
  }, [song.beatsPerBar, songDurationBeats]);

  // Total strings height for bar lines
  const totalStringsHeight = 5 * STRING_SPACING;

  return (
    <View style={styles.container}>
      {/* Top Bar - slides up when playing */}
      <Animated.View style={[styles.topBar, topBarAnimatedStyle]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.songTitle} numberOfLines={1}>{song.name}</Text>
        <Text style={styles.bpmText}>{song.bpm} BPM</Text>
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
            {/* Decrease button */}
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(-1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>−</Text>
            </Pressable>
            
            {/* Speed display - tap to reset */}
            <TouchableOpacity 
              style={styles.speedValueContainer}
              onPress={handleSpeedReset}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.speedValueText,
                playbackSpeed === 100 && styles.speedValueNormal
              ]}>
                {playbackSpeed}%
              </Text>
            </TouchableOpacity>
            
            {/* Increase button */}
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        {/* Static strings */}
        <View style={styles.stringsContainer}>
          {/* Render guitar strings */}
          {[1, 2, 3, 4, 5, 6].map((stringNum) => (
            <View
              key={`string-${stringNum}`}
              style={[styles.stringLine, {
                top: getStringY(stringNum) - (stringNum <= 3 ? 1 : 1.5),
                height: stringNum <= 3 ? 2 : 3,
                backgroundColor: STRING_COLORS[stringNum - 1],
                opacity: 0.6,
              }]}
            />
          ))}

          {/* Subtle hit zone indicator line */}
          <View style={[styles.hitLine, {
            left: HIT_LINE_X,
            top: STRING_AREA_TOP - 20,
            height: 5 * STRING_SPACING + 40,
          }]} />
        </View>

        {/* Animated Bar Lines Layer */}
        <View style={styles.barLinesContainer}>
          {barNumbers.map((barNumber) => (
            <AnimatedBarLine
              key={`bar-${barNumber}`}
              barNumber={barNumber}
              beatsPerBar={song.beatsPerBar || 4}
              currentBeat={currentBeat}
              stringAreaTop={STRING_AREA_TOP}
              totalStringsHeight={totalStringsHeight}
            />
          ))}
        </View>

        {/* Animated Notes Layer */}
        <View style={styles.notesContainer}>
          {allNoteChains.map((chainData, index) => (
            <AnimatedNote
              key={`chain-${chainData.stringNumber}-${chainData.startBeat}-${index}`}
              chainData={chainData}
              currentBeat={currentBeat}
            />
          ))}
        </View>

        {/* Ball Animation */}
        <Animated.View style={useAnimatedStyle(() => ({
          position: 'absolute',
          left: HIT_LINE_X - 10,
          top: ballY.value,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#ffffff',
          zIndex: 10,
        }))} />

        {/* Play/Pause indicator */}
        <View style={styles.playIndicator}>
          <Text style={styles.playIndicatorText}>
            {isPlaying ? '⏸ Tap to Pause' : '▶ Tap to Play'}
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
    ...StyleSheet.absoluteFillObject,
  },
  stringLine: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hitLine: {
    position: 'absolute',
    width: 1,
    backgroundColor: '#ffffff',
    opacity: 0.3,
  },
  notesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  barLinesContainer: {
    ...StyleSheet.absoluteFillObject,
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
});
