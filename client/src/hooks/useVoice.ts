import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const WS_URL =
  (API_BASE || (typeof location !== "undefined" ? location.origin : "")).replace(/^http/, "ws") + "/ws";

type VoiceState = "idle" | "listening" | "speaking" | "error";

function splitText(text: string, maxLen = 2000): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("।", maxLen);
    if (splitAt < 0) splitAt = remaining.lastIndexOf(",", maxLen);
    if (splitAt < 0) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < 0) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt + 1).trim());
    remaining = remaining.substring(splitAt + 1).trim();
  }
  return chunks.filter((c) => c.length > 0);
}

// Downsample Float32 @ inRate to 16 kHz Int16 (LINEAR16) for Google streaming STT.
function downsampleTo16kInt16(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let s = input[Math.floor(i * ratio)];
    s = Math.max(-1, Math.min(1, s));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
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

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const capturingRef = useRef(false);
  const finalRef = useRef("");
  const gotFinalRef = useRef(false);
  const startedRef = useRef(false);      // speech detected this turn
  const silenceStartRef = useRef(0);     // when the current silence began
  const stoppedRef = useRef(false);      // already sent end-of-turn
  const captureStartRef = useRef(0);     // when capture began (grace period)
  const lastActivityRef = useRef(0);     // last time we saw speech energy or a new word
  const lastInterimRef = useRef("");     // last interim text (to detect changes)
  const frameCountRef = useRef(0);
  const longPauseRef = useRef(false);    // longer silence tolerance on number screens

  const addLog = useCallback((msg: string) => {
    console.log("[Voice]", msg);
    setDebugLog((prev) => [...prev.slice(-8), msg]);
  }, []);

  useEffect(() => {
    const loadVoices = () => { try { window.speechSynthesis?.getVoices(); } catch {} };
    loadVoices();
  }, []);

  // ── mic capture (streams PCM to server over WS) ──────────
  const stopCapture = useCallback((sendStop = true) => {
    capturingRef.current = false;
    if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; }
    if (sendStop && wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: "stop" })); } catch {}
    }
  }, []);

  const teardownMic = useCallback(() => {
    stopCapture(false);
    if (ctxRef.current) { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, [stopCapture]);

  const finalizeTurn = useCallback((text: string) => {
    const t = text.trim();
    setInterimText("");
    stopCapture(true);
    if (t) {
      gotFinalRef.current = true;
      seqRef.current++;
      addLog(`✅ "${t}"`);
      setTranscript(t + "\x00" + seqRef.current);
    }
  }, [stopCapture, addLog]);

  const ensureWS = useCallback(() => new Promise<WebSocket | null>((resolve) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) { resolve(wsRef.current); return; }
    try {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      let settled = false;
      ws.onopen = () => { addLog("🔌 WS open"); if (!settled) { settled = true; resolve(ws); } };
      ws.onerror = () => { addLog("🔌 WS error"); if (!settled) { settled = true; resolve(null); } };
      ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null; };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        let msg: any; try { msg = JSON.parse(ev.data); } catch { return; }
        if (isSpeakingRef.current) return; // ignore anything while the AI is talking
        if (msg.type === "interim") {
          const it = msg.transcript || "";
          setInterimText(it);
          if (it && it !== lastInterimRef.current) { lastInterimRef.current = it; lastActivityRef.current = Date.now(); startedRef.current = true; }
        }
        else if (msg.type === "final") { finalRef.current = msg.transcript || ""; if (finalRef.current) finalizeTurn(finalRef.current); }
        else if (msg.type === "endOfTurn") { capturingRef.current = false; if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; } }
        else if (msg.type === "streamEnd") {
          // If Google ended with nothing recognized, keep listening for the user
          if (!gotFinalRef.current && activatedRef.current && !isSpeakingRef.current) startCaptureRef.current?.();
        }
        else if (msg.type === "error") { addLog("STT err: " + msg.message); }
      };
      wsRef.current = ws;
    } catch { resolve(null); }
  }), [addLog, finalizeTurn]);

  const startCaptureRef = useRef<null | (() => Promise<void>)>(null);

  const initMic = useCallback(async (): Promise<boolean> => {
    if (streamRef.current && ctxRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // autoGainControl OFF so silence stays quiet (else it amplifies the gaps
        // between words and end-of-turn silence is never detected).
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      addLog(`🎤 mic ready @${ctx.sampleRate}Hz`);
      return true;
    } catch (e: any) {
      addLog("❌ mic: " + (e?.message || e));
      setErrorMsg("মাইক্রোফোন অনুমতি দিন।");
      setVoiceState("error");
      return false;
    }
  }, [addLog]);

  const startCapture = useCallback(async () => {
    if (!activatedRef.current || isSpeakingRef.current) return;
    const ok = await initMic();
    if (!ok) return;
    const ws = await ensureWS();
    if (!ws) { setErrorMsg("সার্ভারে সংযোগ করা যাচ্ছে না।"); return; }
    const ctx = ctxRef.current!;
    const stream = streamRef.current!;
    finalRef.current = "";
    gotFinalRef.current = false;
    startedRef.current = false;
    silenceStartRef.current = 0;
    stoppedRef.current = false;
    captureStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    lastInterimRef.current = "";
    frameCountRef.current = 0;
    setInterimText("");
    try { ws.send(JSON.stringify({ type: "start" })); } catch {}

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    capturingRef.current = true;
    processor.onaudioprocess = (e) => {
      if (!capturingRef.current || isSpeakingRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const data = e.inputBuffer.getChannelData(0);
      const pcm = downsampleTo16kInt16(data, ctx.sampleRate);
      try { wsRef.current.send(pcm.buffer as ArrayBuffer); } catch {}

      // Client-side endpointing: end the turn when speech is followed by silence.
      // "Activity" = loud enough audio OR a new interim word from Google. When
      // neither happens for the silence window, tell the server to finalize.
      const now = Date.now();
      if (now - captureStartRef.current < 350) return; // grace period (ignore TTS-tail echo)
      let peak = 0;
      for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
      frameCountRef.current++;
      if (frameCountRef.current % 12 === 0) addLog(`📊 peak=${peak.toFixed(3)} started=${startedRef.current}`);
      if (peak > 0.015) {
        startedRef.current = true;
        lastActivityRef.current = now;
      }
      if (startedRef.current && !stoppedRef.current && now - lastActivityRef.current > (longPauseRef.current ? 2000 : 900)) {
        stoppedRef.current = true;
        capturingRef.current = false;
        try { wsRef.current!.send(JSON.stringify({ type: "stop" })); } catch {}
        addLog("⏹️ endpoint → finalize");
      }
    };
    // Route through a muted gain so onaudioprocess fires without echoing mic to the speaker
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    setVoiceState("listening");
    addLog("🎙️ streaming");
  }, [initMic, ensureWS, addLog]);
  startCaptureRef.current = startCapture;

  // ── TTS ──────────────────────────────────────────────────
  const speakWithServerTTS = useCallback(async (text: string): Promise<void> => {
    const chunks = splitText(text);
    setVoiceState("speaking");
    for (const chunk of chunks) {
      await new Promise<void>((resolve) => {
        const audio = new Audio(`${API_BASE}/api/tts?text=${encodeURIComponent(chunk)}`);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    isSpeakingRef.current = true;
    // Release the mic so TTS plays on the loudspeaker (open mic → earpiece routing).
    stopCapture(true);
    teardownMic();
    await new Promise((r) => setTimeout(r, 80));
    await speakWithServerTTS(text);
    isSpeakingRef.current = false;
    addLog("🔊 TTS done → listening");
    // Let the loudspeaker settle before re-opening the mic (avoids echo).
    await new Promise((r) => setTimeout(r, 400));
    if (activatedRef.current) { await startCapture(); }
    else setVoiceState("idle");
  }, [stopCapture, teardownMic, speakWithServerTTS, startCapture, addLog]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    isSpeakingRef.current = false;
    setVoiceState("idle");
  }, []);

  const startListening = useCallback(async () => {
    activatedRef.current = true;
    setErrorMsg("");
    addLog("🟢 activated");
    await ensureWS();
    await initMic();
  }, [addLog, ensureWS, initMic]);

  const stopListening = useCallback(() => {
    activatedRef.current = false;
    stopCapture(true);
    teardownMic();
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    setVoiceState("idle");
  }, [stopCapture, teardownMic]);

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
    setLongPause: (v: boolean) => { longPauseRef.current = v; }, // longer silence on number screens
    setEchoFilter: (_v: boolean) => {}, // handled by not capturing during/just-after TTS
  };
}
