const ALLOWED_COUNTS = Object.freeze([12, 24, 36, 48]);

export function normalizeBatchCount(value) {
  const number = Number(value);
  return ALLOWED_COUNTS.includes(number) ? number : 24;
}

export function buildImageBatchPlan({
  projectId,
  shotIds,
  versionsPerShot = 3,
  totalCount = 24
}) {
  const shots = [...new Set((Array.isArray(shotIds) ? shotIds : []).filter(Boolean))];
  if (!shots.length) throw new Error("批量生图至少需要一个镜头");
  const count = normalizeBatchCount(totalCount);
  const base = Math.floor(count / shots.length);
  const remainder = count % shots.length;
  const requestedVersions = Math.max(1, Math.round(Number(versionsPerShot) || 1));
  return {
    projectId: String(projectId || ""),
    totalCount: count,
    requestedVersions,
    items: shots.map((shotId, index) => ({
      shotId: String(shotId),
      count: base + (index < remainder ? 1 : 0),
      requestedVersions
    }))
  };
}

export function assertBatchConfirmed(confirmed, estimate) {
  if (confirmed !== true) throw new Error("批量生图必须由用户明确确认");
  if (!estimate?.modelId) throw new Error("批量生图缺少图片模型");
  if (estimate.requiresQuote) {
    throw new Error("当前模型未配置单价，请先完成报价确认");
  }
  return true;
}

export function findIdempotentJob(jobs, key) {
  if (!key) return null;
  return (
    (Array.isArray(jobs) ? jobs : []).find(
      (job) => job.input?.idempotencyKey === key
    ) || null
  );
}
