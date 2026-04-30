document.addEventListener("DOMContentLoaded", async function () {
    // 1. Initialize Tone.js Synth
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    let isPlaying = false;
    let playLoopTimeout;
    const currentBpm = 120; // 120 Quarter notes per minute

    // We retrieve the osmd instance loaded from index.html
    // Wait until OSMD is fully loaded the score.
    // We'll poll until osmd.cursor is ready.
    const pollOsmd = setInterval(() => {
        if (window.osmd && window.osmd.cursor && window.osmd.cursor.hidden !== undefined) {
            clearInterval(pollOsmd);
            initPlayer();
        }
    }, 200);

    function initPlayer() {
        const osmd = window.osmd;

        document.getElementById("btn-play").addEventListener("click", async () => {
            await Tone.start();
            if (!isPlaying) {
                isPlaying = true;
                osmd.cursor.show();
                playNextNote();
            }
        });

        document.getElementById("btn-stop").addEventListener("click", () => {
            isPlaying = false;
            clearTimeout(playLoopTimeout);
            osmd.cursor.reset();
            osmd.cursor.hide();
        });

        document.getElementById("btn-pause").addEventListener("click", () => {
            isPlaying = false;
            clearTimeout(playLoopTimeout);
        });

        // 4. Click Note Interaction (Basic click-to-play)
        document.getElementById("osmd-container").addEventListener("click", async (e) => {
            if (!osmd.GraphicSheet) return;

            // Get SVG coordinates relative to the container
            const containerRect = document.getElementById("osmd-container").getBoundingClientRect();
            const clickX = e.clientX - containerRect.left;
            const clickY = e.clientY - containerRect.top;

            // OSMD points are naturally based on the 10-pixel sizing unit and the current zoom
            const unit = 10.0 * osmd.zoom;
            // Need to retrieve PointF2D
            const osmdPoint = new opensheetmusicdisplay.PointF2D(clickX / unit, clickY / unit);

            // Find nearest GraphicVoiceEntry
            const nearestVoiceEntry = osmd.GraphicSheet.GetNearestVoiceEntry(osmdPoint);
            
            if (nearestVoiceEntry && nearestVoiceEntry.parentStaffEntry) {
                const targetTimestamp = nearestVoiceEntry.parentStaffEntry.getAbsoluteTimestamp().RealValue;
                
                // Move cursor to this timestamp
                osmd.cursor.reset();
                while (osmd.cursor.Iterator.currentTimeStamp.RealValue < targetTimestamp && !osmd.cursor.Iterator.EndReached) {
                    osmd.cursor.next();
                }
                
                // Play from this point
                clearTimeout(playLoopTimeout);
                await Tone.start();
                isPlaying = true;
                osmd.cursor.show();
                playNextNote();
            }
        });

        function playNextNote() {
            if (!isPlaying || osmd.cursor.Iterator.EndReached) {
                isPlaying = false;
                return;
            }

            const notes = osmd.cursor.NotesUnderCursor();
            let longestDurationMs = 0;
            const frequencies = [];

            notes.forEach(note => {
                if (!note.isRest() && note.Pitch) {
                    frequencies.push(note.Pitch.Frequency);
                }
                
                // Quarter note = 0.25 RealValue. 
                // durationMs = (60000 / BPM) * (note.Length.RealValue / 0.25)
                const durationMs = (60000 / currentBpm) * (note.Length.RealValue / 0.25);
                if (durationMs > longestDurationMs) {
                    longestDurationMs = durationMs;
                }
            });

            if (frequencies.length > 0 && longestDurationMs > 0) {
                // Trigger Audio
                // triggerAttackRelease takes duration in seconds
                synth.triggerAttackRelease(frequencies, longestDurationMs / 1000);
            }

            if (longestDurationMs === 0) {
                longestDurationMs = 500; // Fallback so we don't infinite loop if something goes wrong
            }

            osmd.cursor.next();
            playLoopTimeout = setTimeout(playNextNote, longestDurationMs);
        }
    }
});