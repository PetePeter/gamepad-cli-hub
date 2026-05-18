/**
 * Static data for the Telegram voice & attachment guide.
 * Fetched just-in-time via skills_get(type: "telegram").
 */
export function buildTelegramGuide() {
  return {
    description: 'Telegram integration capabilities, voice memo workflows, and attachment guides for bidirectional voice communication.',
    capabilities_source: 'session_info.telegramCapabilities — check these flags before attempting any voice feature.',
    capability_flags: {
      available: 'Telegram integration is enabled and configured.',
      openwhisper: 'Speech-to-text available — can transcribe incoming voice memos to text.',
      piper: 'Text-to-speech available — can generate voice from LLM output.',
      ffmpeg: 'Audio conversion available — required to encode audio as OGG/Opus for Telegram.',
    },
    workflow_voice_to_text: {
      description: 'User sends voice memo → transcribe → send to active PTY session.',
      steps: [
        'Receive attachment from Telegram with mime audio/*',
        'If openwhisper=true: run openwhisper on the audio file, extract transcript',
        'Prefix transcript: "User voice memo: {transcribed_text}"',
        'Send to active session via session_send_text',
      ],
      fallback: 'If openwhisper=false: reply to user "Voice memo received but speech-to-text is not configured. Please send text."',
    },
    workflow_text_to_voice: {
      description: 'LLM text → piper TTS → ffmpeg OGG → Telegram voice message.',
      requires: ['piper=true', 'ffmpeg=true'],
      steps: [
        'Generate WAV with piper: piper --model en_US-hfc_female-medium --output_file response.wav',
        'Convert to OGG/Opus: ffmpeg -i response.wav -c:a libopus -b:a 96k response.ogg',
        'Base64-encode response.ogg',
        'Send via telegram_chat with attachment: { name: "response.ogg", data: base64, mime: "audio/ogg" }',
      ],
      fallback: 'If piper=false or ffmpeg=false: send text response only.',
    },
    attachment_format: {
      preferred: 'audio/ogg (OGG/Opus, 96kbps) — smallest file, native Telegram playback',
      also_supported: ['audio/mpeg (MP3)', 'audio/mp4 (M4A/AAC)', 'audio/wav (large, avoid)'],
    },
    tool_paths_config: 'Configured by user in Settings → Telegram panel: ffmpegPath, piperPath, openWhisprPath, openWhisprModelPath, piperVoicePath.',
    troubleshooting: [
      { issue: 'Voice memo attachment fails', fix: 'Check ffmpeg and piper paths in Telegram settings' },
      { issue: 'Transcription fails', fix: 'Check openWhisprPath in Telegram settings' },
      { issue: 'OGG file too large', fix: 'Use -b:a 96k in ffmpeg command' },
    ],
  };
}
