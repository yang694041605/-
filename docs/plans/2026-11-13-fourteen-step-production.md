# Fourteen-Step Production Implementation Plan

## Goal

Implement all 14 story-mode production workstations with real inputs, prompt builders, image/video binding, audio mixing, subtitle preview, delivery packaging and version-bound release gates.

## Architecture

- `src/workflow-specs.mjs` defines the 14-step contract.
- `src/prompt-library.mjs` builds image and video prompts from shot data.
- `src/app.js` renders shared operation panels and step-specific controls.
- `server/post-production.mjs` renders audio mix, preview and delivery artifacts.
- Existing production timeline, hashing and approval APIs remain authoritative.

## Global Constraints

- Simplified Chinese UI.
- 24 FPS.
- 40 seconds and 960 frames by default.
- Every shot binds template interval, prompting versions, first frame, video, final clip and review.
- No API keys or tokens in UI or database.
- Technical QC and human approval are separate.
- Model failure never creates fake output.

## Task 1: Workflow Contract

**Files**

- Create: `src/workflow-specs.mjs`
- Create: `tests/workflow-specs.test.mjs`

**Steps**

1. Write tests asserting 14 unique steps, required inputs, actions and output names.
2. Run `node --test tests/workflow-specs.test.mjs`; expect module-not-found failure.
3. Implement immutable step definitions and `getWorkflowStep(number)`.
4. Run tests; expect pass.
5. Commit.

## Task 2: Prompt Library

**Files**

- Create: `src/prompt-library.mjs`
- Create: `tests/prompt-library.test.mjs`

**Steps**

1. Write tests asserting image prompts contain identity, era, costume, scene, light, framing, action instant, continuity and negatives; video prompts contain first frame, start, action, end, camera, cut, sound and negatives.
2. Run tests; expect module-not-found failure.
3. Implement `buildImagePrompt(shot, project)` and `buildVideoPrompt(shot, project, policy)`.
4. Run tests; expect pass.
5. Commit.

## Task 3: Shared Step Workspace

**Files**

- Modify: `src/app.js`
- Modify: `src/styles.css`

**Steps**

1. Add tests to `tests/workflow-specs.test.mjs` for artifact-gap messages.
2. Add `workflowStepWorkspace(number, extras)` with goal, inputs, actions, output and gate sections.
3. Use it in all 14 page templates.
4. Add responsive styles and ensure all text remains at least 14px.
5. Run build; expect success.
6. Commit.

## Task 4: Step-Specific Preview and Image Binding

**Files**

- Modify: `src/app.js`
- Modify: `server/index.mjs`
- Create: `tests/step-pages.test.mjs`

**Steps**

1. Write tests for shot image prompt generation and first-frame binding validation.
2. Add selected-shot image prompt textarea and selector in steps 7 and 8.
3. Add actions `build-image-prompt`, `bind-shot-image`, `generate-shot-image`, `approve-shot-image`.
4. Bind generated or uploaded image assets to shot `assets.firstFrame`.
5. Require every shot to have an approved image before step 9.
6. Run tests; expect pass.
7. Commit.

## Task 5: Video Prompt and Per-Shot QC

**Files**

- Modify: `src/app.js`
- Modify: `server/index.mjs`

**Steps**

1. Use `buildVideoPrompt` in step 9.
2. Show prompt version, first-frame version and generated-video versions together.
3. Save prompt text through the shot API before video submission.
4. Keep eight-item QC and single-shot retry.
5. Run tests and build.
6. Commit.

## Task 6: Audio Selection and Mix

**Files**

- Create: `server/post-production.mjs`
- Create: `tests/post-production.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`
- Modify: `src/app.js`

**Steps**

1. Write failing tests for a 10-second sample mix, 40-second full mix, loudness metadata and separate stems.
2. Implement `renderMixSample`, `renderFullMix` and `inspectAudioMix`.
3. Add `/api/projects/:id/mix/sample` and `/api/projects/:id/mix/full`.
4. Replace steps 11 and 12 placeholders with actual sample/full mix controls and audio previews.
5. Save selected voice/music asset IDs and mix artifact IDs.
6. Run tests; expect pass.
7. Commit.

## Task 7: Subtitle Editing and Preview

**Files**

- Modify: `server/index.mjs`
- Modify: `server/media.mjs`
- Modify: `src/app.js`
- Create: `tests/subtitle-preview.test.mjs`

**Steps**

1. Write tests for CJK line splitting, safe-area style validation and preview timeline.
2. Add subtitle style to project data.
3. Add editable cue list and font-size/color/outline/margin controls.
4. Pass subtitle style into FFmpeg.
5. Add `/api/projects/:id/preview` to render the current approved timeline.
6. Require full preview before step 14.
7. Run tests; expect pass.
8. Commit.

## Task 8: Delivery Package

**Files**

- Create: `server/delivery.mjs`
- Create: `tests/delivery.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api.js`
- Modify: `src/app.js`

**Steps**

1. Write tests for manifest contents, SHA-256 hashes and missing-artifact rejection.
2. Implement `createDeliveryPackage` using a dedicated delivery folder.
3. Include final MP4, SRT, edit project, shot plan, prompt history, QC report and rights checklist.
4. Add `/api/projects/:id/delivery`.
5. Replace step 14 cards with actual package generation and file links.
6. Run tests; expect pass.
7. Commit.

## Task 9: Full Integration

**Files**

- Create: `tests/complete-workflow.test.mjs`
- Modify: `README.md`

**Steps**

1. Build an isolated project with generated fixture assets.
2. Run all 14 server readiness checks in order.
3. Render a 40-second 960-frame preview and delivery package.
4. Assert final media, SRT and manifest.
5. Run `npm test`.
6. Run `npm run build`.
7. Commit.

## Task 10: Release Verification

**Files**

- Modify: `docs/1.0本地生产验收报告.md`

**Steps**

1. Verify all 14 routes load.
2. Verify 50+ tests and build.
3. Run the real project with configured models where available.
4. Record unavailable image/video models with the exact provider reason.
5. Verify local manual fallback produces the same artifact contracts.
6. Commit and push.

## Self-Review

- Every requested page has inputs, actions, outputs and a gate.
- Image and video prompts are separate and versioned.
- Steps 10-14 produce real audio, preview and delivery artifacts.
- Model unavailability does not break the workflow or create fake success.
