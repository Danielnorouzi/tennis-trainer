"use client";

// Conversational "Coach Mode" over the OpenAI Realtime API (WebRTC). The browser gets a
// short-lived client secret from our server; the API key never reaches the client.

import { ApiError, guestId } from "../api/client";

export interface RealtimeHandle {
  close: () => void;
  /** send a text message into the conversation (e.g. "summarise my last stroke") */
  say: (text: string) => void;
  /** live transcript events */
  onTranscript: (fn: (role: "assistant" | "user", text: string) => void) => void;
}

export async function startRealtimeCoach(opts: { context: string; experience: string }): Promise<RealtimeHandle> {
  const res = await fetch("/api/ai/realtime", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-rally-guest": guestId() },
    body: JSON.stringify(opts),
  });
  const json = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: { code: string; message: string } };
  if (!res.ok || !json.clientSecret) {
    throw new ApiError(res.status, json.error?.code ?? "realtime_failed", json.error?.message ?? "Voice coach unavailable.");
  }

  // Microphone permission is requested here, separately from the camera.
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const pc = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
  };
  pc.addTrack(mic.getTracks()[0], mic);
  const dc = pc.createDataChannel("oai-events");
  const listeners = new Set<(role: "assistant" | "user", text: string) => void>();
  dc.addEventListener("message", (e) => {
    try {
      const ev = JSON.parse(e.data as string) as { type: string; transcript?: string };
      if (ev.type === "response.output_audio_transcript.done" && ev.transcript) listeners.forEach((l) => l("assistant", ev.transcript!));
      if (ev.type === "conversation.item.input_audio_transcription.completed" && ev.transcript) listeners.forEach((l) => l("user", ev.transcript!));
    } catch {
      /* ignore non-JSON */
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    body: offer.sdp,
    headers: { Authorization: `Bearer ${json.clientSecret}`, "Content-Type": "application/sdp" },
  });
  if (!sdp.ok) {
    mic.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new ApiError(sdp.status, "realtime_failed", "Could not connect the voice coach.");
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });

  return {
    close: () => {
      dc.close();
      pc.close();
      mic.getTracks().forEach((t) => t.stop());
      audio.srcObject = null;
    },
    say: (text: string) => {
      if (dc.readyState !== "open") return;
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } }));
      dc.send(JSON.stringify({ type: "response.create" }));
    },
    onTranscript: (fn) => {
      listeners.add(fn);
    },
  };
}
