# ODD Live TV stream path

ODD Live TV is a self-hosted live broadcast. The OneDailyDrop server gives OpenAI the current product's verified details and queued viewer questions to prepare each turn. The local GPU worker receives the prepared text, creates the voice through Azure Speech, and renders lip-synced video with MuseTalk. No admin script is stored or read.

The broadcaster publishes one continuous H.264/AAC RTSP feed to MediaMTX. OneDailyDrop's public player reads the HTTPS HLS stream. It is a live program feed, not a prerecorded MP4 played in a loop. The default broadcaster holds an idle avatar frame while the next on-demand spoken segment is rendered; it does not loop prerecorded idle-motion clips.

Questions from the public live chat are handled on the next available host turn, rather than waiting for a scheduled Q&A window. The viewer page presents the active product, chat, audience count, and live video. The player starts muted for browser autoplay policy and provides a clear button for turning on audio.

Before an эфир, confirm the workstation controller is online, the RTSP path has H.264 and AAC, the public player loads both tracks, and a browser playback check confirms audible sound and synchronized lips. RTSP publisher readiness alone does not prove that a remote browser can hear the stream.
