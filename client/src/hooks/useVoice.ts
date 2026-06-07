import { useState, useRef, useCallback, useEffect } from "react";

type VoiceState = "idle" | "listening" | "speaking" | "error";

function splitText(text: string, maxLen = 180): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("।", maxLen);
    if (splitAt < 0) splitAt = remaining.lastIndexOf(",", maxLen);
    if (splitAt < 0) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < 0) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt + 1).trim());
    remaining = remaining.substring(splitAt + 1).trim();
  }
  return chunks.filter(c => c.length > 0);
}

export function useVoice() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSpeakingRef = useRef(false);
  const activatedRef = useRef(false);
  const seqRef = useRef(0);
  const micReadyRef = useRef(false);

  // Server STT refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const vadRunningRef = useRef(false);
  const vadFrameRef = useRef<number>(0);

  const addLog = useCallback((msg: string) => {
    console.log("[Voice]", msg);
    setDebugLog((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  useEffect(() => {
    const loadVoices = () => { window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const sendAudioToServer = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      addLog(`⏭️ too small (${audioBlob.size}B)`);
      return;
    }
    const sizeKB = (audioBlob.size / 1024).toFixed(1);
    addLog(`📤 ${sizeKB}KB → Whisper...`);
    setInterimText("চিনছি...");
    try {
      const resp = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: audioBlob,
      });
      const data = await resp.json();
      if (!resp.ok) {
        addLog(`❌ STT ${resp.status}: ${data.error || data.detail}`);
        setInterimText("");
        return;
      }
      if (data.transcript && data.transcript.trim()) {
        const text = data.transcript.trim();
        addLog(`✅ "${text}"`);
        setInterimText("");
        seqRef.current++;
        setTranscript(text + "\x00" + seqRef.current);
      } else {
        addLog("⏭️ empty result");
        setInterimText("");
      }
    } catch (err: any) {
      addLog(`❌ fetch: ${err.message}`);
      setInterimText("");
    }
  }, [addLog]);

  const stopVAD = useCallback(() => {
    vadRunningRef.current = false;
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    isRecordingRef.current = false;
    silenceStartRef.current = 0;
  }, []);

  const startVAD = useCallback(async () => {
    if (vadRunningRef.current) return;
    if (!analyserRef.current || !mediaStreamRef.current) {
      addLog("⚠️ mic not ready for VAD");
      return;
    }

    // Resume AudioContext if suspended (happens after user interaction + audio playback)
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      addLog("🔄 resuming AudioContext...");
      await audioContextRef.current.resume();
    }

    vadRunningRef.current = true;
    const analyser = analyserRef.current;
    const stream = mediaStreamRef.current;
    const dataArray = new Uint8Array(analyser.fftSize);
    const START_THRESHOLD = 4;
    const STOP_THRESHOLD = 2;
    const SILENCE_DURATION = 1000;
    let frameCount = 0;

    // Check stream health
    const track = stream.getAudioTracks()[0];
    addLog(`🟢 VAD start | ctx=${audioContextRef.current?.state} track=${track?.readyState}/${track?.enabled ? "on" : "muted"}`);
    setVoiceState("listening");

    const loop = () => {
      if (!vadRunningRef.current) return;

      // Use time-domain data (waveform) — values centered at 128, deviations = sound
      analyser.getByteTimeDomainData(dataArray);
      let maxDeviation = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const deviation = Math.abs(dataArray[i] - 128);
        if (deviation > maxDeviation) maxDeviation = deviation;
      }
      const avg = maxDeviation;

      frameCount++;
      if (frameCount % 90 === 0) {
        addLog(`📊 level=${avg.toFixed(1)} ${isRecordingRef.current ? "🔴REC" : "⚪wait"}`);
      }

      const threshold = isRecordingRef.current ? STOP_THRESHOLD : START_THRESHOLD;
      if (avg > threshold) {
        if (!isRecordingRef.current) {
          chunksRef.current = [];
          try {
            const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: "audio/webm" });
              sendAudioToServer(blob);
            };
            recorder.start(100);
            recorderRef.current = recorder;
            isRecordingRef.current = true;
            recordStartRef.current = Date.now();
            setInterimText("🎤 শুনছি...");
            addLog(`🔴 REC (level=${avg.toFixed(1)})`);
          } catch (e: any) {
            addLog(`❌ recorder: ${e.message}`);
          }
        }
        silenceStartRef.current = 0;
      } else if (isRecordingRef.current) {
        if (silenceStartRef.current === 0) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
          const recordDuration = Date.now() - recordStartRef.current;
          if (recordDuration < 300) {
            // Too short — likely noise, discard
            if (recorderRef.current && recorderRef.current.state === "recording") {
              recorderRef.current.onstop = null;
              try { recorderRef.current.stop(); } catch {}
            }
            addLog(`⏭️ too short (${recordDuration}ms)`);
          } else if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
            addLog(`⏹️ silence → Whisper (${(recordDuration / 1000).toFixed(1)}s)`);
          }
          recorderRef.current = null;
          isRecordingRef.current = false;
          silenceStartRef.current = 0;
        }
      }

      vadFrameRef.current = requestAnimationFrame(loop);
    };

    vadFrameRef.current = requestAnimationFrame(loop);
  }, [addLog, sendAudioToServer]);

  const initMic = useCallback(async (): Promise<boolean> => {
    if (micReadyRef.current && mediaStreamRef.current) return true;

    addLog("🎤 requesting mic...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      const trackLabel = stream.getAudioTracks()[0]?.label ?? "unknown";
      addLog(`🎤 mic OK: ${trackLabel}`);

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      micReadyRef.current = true;
      addLog(`🎤 AudioContext=${audioCtx.state}, sampleRate=${audioCtx.sampleRate}`);
      return true;
    } catch (err: any) {
      addLog(`❌ mic denied: ${err.message}`);
      setErrorMsg("মাইক্রোফোন অনুমতি দিন।");
      setVoiceState("error");
      return false;
    }
  }, [addLog]);

  const teardownMic = useCallback(() => {
    stopVAD();
    micReadyRef.current = false;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;
  }, [stopVAD]);

  const startListening = useCallback(async () => {
    activatedRef.current = true;
    setErrorMsg("");
    addLog("🟢 activated");
    // Mic will be initialized after TTS finishes to avoid Intel SST conflicts
  }, [addLog]);

  const stopListening = useCallback(() => {
    activatedRef.current = false;
    teardownMic();
    setVoiceState("idle");
  }, [teardownMic]);

  const speakWithServerTTS = useCallback(async (text: string): Promise<void> => {
    const chunks = splitText(text);
    addLog(`🔊 TTS (${chunks.length} parts)`);
    setVoiceState("speaking");

    for (const chunk of chunks) {
      await new Promise<void>((resolve) => {
        const url = `/api/tts?text=${encodeURIComponent(chunk)}`;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => {
          addLog("🔊 audio error");
          resolve();
        };
        audio.play().catch((err) => {
          addLog(`🔊 play: ${err.message}`);
          resolve();
        });
      });
    }
  }, [addLog]);

  const speak = useCallback(async (text: string): Promise<void> => {
    // Cancel any currently playing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    isSpeakingRef.current = true;
    stopVAD();

    await speakWithServerTTS(text);

    isSpeakingRef.current = false;
    addLog("🔊 TTS done → starting VAD");

    if (activatedRef.current) {
      // Tear down old mic and get a fresh one — Intel SST can lock up
      // if mic was open while audio played
      if (micReadyRef.current) {
        teardownMic();
        await new Promise(r => setTimeout(r, 200));
      }
      const ok = await initMic();
      if (ok) {
        await startVAD();
      }
    } else {
      setVoiceState("idle");
    }
  }, [stopVAD, startVAD, initMic, teardownMic, addLog, speakWithServerTTS]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    isSpeakingRef.current = false;
    setVoiceState("idle");
  }, []);

  return {
    voiceState,
    transcript: transcript.split("\x00")[0],
    rawTranscript: transcript,
    interimText,
    errorMsg,
    debugLog,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
