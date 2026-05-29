/**
 * Static data for the Telegram voice & attachment guide.
 * Fetched just-in-time via skill_get(type: "telegram").
 */
export function buildTelegramGuide(): string {
  return `\
[telegram]
description = "Telegram integration capabilities, voice memo workflows, and attachment guides for bidirectional voice communication."
capabilities_source = "session_info.telegramCapabilities — check these flags before attempting any voice feature."

[capability_flags]
available = "Telegram integration is enabled and configured."
openwhisper = "Speech-to-text available — can transcribe incoming voice memos to text."
piper = "Text-to-speech available — can generate voice from LLM output."
ffmpeg = "Audio conversion available — required to encode audio as OGG/Opus for Telegram."

[voice_to_text]
description = "User sends voice memo → transcribe → send to active PTY session."
step_1 = "Receive attachment from Telegram with mime audio/*"
step_2 = "If openwhisper=true: run openwhisper on the audio file, extract transcript"
step_3 = "Prefix transcript: \\"User voice memo: {transcribed_text}\\""
step_4 = "Send to active session via session_send_text"
fallback = "If openwhisper=false: reply to user \\"Voice memo received but speech-to-text is not configured. Please send text.\\""

[text_to_voice]
description = "LLM text → piper TTS → ffmpeg OGG → Telegram voice message."
requires = "piper=true and ffmpeg=true"
step_1 = "Generate WAV with piper: piper --model en_US-hfc_female-medium --output_file response.wav"
step_2 = "Convert to OGG/Opus: ffmpeg -i response.wav -c:a libopus -b:a 96k response.ogg"
step_3 = "Base64-encode response.ogg"
step_4 = "Send via telegram_chat with attachment: { name: \\"response.ogg\\", data: base64, mime: \\"audio/ogg\\" }"
fallback = "If piper=false or ffmpeg=false: send text response only."

[attachment_format]
preferred = "audio/ogg (OGG/Opus, 96kbps) — smallest file, native Telegram playback"
also_supported = "audio/mpeg (MP3), audio/mp4 (M4A/AAC), audio/wav (large, avoid)"

[tool_paths_config]
note = "Configured by user in Settings → Telegram panel: ffmpegPath, piperPath, openWhisprPath, openWhisprModelPath, piperVoicePath."

[troubleshooting]
voice_memo_fails = "Check ffmpeg and piper paths in Telegram settings"
transcription_fails = "Check openWhisprPath in Telegram settings"
ogg_too_large = "Use -b:a 96k in ffmpeg command"
`;
}
