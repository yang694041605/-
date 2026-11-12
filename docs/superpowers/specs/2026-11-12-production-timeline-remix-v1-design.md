# Production Timeline and Remix Flow 1.0 Design

## Document

- Product: 囍映 AI 婚礼微电影创作台
- Date: 2026-11-12
- Status: approved for implementation
- Scope: unify the story-driven 14-step workflow and the Douyin template remix workflow around one production model

## Goal

Make the application capable of producing a traceable, reviewable, frame-accurate wedding film. A project must have one authoritative timeline shared by the project, story, narration, subtitles, music, shots, and export. The application must not claim that a shot, review, or film is complete when its current version has not actually been generated and reviewed.

## Two Entry Modes

### Story Mode

The existing 14-step workflow remains:

1. Story intake
2. Script writing pack
3. Couple approval
4. Voice audition
5. Full narration
6. Storyboard
7. Key still frames
8. Remaining still frames
9. Image-to-video
10. BGM audition
11. Narration/BGM mix sample
12. Full mix
13. Subtitled preview
14. Delivery

### Remix Mode

The Douyin workflow has four pages:

1. Import the source video, extract frames at 24 FPS, extract audio, and index frames.
2. Analyze shot content, people, audio, subtitles, and reusable prompt structure.
3. Assign replacement targets, generate character references, generate each shot, and inspect results.
4. Use the approved original audio/subtitle structure where permitted, assemble the current shot timeline, and deliver preview plus editable mapping.

The final replacement is not implemented as thousands of unrelated image edits. The system extracts and tracks all frames at 24 FPS, but regenerates each shot with Seedance using the original shot as motion/camera reference. This preserves temporal consistency while retaining frame-accurate source mapping.

## Source of Truth

`ProductionProject.timeline` is the only duration authority.

```json
{
  "fps": 24,
  "duration": 40,
  "totalFrames": 960,
  "revision": 1,
  "hash": "sha256",
  "tracks": {
    "video": [],
    "voice": [],
    "music": [],
    "subtitle": []
  }
}
```

- A template's duration is stored as `referenceDuration`; it never overwrites the project duration implicitly.
- Applying a template may update the reference duration, aspect, and template ID.
- Changing narration duration marks storyboard, subtitles, mix, preview, and delivery as stale.
- All time boundaries are normalized to 24 FPS frame boundaries.
- Timecode is formatted as `HH:MM:SS:FF`.

## Shot Model

Each story shot is a production record.

```json
{
  "id": "shot-03",
  "order": 3,
  "start": 6,
  "end": 8,
  "frames": 48,
  "source": {
    "mode": "template",
    "templateId": "template-001",
    "templateShotId": "template-shot-12",
    "referenceStart": 34.2,
    "referenceEnd": 36.2
  },
  "prompt": {
    "version": 3,
    "hash": "sha256",
    "text": "complete video prompt"
  },
  "characters": {
    "groom": { "referenceAssetId": "asset-1", "target": "left" },
    "bride": { "referenceAssetId": "asset-2", "target": "right" }
  },
  "assets": {
    "firstFrame": { "assetId": "", "hash": "" },
    "video": { "assetId": "", "hash": "" },
    "finalClip": { "assetId": "", "hash": "" }
  },
  "status": "draft",
  "review": {
    "identity": "pending",
    "crossFace": "pending",
    "hands": "pending",
    "actionMatch": "pending",
    "backgroundDrift": "pending",
    "blackBars": "pending",
    "subtitleSafety": "pending",
    "audioSync": "pending"
  }
}
```

Allowed production states are `draft`, `needs-assets`, `generated`, `technical-review`, `human-review`, `approved`, and `rejected`.

## Approval and Fingerprints

An approval is bound to the current page and current content.

```json
{
  "step": 8,
  "mode": "story",
  "approvedAt": "2026-11-12T00:00:00.000Z",
  "fingerprint": "sha256",
  "timelineHash": "sha256",
  "assetHashes": {
    "asset-1": "sha256"
  },
  "promptVersions": {
    "shot-01": 2
  }
}
```

The approval API calculates and stores the fingerprint. A changed dependency makes the approval stale. An approval for step 8 cannot be used to approve step 5.

## Routing

- Story pages use `#/story/step/1` through `#/story/step/14`.
- Remix pages use `#/remix/step/1` through `#/remix/step/4`.
- Other pages use stable hashed routes such as `#/assets`.
- Browser reload, back, forward, and direct links preserve the current page.
- The confirm action derives the step from the URL, not from a global current-step value.

## Rendering

The render endpoint accepts the current timeline and asset IDs only.

- It rejects absolute/relative filesystem paths from the browser.
- It resolves asset IDs on the server.
- It verifies that files remain inside the project media root.
- It includes only approved current shots in storyboard order.
- It rejects gaps, overlaps, stale approvals, unapproved shots, and source ranges that exceed media duration.
- It writes the exact timeline revision and hashes into the edit project.

The visual processing uses safe crop or a blurred image background rather than black pillarboxes by default. Audio mixing uses narration-aware music attenuation and loudness normalization. Subtitle lines are length checked and kept inside the safe area.

## Quality Gates

Technical checks and human checks are separate.

- Technical: codec, dimensions, frame rate, duration, audio track, subtitle track, black bars, source range, and audio/video duration agreement.
- Human: identity, cross-face, hands, action matching, background drift, subtitle readability, audio sync, and overall approval.
- A technical pass never marks a shot or film as human-approved.
- Seedance generation failure is recorded as failed or blocked; it is never converted to a successful shot.

## Security

- CORS is limited to configured local origins.
- State-changing requests verify Origin.
- Browser requests submit asset IDs, never arbitrary file paths.
- Server-side path resolution validates containment under the project media directory.
- Generated/static HTML is a preview; production actions run through the local server.

## Testing

- Unit tests for timecode, frame allocation, route parsing, shot binding, fingerprint changes, and approval invalidation.
- API tests for origin rejection, path rejection, timeline validation, and selected-shot rendering.
- Media tests for safe fill, subtitle safety, and audio/video duration.
- Isolated fake-model integration tests for story and remix flows.
- Manual real-model acceptance remains separate and requires an available video model plus authorized couple photos.

## External Acceptance Boundary

The code can be completed and verified with fake models without a paid subscription. A real acceptance run with at least eight Seedance replacement shots requires:

- an active Seedance-capable account;
- authorized photos for the actual groom and bride;
- permission to use the reference video, its music, and its subtitles;
- a confirmed per-batch generation authorization.

Without those conditions, the product must show a blocked acceptance record and must not claim production readiness.
