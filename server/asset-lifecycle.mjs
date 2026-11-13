const REFERENCE_LABELS = {
  project: "项目",
  template: "模板",
  look: "造型",
  job: "任务"
};

function referenceLabel(type, item) {
  const prefix = REFERENCE_LABELS[type] || "记录";
  const name =
    item?.name ||
    item?.title ||
    item?.label ||
    item?.kind ||
    item?.id ||
    "未命名";
  return `${prefix}“${name}”`;
}

function recordContainsAsset(record, asset) {
  if (!record || record.id === asset.id) return false;
  const serialized = JSON.stringify(record);
  return [asset.id, asset.url, asset.previewUrl, asset.localPath]
    .filter(Boolean)
    .some((value) => serialized.includes(value));
}

export function findAssetReferences(asset, recordGroups = []) {
  const references = [];
  const seen = new Set();
  for (const group of recordGroups) {
    for (const item of group.items || []) {
      if (!recordContainsAsset(item, asset)) continue;
      const label = referenceLabel(group.type, item);
      if (seen.has(label)) continue;
      seen.add(label);
      references.push(label);
    }
  }
  return references;
}

const VISUAL_ASSET_KINDS = new Set([
  "image",
  "batch-image",
  "look-image",
  "photo",
  "project-photo",
  "story-card",
  "outfit-reference",
  "scene-reference",
  "video",
  "template-clip",
  "preview",
  "export"
]);

export function isVisualAsset(asset) {
  return Boolean(asset && VISUAL_ASSET_KINDS.has(asset.kind));
}
