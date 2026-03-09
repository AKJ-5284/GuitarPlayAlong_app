package expo.modules.fluidsynth

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.sun.jna.Library
import com.sun.jna.Native
import com.sun.jna.Pointer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.concurrent.thread
import kotlinx.coroutines.*

/**
 * JNA interface mapping FluidSynth C library functions
 */
interface FluidSynthLibrary : Library {
    companion object {
        val INSTANCE: FluidSynthLibrary by lazy {
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
    fun fluid_synth_program_select(synth: Pointer?, chan: Int, sfont_id: Int, bank: Int, preset: Int): Int
    fun fluid_synth_set_gain(synth: Pointer?, gain: Float)
    
    // Audio rendering - write interleaved stereo 16-bit samples
    fun fluid_synth_write_s16(synth: Pointer?, len: Int, lout: ByteArray?, loff: Int, lincr: Int, rout: ByteArray?, roff: Int, rincr: Int): Int
}

class ExpoFluidsynthModule : Module() {
    companion object {
        private const val TAG = "ExpoFluidsynth"
        private const val SAMPLE_RATE = 44100
        private const val BUFFER_SIZE_FRAMES = 512 // Balanced latency/stability
        private const val GUITAR_PRESET = 25 // Nylon guitar in General MIDI
    }

    // FluidSynth pointers
    private var settings: Pointer? = null
    private var synth: Pointer? = null
    private var soundfontId: Int = -1
    private var isInitialized: Boolean = false
    
    // Audio playback
    private var audioTrack: AudioTrack? = null
    private var audioThread: Thread? = null
    @Volatile private var isPlaying: Boolean = false
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private val fluidsynth: FluidSynthLibrary by lazy { FluidSynthLibrary.INSTANCE }

    override fun definition() = ModuleDefinition {
        Name("expo-fluidsynth")

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
                
                // Select guitar preset on all channels (bank 0, preset 25 = nylon guitar)
                // Try preset 25 (nylon), 27 (clean electric), or 0 depending on soundfont
                for (channel in 0..5) {
                    fluidsynth.fluid_synth_program_select(synth, channel, soundfontId, 0, GUITAR_PRESET)
                }
                
                // Create AudioTrack for low-latency playback
                val bufferSize = AudioTrack.getMinBufferSize(
                    rate,
                    AudioFormat.CHANNEL_OUT_STEREO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                
                val attributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                
                val format = AudioFormat.Builder()
                    .setSampleRate(rate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                    .build()
                
                audioTrack = AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(bufferSize.coerceAtLeast(BUFFER_SIZE_FRAMES * 4))
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                    .build()
                
                // Start audio rendering thread
                startAudioThread(rate)
                
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

            val midiNote = baseNotes[stringNum - 1] + fret
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

            val midiNote = baseNotes[stringNum - 1] + fret
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
            val fromMidi = baseNotes[stringNum - 1] + fromFret
            val toMidi = baseNotes[stringNum - 1] + toFret

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
    
    private fun startAudioThread(sampleRate: Int) {
        isPlaying = true
        audioTrack?.play()
        
        audioThread = thread(name = "FluidSynthAudio", priority = Thread.MAX_PRIORITY) {
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
            
            // Buffer for stereo 16-bit samples (interleaved)
            val framesToRender = BUFFER_SIZE_FRAMES
            val bytesPerFrame = 4 // 2 channels * 2 bytes per sample
            val buffer = ByteArray(framesToRender * bytesPerFrame)
            
            Log.d(TAG, "Audio thread started, rendering $framesToRender frames per cycle")
            
            while (isPlaying && synth != null) {
                try {
                    // Render audio from FluidSynth
                    // fluid_synth_write_s16: offsets/increments are in SAMPLES (shorts), not bytes
                    // For interleaved stereo: L at 0,2,4..., R at 1,3,5...
                    val result = fluidsynth.fluid_synth_write_s16(
                        synth,
                        framesToRender,
                        buffer, 0, 2,  // Left channel: start at sample 0, increment by 2
                        buffer, 1, 2   // Right channel: start at sample 1, increment by 2
                    )
                    
                    if (result == 0) {
                        // Write to AudioTrack
                        val written = audioTrack?.write(buffer, 0, buffer.size) ?: 0
                        if (written < 0) {
                            Log.e(TAG, "AudioTrack write error: $written")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Audio render error: ${e.message}")
                }
            }
            
            Log.d(TAG, "Audio thread stopped")
        }
    }

    private fun cleanup() {
        Log.d(TAG, "Cleaning up FluidSynth resources")
        isInitialized = false
        
        // Stop audio thread
        isPlaying = false
        audioThread?.let {
            try {
                it.join(500)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping audio thread", e)
            }
        }
        audioThread = null
        
        // Stop and release AudioTrack
        audioTrack?.let {
            try {
                it.stop()
                it.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing AudioTrack", e)
            }
        }
        audioTrack = null

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
}
