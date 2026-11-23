# Design: the landing page leads with the Hubbard sound

## Why

Visitors who know the C64 scene saw "a SID tracker for the browser" and thought "another tracker, so what": GoatTracker, SID-Wizard and SID Factory II exist and are mature. Features (three voices, ADSR, arpeggio) cannot set this project apart from them.

What does set it apart is the name everyone recognises: the sound of Rob Hubbard's music, and the fact that he never had a tracker. He typed his music as numbers into assembly; his player was never a tool for others and is not free to copy. This project is a clean-room player built around exactly his tricks, with a tracker on top. The landing page now says that first.

## Goals

- The first screen says why this is different in words a retro computing fan recognises as Hubbard's sound, without naming him: "Sweeping pulses. Late vibrato. Drums on the bass. Now with a tracker." His name is in the body, where the page says what he did.
- The visitor can hear the sound within seconds, on the landing page itself, without opening the tracker.
- Each Hubbard trick is tied to the instrument field that makes it, so the claim is concrete.

## Non-goals and anti-goals

- No claim to be "the first" or "the only" tracker for this sound: GoatTracker can get close with work, and an absolute claim invites a fight. The claim is historical: he never had one.
- His name describes the style, never a brand: no "The Rob Hubbard tracker", no photo, no game art, no clips of his music. The page says it is not affiliated with or endorsed by him and contains none of his code or music.

## Approaches considered

1. **Live engine on the landing page**: start the 6502 core and reSIDfp when "Hear it" is pressed. Proves the point most directly, but loads the whole engine and the WebAssembly before the first sound, on a page that should be instant.
2. **A recorded clip (chosen)**: 40 seconds of the raster rumble soundtrack, rendered offline by the same engine (`web/engine/render-wav.mjs`, which now takes a project file) and encoded as AAC (about 500 KB, loaded only on the first press). Instant, honest (the caption says how it was made), and no new code paths in the app.
3. **"Hear it" opens the tracker with a demo playing**: one more page load and the tracker's interface in the way; the visitor has not decided yet to try a tool.

## As built

- Hero: kicker line, the headline of three tricks, a lead without his name, buttons "Hear it" (shown only with JavaScript; then "Open the tracker" is no longer the primary button), "Open the tracker", "Play raster rumble", and a fine-print line saying what the clip is.
- New section "The Hubbard sound, with a grid": six tricks, each with the editor field that makes it, and "Why this did not exist before".
- The first paragraph of "What it is" was removed, because the new section says it better.
- Title, description and Open Graph text lead with the same message. The licence section names the clip's music and has the "not affiliated" note.
- The README's opening and "Why", the instrument chapter of the guide and of the in-app manual got the same framing in one or two sentences.

## Change in 0.2.3: his name out of the headline

Release 0.2.2 had "Rob Hubbard never had a tracker." as the headline. On reflection the name of a living person as the biggest line of the page felt like leaning on him. The headline now names three of his tricks, which the audience recognises, and his name stays in the body: the section "The Hubbard sound, with a grid" says what he did, and the licence section says the project is not affiliated with or endorsed by him. A headline like "The 1985 SID sound never had a tracker" was rejected: it is not true, other trackers can make that sound.
