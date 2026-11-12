# Production Timeline and Remix V1 Implementation Plan

## Goal

Unify the 14-step story workflow and four-step Douyin remix workflow around one frame-accurate production timeline, versioned shot records, secure asset-ID rendering, and explicit technical and human quality gates.

## Architecture

- Pure timeline, routing, shot binding, and review rules live in `src/production-model.mjs`.
- Server hashing, asset containment, timeline validation, and approvals live in `server/production.mjs`.
- Remix extraction and analysis live in `server/remix.mjs`.
- The existing Node HTTP server exposes project/timeline/approval/remix/render endpoints.
- The existing vanilla frontend consumes those APIs and uses hash routes.
- FFmpeg remains the deterministic compositor.

## Tech Stack

- Node.js 25 local service
- `node:sqlite`
- Vanilla ES modules and CSS
- FFmpeg/ffprobe
- Ark CLI for authorized text/image/video generation
- Node test runner

## Global Constraints

- All UI and operator messages use Simplified Chinese.
- The film is 24 FPS.
- One project has one authoritative duration and timeline.
- Every approval binds a content fingerprint.
- AI output is subject to human review.
- Browser input never controls filesystem paths.
- Paid generation is never automatically retried.
- Real model success must not be fabricated in tests.

## File Structure

### Create

- `src/production-model.mjs`: pure model, route, timeline, shot binding, review and timecode functions.
- `server/production.mjs`: hashing, approvals, asset resolution, timeline validation and timeline construction.
- `server/remix.mjs`: 24 FPS extraction, audio extraction and remix analysis records.
- `tests/production-model.test.mjs`: pure model tests.
- `tests/production-server.test.mjs`: containment, approval and timeline validation tests.
- `tests/remix.test.mjs`: extraction planning and target mapping tests.

### Modify

- `src/story-engine.mjs`: proportional frame-accurate shot allocation and shot metadata.
- `src/app.js`: hash routing, two entries, remix pages, shot prompt synchronization, approvals, timeline render and QC UI.
- `src/api.js`: new project/timeline/remix APIs.
- `src/styles.css`: larger base text and remix/QC layouts.
- `server/index.mjs`: secure CORS, asset-ID-only routes, approval, remix, timeline render and static media route.
- `server/media.mjs`: safe fill, narration ducking, subtitle safety and technical QC.
- `server/db.mjs`: project migration fields and asset hash backfill hook.
- `scripts/build.mjs`: inline the new front-end module.
- `tests/navigation.test.mjs`: hashed routes and two-entry navigation.
- `tests/story-engine.test.mjs`: arbitrary duration and frame allocation.
- `tests/media.test.mjs`: safe fill and subtitle safety helpers.
- `README.md`: 1.0 workflow and blocked real-model boundary.

## Task 1: Frame-Accurate Production Model

**Files**

- Create: `src/production-model.mjs`
- Create: `tests/production-model.test.mjs`

**Interfaces**

- `parseRouteHash(hash) -> { page, mode, step }`
- `routeHash(page, { mode, step }) -> string`
- `formatTimecode(frames, fps = 24) -> string`
- `allocateFrameDurations(totalFrames, weights) -> number[]`
- `buildTimeline({ mode, duration, fps, shots, voice, music, subtitles }) -> Timeline`
- `bindStoryboardToTemplate(storyboard, template) -> Shot[]`
- `approvalIsCurrent(approval, snapshot) -> boolean`

**Steps**

1. Write failing tests asserting `#/story/step/8`, direct-link parsing, invalid step rejection, timecode `00:02:43:05`, 960-frame allocation, template source intervals, and fingerprint mismatch invalidation.
2. Run `npm test -- production-model`; expect failures.
3. Implement pure model functions with no DOM, filesystem, or network dependencies.
4. Run `npm test -- production-model`; expect pass.
5. Commit the production model.

## Task 2: Proportional Storyboard Allocation

**Files**

- Modify: `src/story-engine.mjs`
- Modify: `tests/story-engine.test.mjs`

**Interfaces**

- `buildStoryboard(project)` keeps its name and returns shots whose frame counts sum to `round(duration * 24)`.
- Every generated shot includes `order`, `frames`, `source`, `promptVersion`, `assets`, `review`, and `status`.

**Steps**

1. Add failing tests for 30, 40, and 163.2 seconds; assert that no shot exceeds the intended proportional share and all frame counts are exact.
2. Run `npm test -- story-engine`; expect failure for the current 163.2-second 123.2-second shot.
3. Replace fixed cuts with weighted frame allocation.
4. Add default binding and review objects.
5. Run `npm test -- story-engine`; expect pass.
6. Commit the storyboard model.

## Task 3: Server Production Utilities

**Files**

- Create: `server/production.mjs`
- Create: `tests/production-server.test.mjs`

**Interfaces**

- `sha256Text(text) -> string`
- `sha256File(path) -> Promise<string>`
- `assertInside(root, candidate) -> string`
- `buildProjectTimeline(project, assets, templates) -> Timeline`
- `approveStep(project, { mode, step, snapshot, evidence }) -> workflow`
- `validateRenderTimeline(project, timeline, assets) -> resolved clips`

**Steps**

1. Write failing tests for path traversal, stale approval, missing approved shot, gap, overlap, and duration mismatch.
2. Run `npm test -- production-server`; expect failure.
3. Implement stable JSON hashing, file hashing, containment, approval fingerprints and timeline validation.
4. Run `npm test -- production-server`; expect pass.
5. Commit server production utilities.

## Task 4: Secure HTTP Boundary

**Files**

- Modify: `server/index.mjs`
- Modify: `src/api.js`

**Interfaces**

- `GET /api/projects/:id/timeline`
- `POST /api/projects/:id/workflow/approve`
- `PUT /api/projects/:id/shots/:shotId`
- `POST /api/projects/:id/render-timeline`
- Browser payloads use `assetId` and never `path`, `localPath`, `voicePath`, `musicPath`, or `subtitlePath`.

**Steps**

1. Add tests that an unapproved origin receives no wildcard CORS and a path payload is rejected with HTTP 400.
2. Run tests; expect failure.
3. Replace wildcard CORS with the configured local-origin allowlist.
4. Add asset resolution and containment checks.
5. Add approval and timeline endpoints.
6. Reject direct filesystem path keys in generation and render endpoints.
7. Run tests; expect pass.
8. Commit the secure boundary.

## Task 5: Hashed Routing and Current-Step Approval

**Files**

- Modify: `src/app.js`
- Modify: `src/api.js`
- Modify: `tests/navigation.test.mjs`

**Interfaces**

- `navigate(routeHash)` updates `location.hash`.
- `hashchange` restores `activeRoute`.
- Story confirmation uses the step parsed from `#/story/step/N`.
- Remix confirmation uses the step parsed from `#/remix/step/N`.

**Steps**

1. Write failing route tests for direct story and remix steps.
2. Run tests; expect failure.
3. Replace activeRoute-only navigation with hash navigation and compatibility redirects.
4. Bind confirmation buttons to `data-approval-step` and `data-approval-mode`.
5. Submit approvals through the server fingerprint API.
6. Run tests; expect pass.
7. Commit hashed navigation and approval binding.

## Task 6: Shot Binding and Prompt Synchronization

**Files**

- Modify: `src/app.js`
- Modify: `src/production-model.mjs`
- Modify: `server/index.mjs`

**Steps**

1. Add failing tests that selected shot 8 uses its own duration, template interval, and prompt.
2. Implement `getSelectedShotBinding` and prompt synchronization on select change.
3. Replace `start: 0` and `storyboard[0]` with the selected shot's `source.referenceStart`, duration, and prompt.
4. Add first-frame, video, final-clip, and review fields to shot updates.
5. Run tests; expect pass.
6. Commit selected-shot generation.

## Task 7: Selected-Timeline Renderer

**Files**

- Modify: `src/app.js`
- Modify: `server/index.mjs`
- Modify: `server/media.mjs`
- Modify: `tests/media.test.mjs`

**Steps**

1. Add failing tests for selected-only rendering, gap rejection, blurred fill, subtitle line length, and narration ducking filter construction.
2. Implement timeline-based render input with asset IDs.
3. Render only approved shots in the saved order.
4. Add blurred image fill and keep the final frame count exact.
5. Add narration-aware music attenuation.
6. Add technical QC result fields.
7. Run tests; expect pass.
8. Commit the renderer.

## Task 8: Douyin Four-Step Remix

**Files**

- Create: `server/remix.mjs`
- Create: `tests/remix.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`
- Modify: `src/app.js`

**Interfaces**

- `POST /api/templates/:id/remix/extract`
- `POST /api/templates/:id/remix/analyze`
- `PUT /api/projects/:id/remix/targets`
- `POST /api/projects/:id/remix/render`

**Steps**

1. Write failing tests for 24 FPS frame count, target labels, and one-shot correspondence.
2. Add extraction planning for 24 FPS frames, WAV, shot audio mapping and a frame index.
3. Add remix project mode and four hash routes.
4. Add target assignment for left/right and numbered people.
5. Add shot generation using the selected template interval.
6. Add remix timeline assembly using approved current shots.
7. Run tests; expect pass.
8. Commit the remix flow.

## Task 9: Human Quality Control

**Files**

- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `server/index.mjs`
- Create: `tests/quality.test.mjs`

**Steps**

1. Write failing tests that technical pass does not produce human approval and all eight review fields are required.
2. Add per-shot QC checks for identity, cross-face, hands, action match, background drift, black bars, subtitle safety and audio sync.
3. Require approval evidence from the producer.
4. Prevent renderer and delivery from treating stale checks as approved.
5. Run tests; expect pass.
6. Commit quality control.

## Task 10: Acceptance, Build and Release Boundary

**Files**

- Modify: `README.md`
- Modify: `docs/模型配置与运行说明.md`
- Modify: `package.json`

**Steps**

1. Run `npm test`, `npm run build`, and a 40-second fixture render.
2. Run an eight-shot remix integration test with fake video generation.
3. Check the real Seedance account and authorized photos.
4. If available, generate the eight real replacement shots and complete all human QC checks.
5. If unavailable, record the blocked acceptance reason and keep release state below `1.0 deliverable`.
6. Verify desktop packaging or record that only the HTML/local-server build is available.
7. Commit final documentation and verification evidence.

## Self-Review

- Every requirement from the approved design maps to at least one task.
- Duration, routing, approval, prompt mapping, rendering, security, remix, and human QC each have an explicit test boundary.
- Real Seedance success remains an external acceptance condition rather than a test placeholder.
