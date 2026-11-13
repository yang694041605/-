import { createReviewState, secondsToFrames } from "./production-model.mjs";

const TARGETS = new Set([
  "left",
  "right",
  "person-1",
  "person-2",
  "person-3",
  "person-4"
]);

function normalizedAssetId(value, label, required = false) {
  const text = String(value || "").trim();
  if (!text) {
    if (required) throw new Error(`${label}缺少资产 ID`);
    return "";
  }
  if (
    /^[a-zA-Z]:[\\/]/.test(text) ||
    text.startsWith("/") ||
    text.startsWith("\\") ||
    text.includes("..")
  ) {
    throw new Error(`${label}只能引用资产 ID`);
  }
  if (!/^asset-[a-z0-9-]+$/i.test(text)) {
    throw new Error(`${label}不是有效资产 ID`);
  }
  return text;
}

function normalizedTarget(value, label) {
  const target = String(value || "").trim();
  if (!TARGETS.has(target)) throw new Error(`${label}替换目标无效`);
  return target;
}

function parseAspect(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return width / height;
}

export function normalizeReplacementMap(input = {}) {
  const groomTarget = normalizedTarget(input.groom?.target, "男主角");
  const brideTarget = normalizedTarget(input.bride?.target, "女主角");
  if (groomTarget === brideTarget) {
    throw new Error("男女主替换目标不能相同");
  }
  return {
    groom: {
      target: groomTarget,
      sourceAssetId: normalizedAssetId(
        input.groom?.sourceAssetId,
        "男主角身份参考",
        true
      )
    },
    bride: {
      target: brideTarget,
      sourceAssetId: normalizedAssetId(
        input.bride?.sourceAssetId,
        "女主角身份参考",
        true
      )
    },
    props: (Array.isArray(input.props) ? input.props : []).map((item) => ({
      target: String(item.target || "").trim(),
      sourceAssetId: normalizedAssetId(
        item.sourceAssetId,
        "道具参考",
        false
      ),
      description: String(item.description || "").trim().slice(0, 200)
    }))
  };
}

export function validateReplacementClip({
  shot,
  asset,
  mapping,
  aspect = ""
}) {
  if (!shot) throw new Error("缺少目标镜头");
  if (!asset?.id) throw new Error("缺少导入视频资产");
  normalizeReplacementMap(mapping);
  const expectedDuration = Number(
    shot.duration ||
      (shot.frames ? Number(shot.frames) / 24 : 0)
  );
  const actualDuration = Number(asset.media?.duration || 0);
  if (!actualDuration || Math.abs(actualDuration - expectedDuration) > 0.25) {
    throw new Error(
      `导入视频时长 ${actualDuration.toFixed(2)} 秒与镜头 ${expectedDuration.toFixed(2)} 秒不匹配`
    );
  }
  const video = asset.media?.video;
  if (!video?.width || !video?.height) {
    throw new Error("导入文件没有可识别的视频轨道或画幅");
  }
  const expectedAspect = parseAspect(shot.aspect || aspect || "16:9");
  const actualAspect = Number(video.width) / Number(video.height);
  if (expectedAspect && Math.abs(actualAspect - expectedAspect) > 0.03) {
    throw new Error(
      `导入视频画幅 ${video.width}×${video.height} 与镜头画幅 ${shot.aspect || aspect || "16:9"} 不匹配`
    );
  }
  return {
    ok: true,
    shotFrames: Number(
      shot.frames || secondsToFrames(expectedDuration, 24)
    )
  };
}

export function bindImportedVideo(shot, asset, mapping = {}) {
  const normalizedMapping = normalizeReplacementMap(mapping);
  const binding = {
    assetId: asset.id,
    hash: asset.contentHash || ""
  };
  return {
    ...shot,
    characters: {
      groom: {
        target: normalizedMapping.groom.target,
        referenceAssetId: normalizedMapping.groom.sourceAssetId
      },
      bride: {
        target: normalizedMapping.bride.target,
        referenceAssetId: normalizedMapping.bride.sourceAssetId
      }
    },
    replacement: {
      props: normalizedMapping.props,
      backgroundPolicy: shot.replacement?.backgroundPolicy || "keep"
    },
    assets: {
      ...(shot.assets || {}),
      video: binding,
      finalClip: binding
    },
    review: createReviewState(),
    status: "video_ready"
  };
}
