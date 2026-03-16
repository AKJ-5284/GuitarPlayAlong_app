package expo.modules.fluidsynth

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.sun.jna.Library
import com.sun.jna.Native
import com.sun.jna.Pointer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.log2
import kotlin.math.roundToInt
import kotlinx.coroutines.*

/**
 * JNA interface mapping FluidSynth C library functions
 */
interface FluidSynthLibrary : Library {
    companion object {
        val INSTANCE: FluidSynthLibrary by lazy {
            // First load the library using System.loadLibrary to ensure it's in memory
            try {
                System.loadLibrary("fluidsynth")
                android.util.Log.d("ExpoFluidsynth", "Successfully loaded libfluidsynth.so via System.loadLibrary")
            } catch (e: UnsatisfiedLinkError) {
                android.util.Log.e("ExpoFluidsynth", "Failed to load libfluidsynth.so: ${e.message}", e)
                throw e
            }
            // Now JNA can find and use it
            Native.load("fluidsynth", FluidSynthLibrary::class.java)
        }
    }

    // Settings
    fun new_fluid_settings(): Pointer?
    fun delete_fluid_settings(settings: Pointer?)
    fun fluid_settings_setstr(settings: Pointer?, name: String?, value: String?): Int
    fun fluid_settings_setnum(settings: Pointer?, name: String?, value: Double): Int
    fun fluid_settings_setint(settings: Pointer?, name: String?, value: Int): Int

    // Synth
    fun new_fluid_synth(settings: Pointer?): Pointer?
    fun delete_fluid_synth(synth: Pointer?)
    fun fluid_synth_sfload(synth: Pointer?, filename: String?, reset_presets: Int): Int
    fun fluid_synth_noteon(synth: Pointer?, chan: Int, key: Int, vel: Int): Int
    fun fluid_synth_noteoff(synth: Pointer?, chan: Int, key: Int): Int
    fun fluid_synth_all_notes_off(synth: Pointer?, chan: Int): Int
    fun fluid_synth_all_sounds_off(synth: Pointer?, chan: Int): Int
    fun fluid_synth_program_select(synth: Pointer?, chan: Int, sfont_id: Int, bank: Int, preset: Int): Int
    fun fluid_synth_set_gain(synth: Pointer?, gain: Float)
    
    // Audio rendering - write interleaved stereo 16-bit samples
    fun fluid_synth_write_s16(synth: Pointer?, len: Int, lout: ByteArray?, loff: Int, lincr: Int, rout: ByteArray?, roff: Int, rincr: Int): Int
    
    // MIDI Player functions for native sequencing
    fun new_fluid_player(synth: Pointer?): Pointer?
    fun delete_fluid_player(player: Pointer?): Int
    fun fluid_player_add(player: Pointer?, midifile: String?): Int
    fun fluid_player_play(player: Pointer?): Int
    fun fluid_player_stop(player: Pointer?): Int
    fun fluid_player_set_tempo(player: Pointer?, tempo_type: Int, tempo: Double): Int
    fun fluid_player_get_status(player: Pointer?): Int
    fun fluid_player_seek(player: Pointer?, ticks: Int): Int
}

class ExpoFluidsynthModule : Module() {
    companion object {
        private const val TAG = "ExpoFluidsynth"
        private const val SAMPLE_RATE = 44100
        private const val GUITAR_PRESET = 24 // Acoustic Guitar (nylon) in General MIDI (0-based)
        private const val GUITAR_TRANSPOSE_SEMITONES = 12
    }

    // FluidSynth pointers
    private var settings: Pointer? = null
    private var synth: Pointer? = null
    private var soundfontId: Int = -1
    private var isInitialized: Boolean = false
    
    // Native MediaPlayer for pre-rendered WAV playback
    private var mediaPlayer: MediaPlayer? = null
    @Volatile private var currentPlaybackSpeed: Float = 1.0f
    
    // FluidSynth MIDI player for native MIDI sequencing (optional)
    private var fluidPlayer: Pointer? = null
    @Volatile private var isMidiPlaying: Boolean = false
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private val fluidsynth: FluidSynthLibrary by lazy { FluidSynthLibrary.INSTANCE }

    override fun definition() = ModuleDefinition {
        Name("expo-fluidsynth")
        
        // Events for playback callbacks
        Events(
            "onAudioPlaybackComplete",
            "onAudioPlaybackError",
            "onMidiPlaybackComplete"
        )

        // Check if synth is initialized
        Function("isInitialized") {
            isInitialized
        }

        // Copy a SoundFont from APK assets to the app's files directory and return the path
        AsyncFunction("getAssetPath") { assetName: String ->
            try {
                val context = appContext.reactContext ?: throw Exception("No context available")
                val filesDir = context.filesDir
                val targetFile = File(filesDir, assetName)
                
                // Check if already copied
                if (targetFile.exists()) {
                    Log.d(TAG, "Asset already exists at: ${targetFile.absolutePath}")
                    return@AsyncFunction mapOf(
                        "success" to true,
                        "path" to targetFile.absolutePath
                    )
                }
                
                // Copy from assets
                Log.d(TAG, "Copying asset $assetName to ${targetFile.absolutePath}")
                context.assets.open(assetName).use { inputStream ->
                    FileOutputStream(targetFile).use { outputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
                
                Log.d(TAG, "Asset copied successfully")
                mapOf(
                    "success" to true,
                    "path" to targetFile.absolutePath
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to copy asset: ${e.message}", e)
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error")
                )
            }
        }

        // Initialize the FluidSynth engine with a SoundFont file
        AsyncFunction("initSynth") { soundfontPath: String, sampleRate: Double?, gain: Double? ->
            try {
                // Cleanup any existing instance
                cleanup()

                Log.d(TAG, "Initializing FluidSynth with soundfont: $soundfontPath")

                // Create settings
                settings = fluidsynth.new_fluid_settings()
                if (settings == null) {
                    throw Exception("Failed to create FluidSynth settings")
                }

                // Configure synth settings (no audio driver - we'll render manually)
                val rate = sampleRate?.toInt() ?: SAMPLE_RATE
                fluidsynth.fluid_settings_setnum(settings, "synth.sample-rate", rate.toDouble())
                fluidsynth.fluid_settings_setint(settings, "synth.polyphony", 64)
                fluidsynth.fluid_settings_setint(settings, "synth.midi-channels", 16)
                fluidsynth.fluid_settings_setint(settings, "synth.cpu-cores", 2)
                
                // Disable reverb and chorus for lower latency
                fluidsynth.fluid_settings_setstr(settings, "synth.reverb.active", "no")
                fluidsynth.fluid_settings_setstr(settings, "synth.chorus.active", "no")

                // Create synth
                synth = fluidsynth.new_fluid_synth(settings)
                if (synth == null) {
                    cleanup()
                    throw Exception("Failed to create FluidSynth synth")
                }

                // Set gain
                val synthGain = (gain ?: 0.8).toFloat()
                fluidsynth.fluid_synth_set_gain(synth, synthGain)

                // Load SoundFont
                soundfontId = fluidsynth.fluid_synth_sfload(synth, soundfontPath, 1)
                if (soundfontId < 0) {
                    cleanup()
                    throw Exception("Failed to load SoundFont: $soundfontPath")
                }

                Log.d(TAG, "SoundFont loaded with ID: $soundfontId")
                
                // Select guitar preset on all channels (bank 0, preset 24 = nylon guitar)
                for (channel in 0..5) {
                    fluidsynth.fluid_synth_program_select(synth, channel, soundfontId, 0, GUITAR_PRESET)
                }
                
                // NOTE: No real-time audio thread needed - we use pre-rendered WAV files
                // played through MediaPlayer for zero-latency playback
                
                isInitialized = true
                
                mapOf(
                    "success" to true,
                    "soundfontId" to soundfontId,
                    "sampleRate" to rate
                )
            } catch (e: Exception) {
                Log.e(TAG, "initSynth failed: ${e.message}", e)
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error")
                )
            }
        }

        // Play a note immediately
        Function("playNote") { channel: Int, midiNote: Int, velocity: Int ->
            if (!isInitialized || synth == null) {
                Log.w(TAG, "playNote called but synth not initialized")
                return@Function false
            }
            
            val result = fluidsynth.fluid_synth_noteon(synth, channel, midiNote, velocity)
            result == 0
        }

        // Stop a note immediately
        Function("stopNote") { channel: Int, midiNote: Int ->
            if (!isInitialized || synth == null) {
                return@Function false
            }
            
            val result = fluidsynth.fluid_synth_noteoff(synth, channel, midiNote)
            result == 0
        }

        // Play a note after a delay (for precise scheduling)
        AsyncFunction("playNoteDelayed") { channel: Int, midiNote: Int, velocity: Int, delayMs: Long ->
            if (!isInitialized || synth == null) {
                return@AsyncFunction false
            }

            if (delayMs <= 0) {
                // Play immediately
                fluidsynth.fluid_synth_noteon(synth, channel, midiNote, velocity) == 0
            } else {
                // Schedule with delay
                mainHandler.postDelayed({
                    if (isInitialized && synth != null) {
                        fluidsynth.fluid_synth_noteon(synth, channel, midiNote, velocity)
                    }
                }, delayMs)
                true
            }
        }

        // Play a guitar tab (string + fret -> MIDI note)
        // Guitar standard tuning: String 1 = E4(64), String 6 = E2(40)
        Function("playTab") { stringNum: Int, fret: Int, velocity: Int ->
            if (!isInitialized || synth == null) {
                return@Function false
            }

            // String 1 (high E) to String 6 (low E)
            val baseNotes = intArrayOf(64, 59, 55, 50, 45, 40) // E4, B3, G3, D3, A2, E2
            if (stringNum < 1 || stringNum > 6) {
                Log.w(TAG, "Invalid string number: $stringNum")
                return@Function false
            }

            val midiNote = baseNotes[stringNum - 1] + fret + GUITAR_TRANSPOSE_SEMITONES
            val channel = stringNum - 1 // Use different channel per string for polyphony
            
            val result = fluidsynth.fluid_synth_noteon(synth, channel, midiNote, velocity)
            result == 0
        }

        // Stop a guitar string
        Function("stopTab") { stringNum: Int, fret: Int ->
            if (!isInitialized || synth == null) {
                return@Function false
            }

            // String 1 (high E) to String 6 (low E)
            val baseNotes = intArrayOf(64, 59, 55, 50, 45, 40) // E4, B3, G3, D3, A2, E2
            if (stringNum < 1 || stringNum > 6) {
                return@Function false
            }

            val midiNote = baseNotes[stringNum - 1] + fret + GUITAR_TRANSPOSE_SEMITONES
            val channel = stringNum - 1
            
            val result = fluidsynth.fluid_synth_noteoff(synth, channel, midiNote)
            result == 0
        }

        // Play a slide from one fret to another with precise native timing
        Function("playSlide") { stringNum: Int, fromFret: Int, toFret: Int, durationMs: Long ->
            if (!isInitialized || synth == null) {
                return@Function false
            }

            val baseNotes = intArrayOf(64, 59, 55, 50, 45, 40)
            if (stringNum < 1 || stringNum > 6) {
                return@Function false
            }

            val channel = stringNum - 1
            val fromMidi = baseNotes[stringNum - 1] + fromFret + GUITAR_TRANSPOSE_SEMITONES
            val toMidi = baseNotes[stringNum - 1] + toFret + GUITAR_TRANSPOSE_SEMITONES

            // Launch coroutine for precise timing
            CoroutineScope(Dispatchers.Default).launch {
                // Play starting note
                fluidsynth.fluid_synth_noteon(synth, channel, fromMidi, 100)
                
                // Wait precisely for the duration
                delay(durationMs)
                
                // Stop first note and play target note
                fluidsynth.fluid_synth_noteoff(synth, channel, fromMidi)
                fluidsynth.fluid_synth_noteon(synth, channel, toMidi, 100)
            }
            true
        }

        // Stop all notes on all channels
        Function("allNotesOff") {
            if (!isInitialized || synth == null) {
                return@Function false
            }

            for (channel in 0..15) {
                fluidsynth.fluid_synth_all_notes_off(synth, channel)
            }
            true
        }

        // Select instrument/preset for a channel
        AsyncFunction("selectProgram") { channel: Int, bank: Int, preset: Int ->
            if (!isInitialized || synth == null || soundfontId < 0) {
                return@AsyncFunction false
            }

            val result = fluidsynth.fluid_synth_program_select(synth, channel, soundfontId, bank, preset)
            result == 0
        }

        // Set master gain (0.0 to 10.0)
        Function("setGain") { gain: Double ->
            if (!isInitialized || synth == null) {
                return@Function false
            }

            fluidsynth.fluid_synth_set_gain(synth, gain.toFloat())
            true
        }

        // ========================================
        // Native Audio Player with Time-Stretching
        // ========================================
        
        // Load and play an audio file with initial playback speed (pitch-preserving tempo change)
        AsyncFunction("loadAndPlayAudio") { filePath: String, initialSpeed: Float ->
            try {
                Log.d(TAG, "Loading audio file: $filePath with speed: $initialSpeed")
                
                // Release any existing MediaPlayer
                mediaPlayer?.let {
                    try {
                        if (it.isPlaying) it.stop()
                        it.release()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error releasing previous MediaPlayer", e)
                    }
                }
                
                // Create new MediaPlayer
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(filePath)
                    
                    // Set audio attributes for low-latency playback
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    
                    // Prepare synchronously (blocking)
                    prepare()
                    
                    // Set playback speed using PlaybackParams (Android 6.0+)
                    // This changes tempo without affecting pitch
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        playbackParams = PlaybackParams().apply {
                            speed = initialSpeed.coerceIn(0.25f, 4.0f)
                            pitch = 1.0f // Keep pitch unchanged
                        }
                    }
                    
                    currentPlaybackSpeed = initialSpeed
                    
                    // Set completion listener
                    setOnCompletionListener {
                        Log.d(TAG, "Audio playback completed")
                        sendEvent("onAudioPlaybackComplete", mapOf(
                            "filePath" to filePath
                        ))
                    }
                    
                    setOnErrorListener { mp, what, extra ->
                        Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                        sendEvent("onAudioPlaybackError", mapOf(
                            "error" to "MediaPlayer error: $what",
                            "code" to what
                        ))
                        true
                    }
                    
                    // Start playback
                    start()
                }
                
                Log.d(TAG, "Audio playback started successfully")
                mapOf(
                    "success" to true,
                    "duration" to (mediaPlayer?.duration ?: 0),
                    "speed" to currentPlaybackSpeed
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load and play audio: ${e.message}", e)
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error")
                )
            }
        }
        
        // Set playback speed dynamically (pitch-preserving tempo change)
        Function("setPlaybackSpeed") { speed: Float ->
            if (mediaPlayer == null) {
                Log.w(TAG, "setPlaybackSpeed called but no MediaPlayer active")
                return@Function false
            }
            
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val clampedSpeed = speed.coerceIn(0.25f, 4.0f)
                    mediaPlayer?.playbackParams = mediaPlayer?.playbackParams?.setSpeed(clampedSpeed)
                        ?: PlaybackParams().setSpeed(clampedSpeed).setPitch(1.0f)
                    currentPlaybackSpeed = clampedSpeed
                    Log.d(TAG, "Playback speed set to: $clampedSpeed")
                    true
                } else {
                    Log.w(TAG, "PlaybackParams not supported on this Android version")
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set playback speed: ${e.message}", e)
                false
            }
        }
        
        // Pause audio playback
        Function("pauseAudio") {
            try {
                mediaPlayer?.let {
                    if (it.isPlaying) {
                        it.pause()
                        Log.d(TAG, "Audio paused")
                        return@Function true
                    }
                }
                false
            } catch (e: Exception) {
                Log.e(TAG, "Failed to pause audio: ${e.message}", e)
                false
            }
        }
        
        // Resume audio playback
        Function("resumeAudio") {
            try {
                mediaPlayer?.let {
                    if (!it.isPlaying) {
                        it.start()
                        Log.d(TAG, "Audio resumed")
                        return@Function true
                    }
                }
                false
            } catch (e: Exception) {
                Log.e(TAG, "Failed to resume audio: ${e.message}", e)
                false
            }
        }
        
        // Stop audio playback
        Function("stopAudio") {
            try {
                mediaPlayer?.let {
                    if (it.isPlaying) {
                        it.stop()
                    }
                    it.release()
                }
                mediaPlayer = null
                Log.d(TAG, "Audio stopped and released")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop audio: ${e.message}", e)
                false
            }
        }
        
        // Seek to position in milliseconds
        Function("seekAudio") { positionMs: Int ->
            try {
                mediaPlayer?.seekTo(positionMs)
                Log.d(TAG, "Seeked to position: $positionMs ms")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to seek audio: ${e.message}", e)
                false
            }
        }
        
        // Get current playback position
        Function("getAudioPosition") {
            try {
                mediaPlayer?.currentPosition ?: -1
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get audio position: ${e.message}", e)
                -1
            }
        }
        
        // Get current playback speed
        Function("getPlaybackSpeed") {
            currentPlaybackSpeed
        }
        
        // ========================================
        // FluidSynth MIDI Player (Native Sequencer)
        // ========================================
        
        // Play a MIDI file using FluidSynth's internal player with tempo control
        AsyncFunction("playMidiFile") { filePath: String, tempoMultiplier: Float ->
            if (!isInitialized || synth == null) {
                return@AsyncFunction mapOf(
                    "success" to false,
                    "error" to "FluidSynth not initialized"
                )
            }
            
            try {
                Log.d(TAG, "Loading MIDI file: $filePath with tempo multiplier: $tempoMultiplier")
                
                // Note: MIDI playback is not supported in pre-render mode
                // Use renderSongToWav instead for audio playback
                Log.w(TAG, "MIDI playback disabled - use pre-rendered WAV playback instead")
                return@AsyncFunction mapOf(
                    "success" to false,
                    "error" to "MIDI playback not supported. Use renderSongToWav for pre-rendered audio."
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to play MIDI file: ${e.message}", e)
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error")
                )
            }
        }
        
        // Set MIDI playback tempo dynamically (disabled in pre-render mode)
        Function("setMidiTempo") { tempoMultiplier: Float ->
            Log.w(TAG, "MIDI tempo control disabled - use setPlaybackSpeed for WAV playback")
            false
        }
        
        // Stop MIDI playback (disabled in pre-render mode)
        Function("stopMidiPlayback") {
            Log.w(TAG, "MIDI playback disabled - use stopAudio for WAV playback")
            false
        }
        
        // Seek MIDI player (disabled in pre-render mode)
        Function("seekMidi") { ticks: Int ->
            Log.w(TAG, "MIDI seek disabled - use seekAudio for WAV playback")
            false
        }
        
        // Check if MIDI is currently playing (always false in pre-render mode)
        Function("isMidiPlaying") {
            false
        }

        // ========================================
        // Pre-render Song to WAV File
        // ========================================
        
        /**
         * Render a song to a WAV file for zero-latency playback.
         * Takes an array of note events and renders them offline using FluidSynth.
         * 
         * Note format: [timeMs, channel, midiNote, velocity, durationMs]
         */
        AsyncFunction("renderSongToWav") { notes: List<List<Double>>, outputPath: String, durationMs: Double ->
            if (!isInitialized || synth == null) {
                return@AsyncFunction mapOf(
                    "success" to false,
                    "error" to "FluidSynth not initialized"
                )
            }
            
            try {
                Log.d(TAG, "Rendering ${notes.size} notes to WAV: $outputPath")
                
                // Reset synth state before rendering - turn off all notes and reset
                for (ch in 0..15) {
                    fluidsynth.fluid_synth_all_notes_off(synth, ch)
                    fluidsynth.fluid_synth_all_sounds_off(synth, ch)
                }
                
                // Re-select guitar program on channels 0-5 to ensure correct instrument
                for (channel in 0..5) {
                    fluidsynth.fluid_synth_program_select(synth, channel, soundfontId, 0, GUITAR_PRESET)
                }
                
                // Small delay to let notes release fully
                Thread.sleep(50)
                
                val sampleRate = SAMPLE_RATE
                val totalSamples = ((durationMs / 1000.0) * sampleRate).toInt() + sampleRate // Extra second for release tails
                val bytesPerSample = 4 // Stereo 16-bit = 4 bytes per frame
                val totalBytes = totalSamples * bytesPerSample
                
                Log.d(TAG, "Total duration: ${durationMs}ms, samples: $totalSamples, bytes: $totalBytes")
                
                // Create sorted list of note events (on/off)
                data class NoteEvent(val samplePos: Int, val isOn: Boolean, val channel: Int, val note: Int, val velocity: Int)
                val events = mutableListOf<NoteEvent>()
                
                for (noteData in notes) {
                    if (noteData.size < 5) continue
                    
                    val timeMs = noteData[0]
                    val channel = noteData[1].toInt()
                    val midiNote = noteData[2].toInt()
                    val velocity = noteData[3].toInt()
                    val noteDurationMs = noteData[4]
                    
                    val startSample = ((timeMs / 1000.0) * sampleRate).toInt()
                    val endSample = (((timeMs + noteDurationMs) / 1000.0) * sampleRate).toInt()
                    
                    events.add(NoteEvent(startSample, true, channel, midiNote, velocity))
                    events.add(NoteEvent(endSample, false, channel, midiNote, 0))
                }
                
                // Sort by sample position
                events.sortBy { it.samplePos }
                
                Log.d(TAG, "Processing ${events.size} note events")
                if (events.isNotEmpty()) {
                    Log.d(TAG, "First event at sample ${events.first().samplePos}, last at ${events.last().samplePos}")
                    // Log first 10 note-on events for debugging
                    events.filter { it.isOn }.take(10).forEachIndexed { i, e ->
                        Log.d(TAG, "Note $i: time=${e.samplePos / sampleRate.toFloat()}s, ch=${e.channel}, note=${e.note}, vel=${e.velocity}")
                    }
                }
                
                // Render audio sample-by-sample for accurate timing
                // We render one sample at a time when there are events, otherwise in chunks
                val outputBuffer = ByteArrayOutputStream(totalBytes)
                val sampleBuffer = ByteArray(4) // Single stereo sample (2 channels * 2 bytes)
                
                var currentSample = 0
                var eventIndex = 0
                var notesTriggered = 0
                
                // Process all samples
                while (currentSample < totalSamples) {
                    // Process any note events at exactly this sample position
                    while (eventIndex < events.size && events[eventIndex].samplePos <= currentSample) {
                        val event = events[eventIndex]
                        if (event.isOn) {
                            fluidsynth.fluid_synth_noteon(synth, event.channel, event.note, event.velocity)
                            notesTriggered++
                        } else {
                            fluidsynth.fluid_synth_noteoff(synth, event.channel, event.note)
                        }
                        eventIndex++
                    }
                    
                    // Determine how many samples we can render before the next event
                    val nextEventSample = if (eventIndex < events.size) events[eventIndex].samplePos else totalSamples
                    val samplesToRender = minOf(nextEventSample - currentSample, 2048) // Cap at 2048 for memory efficiency
                    
                    if (samplesToRender > 1) {
                        // Render multiple samples at once
                        val chunkBuffer = ByteArray(samplesToRender * 4)
                        fluidsynth.fluid_synth_write_s16(
                            synth,
                            samplesToRender,
                            chunkBuffer, 0, 2,  // Left channel: start at short 0, increment by 2
                            chunkBuffer, 1, 2   // Right channel: start at short 1, increment by 2
                        )
                        outputBuffer.write(chunkBuffer)
                        currentSample += samplesToRender
                    } else {
                        // Render single sample
                        fluidsynth.fluid_synth_write_s16(
                            synth,
                            1,
                            sampleBuffer, 0, 2,
                            sampleBuffer, 1, 2
                        )
                        outputBuffer.write(sampleBuffer)
                        currentSample++
                    }
                }
                
                Log.d(TAG, "Triggered $notesTriggered note-on events during rendering")
                
                // Turn off all notes
                for (ch in 0..15) {
                    fluidsynth.fluid_synth_all_notes_off(synth, ch)
                }
                
                // Get raw PCM data
                val pcmData = outputBuffer.toByteArray()
                Log.d(TAG, "Rendered ${pcmData.size} bytes of PCM data")
                
                // Write WAV file
                val wavFile = File(outputPath)
                FileOutputStream(wavFile).use { fos ->
                    // WAV header
                    val dataSize = pcmData.size
                    val fileSize = dataSize + 36
                    
                    // RIFF header
                    fos.write("RIFF".toByteArray())
                    fos.write(intToLittleEndianBytes(fileSize))
                    fos.write("WAVE".toByteArray())
                    
                    // fmt chunk
                    fos.write("fmt ".toByteArray())
                    fos.write(intToLittleEndianBytes(16)) // Chunk size
                    fos.write(shortToLittleEndianBytes(1)) // Audio format (PCM)
                    fos.write(shortToLittleEndianBytes(2)) // Channels (stereo)
                    fos.write(intToLittleEndianBytes(sampleRate)) // Sample rate
                    fos.write(intToLittleEndianBytes(sampleRate * 4)) // Byte rate (sampleRate * channels * bitsPerSample/8)
                    fos.write(shortToLittleEndianBytes(4)) // Block align (channels * bitsPerSample/8)
                    fos.write(shortToLittleEndianBytes(16)) // Bits per sample
                    
                    // data chunk
                    fos.write("data".toByteArray())
                    fos.write(intToLittleEndianBytes(dataSize))
                    fos.write(pcmData)
                }
                
                Log.d(TAG, "WAV file written: ${wavFile.absolutePath} (${wavFile.length()} bytes)")
                
                mapOf(
                    "success" to true,
                    "path" to wavFile.absolutePath,
                    "durationMs" to durationMs,
                    "sizeBytes" to wavFile.length()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to render song to WAV: ${e.message}", e)
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error")
                )
            }
        }

        // Cleanup and release resources
        AsyncFunction("cleanup") {
            cleanup()
            true
        }

        // Called when module is destroyed
        OnDestroy {
            cleanup()
        }
    }
    
    private fun cleanup() {
        Log.d(TAG, "Cleaning up FluidSynth resources")
        isInitialized = false
        
        // Stop and release MediaPlayer
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing MediaPlayer", e)
        }
        mediaPlayer = null
        
        // Stop and release FluidSynth MIDI player
        stopMidiPlayerInternal()

        synth?.let {
            try {
                fluidsynth.delete_fluid_synth(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error deleting synth", e)
            }
        }
        synth = null

        settings?.let {
            try {
                fluidsynth.delete_fluid_settings(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error deleting settings", e)
            }
        }
        settings = null
        
        soundfontId = -1
    }
    
    private fun stopMidiPlayerInternal() {
        isMidiPlaying = false
        
        fluidPlayer?.let {
            try {
                fluidsynth.fluid_player_stop(it)
                fluidsynth.delete_fluid_player(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping MIDI player", e)
            }
        }
        fluidPlayer = null
    }
    
    // WAV file helper functions
    private fun intToLittleEndianBytes(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xFF).toByte(),
            ((value shr 8) and 0xFF).toByte(),
            ((value shr 16) and 0xFF).toByte(),
            ((value shr 24) and 0xFF).toByte()
        )
    }
    
    private fun shortToLittleEndianBytes(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xFF).toByte(),
            ((value shr 8) and 0xFF).toByte()
        )
    }
}
