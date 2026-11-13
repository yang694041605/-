export function estimateGeneration({
  category,
  model,
  count,
  unitCost = null,
  currency = "CNY"
}) {
  const normalizedCount = Math.max(1, Math.round(Number(count) || 1));
  const numericUnitCost = Number(unitCost);
  const normalizedUnitCost =
    unitCost == null || !Number.isFinite(numericUnitCost)
      ? null
      : Math.max(0, numericUnitCost);
  const totalCost =
    normalizedUnitCost == null
      ? null
      : Number((normalizedUnitCost * normalizedCount).toFixed(4));

  return {
    category,
    modelId: model?.id || "",
    modelLabel: model?.label || "未选择模型",
    count: normalizedCount,
    unitCost: normalizedUnitCost,
    totalCost,
    currency,
    requiresQuote: totalCost == null,
    confirmationText:
      totalCost == null
        ? `即将使用 ${model?.label || "未选择模型"} 生成 ${normalizedCount} 张图片，当前未配置单价，请先确认报价`
        : `即将使用 ${model?.label || "未选择模型"} 生成 ${normalizedCount} 张图片，预计 ${totalCost} ${currency}`
  };
}
