document.addEventListener("DOMContentLoaded", async function () {
    // 1. Initialize Tone.js Synth
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    let isPlaying = false;
    let playLoopTimeout;
    let currentBpm = 120; // 120 Quarter notes per minute

    // Listen to BPM slider
    const bpmSlider = document.getElementById("bpm-slider");
    const bpmDisplay = document.getElementById("bpm-display");
    if (bpmSlider) {
        bpmSlider.addEventListener("input", (e) => {
            currentBpm = parseInt(e.target.value, 10);
            if (bpmDisplay) bpmDisplay.innerText = currentBpm;
        });
    }

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

        // Populate track selectors
        const trackSelectorsDiv = document.getElementById("track-selectors");
        if (trackSelectorsDiv && osmd.Sheet && osmd.Sheet.Instruments) {
            osmd.Sheet.Instruments.forEach((instrument, index) => {
                const label = document.createElement("label");
                label.style.marginRight = "15px";
                
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = true; // default play all
                checkbox.dataset.instrumentId = instrument.IdString; // Note: case is IdString
                
                const span = document.createElement("span");
                let name = instrument.Name || instrument.NameLabel?.text || `Instrument ${index + 1}`;
                span.innerText = name;
                
                label.appendChild(checkbox);
                label.appendChild(span);
                trackSelectorsDiv.appendChild(label);
            });
        }

        // Page size controls
        const selectPageSize = document.getElementById("selectPageSize");
        if (selectPageSize) {
            selectPageSize.addEventListener("change", (e) => {
                const value = e.target.value;
                osmd.setPageFormat(value);
                osmd.render();
            });
        }

        // Transpose controls
        const transposeBtn = document.getElementById("transpose-btn");
        const transposeInput = document.getElementById("transpose");
        if (transposeBtn && transposeInput) {
            transposeBtn.addEventListener("click", () => {
                const transposeValue = parseInt(transposeInput.value, 10);
                if (!isNaN(transposeValue) && osmd.Sheet) {
                    osmd.Sheet.Transpose = transposeValue;
                    osmd.updateGraphic();
                    osmd.render();
                }
            });
        }

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
                const pitchToPlay = note.TransposedPitch || note.Pitch;
                if (!note.isRest() && pitchToPlay) {
                    let playNote = true;
                    // Filter based on track checkboxes
                    if (note.ParentStaffEntry && note.ParentStaffEntry.ParentStaff && note.ParentStaffEntry.ParentStaff.ParentInstrument) {
                        const instrumentId = note.ParentStaffEntry.ParentStaff.ParentInstrument.IdString;
                        const checkbox = document.querySelector(`input[data-instrument-id="${instrumentId}"]`);
                        if (checkbox && !checkbox.checked) {
                            playNote = false;
                        }
                    }

                    if (playNote) {
                        frequencies.push(pitchToPlay.Frequency);
                    }
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