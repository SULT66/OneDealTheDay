# ODD Live TV: 60-minute two-product pilot

## Format

- Total airtime: 60 minutes.
- Product 1: minute 00:00 through 30:00.
- Product 2: minute 30:00 through 60:00.
- Viewer questions are stored with the product that was on screen when they were submitted.
- The GPU takes one batch of up to three questions per Q&A slot. It starts the MuseTalk render during the preceding five-minute product narration and stamps the clip with its Q&A start time.
- A batch is marked answered only after the local broadcaster reports that the full clip was sent to the RTSP output. This confirms encoder delivery, not that every viewer's browser played audible sound. Each Q&A slot takes at most three questions. Unanswered questions remain queued on that show's record and are not marked answered. The current pilot does not yet transfer overflow into a later show's queue automatically.

This pilot is two products only. The admin console and server reject a different number so the 30/30 split stays exact.

## Run of show

| Show clock | On-air segment | Question/render operation |
|---|---|---|
| 00:00–03:00 | Welcome, introduce Product 1 | Questions start collecting |
| 03:00–08:00 | Product 1 overview | At 03:00, freeze up to three Product 1 questions; render answers while Chloe speaks; play at 08:00 |
| 08:00–12:00 | Q&A 1 for Product 1 | Questions continue collecting for the next slot |
| 12:00–17:00 | Product 1 use-case and listing details | At 12:00, freeze the next batch; render during narration; play at 17:00 |
| 17:00–21:00 | Q&A 2 for Product 1 | Questions continue collecting |
| 21:00–26:00 | Product 1 recap and retailer call-to-action | At 21:00, freeze the final Product 1 batch; render during narration; play at 26:00 |
| 26:00–29:00 | Q&A 3 for Product 1 | Late or excess Product 1 questions remain queued; no product 1 question is relabeled as Product 2 |
| 29:00–30:00 | Transition to Product 2 | Host names the next listing |
| 30:00–33:00 | Introduce Product 2 | Questions start collecting under Product 2 |
| 33:00–38:00 | Product 2 overview | At 33:00, freeze up to three Product 2 questions; render during narration; play at 38:00 |
| 38:00–42:00 | Q&A 1 for Product 2 | Questions continue collecting |
| 42:00–47:00 | Product 2 use-case and listing details | At 42:00, freeze the next batch; render during narration; play at 47:00 |
| 47:00–51:00 | Q&A 2 for Product 2 | Questions continue collecting |
| 51:00–56:00 | Product 2 recap and retailer call-to-action | At 51:00, freeze the final batch; render during narration; play at 56:00 |
| 56:00–59:00 | Q&A 3 for Product 2 | Any remaining questions remain queued for a later answer slot/show |
| 59:00–60:00 | Close the show | Thank viewers and point to the retailer listing |

The scheduled Q&A answer times are **08, 17, 26, 38, 47, and 56 minutes**. The answer clip may begin late if speech generation/rendering takes longer than the five-minute lead. The stream should keep its current product footage running until the clip is ready; it must not claim an answer aired before playback completes.

## Timed host script (English, US audience)

The run-of-show holds the order and cue times. Fill bracketed fields from the two selected published listings immediately before the show. Only use facts present in the listing. If a field is missing or stale, omit it or say, “I can’t confirm that from the listing.”

### 00:00–03:00 — Welcome and Product 1 reveal

“Hi, everyone, and welcome to ODD Live. I’m Chloe. We have two products in today’s show, with the first one featured for the first half hour and the second one for the next half hour. I’ll walk through what each retailer listing actually says, and I’ll take your questions in scheduled Q&A breaks so I can give them proper attention.

“First up is **[Product 1 title]**, listed by **[retailer]**. The listing shows **[current verified price, if checked within the last hour]**. I’m going to start with the details we can confirm, then we’ll pause for your questions. If you’re watching live, send a short question about this first product now. I’m collecting them while we take a closer look.”

### 03:00–08:00 — Product 1 overview; prepare Q&A 1 in the background

“Let’s take a closer look at **[short title]**. The listing describes it for **[exact use-case phrase from the listing]**. The product page also lists **[verified detail 1]** and **[verified detail 2]**. I’m staying with those published details so you can compare the listing without guessing about specifications.

“The current listed price is **[verified price]**. Prices and availability can change, so the retailer page is the place to confirm before you buy. What I’d suggest checking there is whether the listed details match what you need, and whether any options shown by the retailer fit your use.

“I’m collecting your Product 1 questions now. I’ll answer the first group in just a moment. If we can’t confirm a detail from the listing, I’ll say so clearly instead of making something up.”

### 08:00–12:00 — Product 1 Q&A 1

“Thanks for sending those in. Let’s take the first questions about **[short title]**.

“**[Answer up to three questions, in the order received. Keep each answer concise. Use only catalog facts; if unknown, say it is not confirmed and direct viewers to the retailer listing.]**

“Keep your Product 1 questions coming. I’m moving back to the listing now, and we’ll take another group at the next Q&A break.”

### 12:00–17:00 — Product 1 use case and listing details; prepare Q&A 2

“Here’s another way to evaluate **[short title]**: start with the use described on the page, then compare the listed details with what you’re looking for. The retailer calls out **[verified detail 3]**. It also identifies the item as **[brand, if present]**.

“Those are the details we can verify here. The page does not confirm **[common unknown, only if relevant: dimensions, warranty, shipping, stock, compatibility, or included accessories]**, so I won’t guess. Check the retailer listing for that before making a decision.

“I’ve gathered the next group of questions while we reviewed the product. Let’s answer those now.”

### 17:00–21:00 — Product 1 Q&A 2

“Here’s the next group about **[short title]**.

“**[Answer up to three queued questions. Keep answers factual and distinct; do not repeat the previous Q&A verbatim.]**

“Thank you. I’m returning to the product details for a quick recap, and then we’ll take the final Product 1 question group.”

### 21:00–26:00 — Product 1 recap; prepare Q&A 3

“To recap **[short title]**: the listing describes it as **[verified description/use]**, from **[retailer]**, at **[current verified price, if available]**. The specific listing details we reviewed were **[two strongest verified facts]**.

“If that sounds relevant to what you need, open the retailer listing and confirm the current price, availability, and full specifications. The link is here with the product card. I’m gathering the final Product 1 questions for this half of the show.”

### 26:00–29:00 — Product 1 Q&A 3

“Let’s take the final Product 1 questions.

“**[Answer up to three queued questions. If no questions are queued, use the short recap below rather than an empty screen.]**

“Product 1 questions that arrived too late for this slot stay in the queue for a later answer. Now let’s get ready for our second product.”

### 29:00–30:00 — Transition

“That wraps up the first half hour. In a moment, we’ll switch to **[Product 2 title]** and spend the second half of the show with that listing. Send Product 2 questions once it appears, and I’ll collect them for the next Q&A break.”

### 30:00–33:00 — Product 2 reveal

“Welcome to the second half of ODD Live. Our next product is **[Product 2 title]**, listed by **[retailer]**. The listing shows **[current verified price, if checked]** and describes it as **[exact listing phrase]**.

“I’ll review the published details first, then answer your questions at the scheduled breaks. Send a short question about Product 2 now.”

### 33:00–38:00 — Product 2 overview; prepare Q&A 1

“Let’s look at **[Product 2 short title]**. The listing highlights **[verified detail 1]** and **[verified detail 2]**. It is described for **[exact listed use case]**.

“The listed price is **[verified price]**. Please check the retailer page for current price and availability, because those can change. If you need a specification that isn’t shown in the listing, I’ll tell you that it isn’t confirmed.

“I’ve collected the first Product 2 questions while we reviewed those details. Let’s answer them.”

### 38:00–42:00 — Product 2 Q&A 1

“Here are the first questions about **[Product 2 short title]**.

“**[Answer up to three queued questions, using verified listing facts only.]**

“Keep sending questions about Product 2. I’m going back to the listing for one more closer look.”

### 42:00–47:00 — Product 2 use case; prepare Q&A 2

“One useful way to compare **[Product 2 short title]** is to look at **[verified listing detail 3]** alongside **[verified detail 4, if present]**. The product page identifies **[brand or retailer]**. I can confirm those points from the listing; I can’t confirm anything that the page doesn’t state.

“Before buying, check the retailer page for the complete specifications, current price, and availability. I’m gathering your next questions now, and we’ll answer that group at the next break.”

### 47:00–51:00 — Product 2 Q&A 2

“Let’s take the next Product 2 questions.

“**[Answer up to three queued questions. If the listing does not answer one, state that plainly and point to the retailer page.]**

“Thank you for watching. We have one final recap and Q&A group before we wrap up.”

### 51:00–56:00 — Product 2 recap; prepare Q&A 3

“To recap **[Product 2 short title]**: the listing describes it as **[verified use/description]**, from **[retailer]**, for **[verified price if fresh]**. The details we confirmed together were **[two strongest listing facts]**.

“You can open the product card to read the full retailer listing. Please confirm the latest price and availability there. I’m collecting the final Product 2 questions now.”

### 56:00–59:00 — Product 2 Q&A 3

“Here is the last scheduled group of Product 2 questions.

“**[Answer up to three queued questions, in order, using only confirmed facts.]**

“Questions that came in after this group remain queued for the next answer window. Thanks for spending this hour with me.”

### 59:00–60:00 — Close

“That’s the end of today’s ODD Live. We featured **[Product 1 short title]** in the first half and **[Product 2 short title]** in the second. Open either product card to review its current retailer listing. Thanks for joining, and I’ll see you next time.”

## Current Product 1 example

A product visible in the latest pilot screens was **“11 PC Resistance Bands Set Pull Rope Gym Home Fitness Workout Crossfit YogaTube”**, displayed at **$8.99**. Use this only if that exact listing is one of the two products selected and the price is still fresh at show prep. The title supports saying that the listing presents it as a resistance-band set for home fitness, CrossFit, and yoga. It does **not** establish exact included components, resistance levels, durability, medical benefits, or stock.

## Preparation checklist

1. Select exactly two published products in the US admin console.
2. Before starting, build the script fields from the listing title, brand, retailer, description, and a price verified within the last hour. Do not add unlisted claims.
3. Start the one-hour show. Product 1 occupies minutes 00–30; Product 2 occupies minutes 30–60.
4. During each five-minute narration lead-in, the worker freezes no more than three queued questions for the upcoming slot, renders one combined answer clip, and queues it with the slot start time.
5. Confirm in logs that the full clip was sent to RTSP. Separately check the public HLS page for audible playback; the current broadcaster ACK proves encoder delivery, not browser audio.
6. If a render misses its five-minute lead, keep product video on screen and carry the answer to the next Q&A window. Never play a lip-sync clip before its audio is ready, and never mark an unheard answer as delivered.

## Operational limit of this pilot

The answer schedule and background queue are implemented in the pilot branch. The exact run-of-show above is the production plan; continuous, minute-by-minute product narration still depends on preparing and airing the narration clips before launch. MuseTalk is not instantaneous. A late render can miss its intended slot, and excess questions can roll to a later slot/show. Verify audio and playback on the public HLS page before treating this as a finished customer-facing broadcast.

## Live player requirements in the pilot

- The red pulsing LIVE badge sits over the video and shows the show time remaining.
- The audience count is based on anonymous per-tab heartbeats. It updates while the page is visible, removes a viewer immediately on page exit where possible, and expires a disconnected tab after 45 seconds.
- Viewer chat and the question form sit on top of the video, so viewers can ask without scrolling below the player.
- The expand button widens the player; fullscreen uses the browser Fullscreen API. The minimize button keeps the stream playing in a fixed corner player on the same page, with a restore control and compact chat toggle.
- The iframe allows the underlying MediaMTX player to offer browser Picture-in-Picture where supported. The in-page corner player is the consistent fallback.
