# ODD Live TV stream path

ODD Live TV is a self-hosted local broadcast. The selected local host worker prepares short speech segments from verified product facts and optional admin notes. The broadcaster sends video and AAC audio to MediaMTX over RTSP; the storefront player reads the public HTTPS MediaMTX stream.

The public page and admin control stay separate: the admin selects two products, writes optional notes, and starts or stops the show. Viewer questions are queued by ODD Live TV and handled in scheduled Q&A windows. Live Drop remains a product offer page; the separate ODD Live TV show owns its host, script, and viewer chat.

Before an эфир, confirm the workstation controller is online, the RTSP path has H.264 and AAC, the public player loads both audio and video, and an actual browser playback check confirms audible sound. RTSP publisher readiness alone does not prove that public HLS audio plays.
