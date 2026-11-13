# 14-Step High-Quality Wedding Film Production Design

## Goal

Turn all 14 story-mode pages into executable production workstations. Every page must expose required inputs, actual actions, outputs, review evidence, and a version-bound release gate. The completed workflow must produce a real 24 FPS wedding film without skipping image, video, audio, subtitle, or delivery stages.

## Default Project

- 24 FPS.
- 16:9 unless the project selects 9:16.
- 40 seconds by default.
- 960 frames at the default duration.
- Real facts, names, photos, and rights come from the user.

## Shared Page Contract

Every step page has:

1. Goal and current status.
2. Required inputs with upload or selection controls.
3. Production actions.
4. Actual media preview.
5. Human review checklist.
6. Artifact list with versions and hashes.
7. Release gate showing exactly what is missing.

The confirm action is enabled only when the server-side readiness rule and current content fingerprint pass.

## Prompt Architecture

Image prompts and video prompts are separate versioned records.

### Image Prompt

```text
Task
Fact source
Reference role mapping
Identity lock
Age and era
Wardrobe and accessories
Scene and props
Lighting and palette
Framing and camera height
Action instant and expression
Continuity anchors
Aspect ratio
Negative constraints
```

An image prompt describes a stable instant. It must not ask for a camera move or an action sequence.

### Video Prompt

```text
Approved first frame
Duration, FPS, ratio, frame count
Start state
Action phases
End state
Camera move and axis
Identity and wardrobe continuity
Background and lighting continuity
Cut connection
Sound reference
Negative constraints
```

A video prompt describes change over time and must reference an approved first frame.

## Step Specifications

### 1. Story Intake

- Inputs: groom and bride identity, date, city, individual portraits, five-act facts, forbidden events, usage rights.
- Actions: upload by role, image suitability report, five-act editing, story-card copy.
- Outputs: facts, photo manifest, missing-item list.
- Gate: five acts complete and each lead has at least one usable portrait.

### 2. Script Writing Pack

- Inputs: facts, duration, theme, tone.
- Actions: generate logline, five acts, complete narration, fact map, word/time estimate, manual editing, external model copy.
- Outputs: script v1, narration text, source map.
- Gate: narration fits the duration estimate and contains no invented fact.

### 3. Couple Confirmation

- Inputs: script v1, unresolved questions, names and dates.
- Actions: readable script presentation, fact-source visibility, new-version creation, evidence entry.
- Outputs: couple-approved script.
- Gate: explicit couple confirmation evidence exists for the current hash.

### 4. Voice Audition

- Inputs: narration excerpt, voice models, rate and emotion parameters.
- Actions: generate 3-5 real audition files, play them, compare duration, choose voice.
- Outputs: audition samples and voice selection.
- Gate: one sample is actually selected and listened to.

### 5. Full Narration

- Inputs: approved script, selected voice and rate.
- Actions: generate full narration, inspect transcript, measure duration, show sentence timings and silences, complete playback.
- Outputs: final voice WAV, timing map, transcript.
- Gate: full narration listened to and accepted.

### 6. Storyboard

- Inputs: narration timings, five acts, duration, characters, costume and scene direction.
- Actions: create shots, edit each shot, choose cast references, set start/end actions and transitions, validate frames.
- Outputs: `SHOT_PLAN.json`.
- Gate: contiguous timeline, exact total frames, every shot has fact source, character, action and transition.

### 7. Three Key Stills

- Inputs: three highest-risk shots, cast portraits, costume and scene references.
- Actions: generate image prompts, show reference order, create or upload images, compare versions, bind selected image to shot, review identity and pose.
- Outputs: selected key stills and image-prompt versions.
- Gate: three key shots, or all shots if fewer than three, have approved bound images.

### 8. Remaining Stills

- Inputs: approved key stills, remaining shot list, era/wardrobe groups.
- Actions: per-shot image prompts, generation or manual upload, version selection, single-shot regeneration, cross-shot continuity audit.
- Outputs: approved first frame for every shot.
- Gate: all shots have a bound, approved image version.

### 9. Image-to-Video

- Inputs: approved first frame, image prompt, video prompt, video model, optional motion reference.
- Actions: build video prompt from the approved first frame, generate or upload video, preview full action, bind version, eight-point human QC, single-shot retry.
- Outputs: approved video and video-prompt version for every shot.
- Gate: every shot has video, first frame, prompt version and complete human review.

### 10. BGM Audition

- Inputs: narration emotion timeline, duration, music rights.
- Actions: create or upload three actual candidates, inspect BPM/duration/mood, playback, record source and license, select one.
- Outputs: selected music and usage record.
- Gate: a real playable music file is selected.

### 11. Voice and BGM Sample Mix

- Inputs: final voice, selected music, opening/turn/climax/ending cues.
- Actions: produce a real representative mix, duck music under voice, report LUFS and peak, play sample.
- Outputs: mix sample and mix parameters.
- Gate: producer listens and approves the current sample.

### 12. Full Mix

- Inputs: full voice, full music, approved timeline.
- Actions: render complete mix, preserve voice and music stems, normalize to -14 LUFS and TP <= -1 dBTP, inspect duration.
- Outputs: full mix WAV and stems.
- Gate: complete full-length listen and technical loudness pass.

### 13. Subtitle Preview

- Inputs: approved copy, narration timings, full mix, shot timeline.
- Actions: generate SRT, edit cues, set font/size/color/outline/position, enforce approximately 18 CJK characters per line, render a full preview.
- Outputs: preview video, SRT, subtitle style.
- Gate: complete watch-through, safe-area check and audio-sync check.

### 14. Delivery

- Inputs: approved preview, all media, prompts, reviews, rights records.
- Actions: create final export, SRT, edit project, shot table, asset map, prompt history, QC report and delivery manifest.
- Outputs: delivery folder with hashes.
- Gate: producer check and couple acceptance recorded separately.

## Data and Server Interfaces

- `renderMixSample({ voicePath, musicPath, start, duration })`
- `renderFullMix({ voicePath, musicPath, duration })`
- `renderDeliveryPackage({ project, exportAsset, subtitleAsset, editProjectAsset })`
- `POST /api/projects/:id/prompts/image`
- `POST /api/projects/:id/prompts/video`
- `POST /api/projects/:id/mix/sample`
- `POST /api/projects/:id/mix/full`
- `POST /api/projects/:id/preview`
- `POST /api/projects/:id/delivery`

All image and video inputs are asset IDs. No browser-supplied filesystem path is accepted.

## Error Handling

- Missing inputs identify the exact step and field.
- Failed model calls preserve the provider response and do not advance.
- Changing an artifact invalidates downstream approvals.
- Technical success never creates human approval.
- Manual upload is available when a model is blocked.

## Testing

- Unit tests for all 14 step definitions, prompt structures, frame validation and release gates.
- Media tests for sample mix, full mix, subtitle style and delivery manifest.
- API tests for prompt, mix, preview and delivery endpoints.
- Isolated integration test for the complete 1-14 flow.
- Real-model acceptance remains separate and must record unavailable providers honestly.
