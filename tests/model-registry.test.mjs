import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_CATEGORIES,
  MODEL_PROVIDERS,
  normalizeModelConfiguration,
  schemaForClient
} from "../server/model-registry.mjs";

test("模型中心暴露稳定的类别和供应商能力矩阵", () => {
  const schema = schemaForClient();
  assert.ok(schema.categories.some((item) => item.id === "video"));
  assert.ok(schema.providers.some((item) => item.id === "volcengine-ark"));
  assert.ok(schema.providers.some((item) => item.id === "pollinations"));
  assert.ok(MODEL_CATEGORIES.length >= 7);
  assert.ok(MODEL_PROVIDERS.length >= 5);
});

test("新增模型会校验类别、供应商和参数对象", () => {
  const normalized = normalizeModelConfiguration({
    category: "video",
    provider: "volcengine-ark",
    label: "Seedance 自定义",
    model: "ep-20261113-example",
    profile: "platform_cn-beijing_ark",
    enabled: true,
    isDefault: true,
    parameters: {
      resolution: "1080p",
      duration: 8,
      ratio: "16:9"
    }
  });
  assert.equal(normalized.category, "video");
  assert.equal(normalized.parameters.duration, 8);
  assert.equal(normalized.enabled, true);

  assert.throws(
    () =>
      normalizeModelConfiguration({
        category: "unknown",
        provider: "volcengine-ark",
        label: "错误",
        model: "x"
      }),
    /类别/
  );
  assert.throws(
    () =>
      normalizeModelConfiguration({
        category: "video",
        provider: "pollinations",
        label: "错误",
        model: "x"
      }),
    /不支持视频/
  );
  assert.throws(
    () =>
      normalizeModelConfiguration({
        category: "text",
        provider: "pollinations",
        label: "错误",
        model: "openai",
        parameters: "not-json"
      }),
    /参数/
  );
});

test("模型配置拒绝在前端保存凭据", () => {
  assert.throws(
    () =>
      normalizeModelConfiguration({
        category: "text",
        provider: "volcengine-ark",
        label: "危险配置",
        model: "ep-test",
        apiKey: "ark-secret"
      }),
    /API Key/
  );
});

test("Provider 字段会按能力矩阵自动收敛", () => {
  const normalized = normalizeModelConfiguration({
    category: "voice",
    provider: "windows-sapi",
    label: "本地男声",
    model: "Microsoft Kangkang",
    parameters: { rate: -2 }
  });
  assert.equal(normalized.provider, "windows-sapi");
  assert.equal(normalized.parameters.rate, -2);
  assert.equal(normalized.profile, "");
});

test("模型中心只保留已经落地的核心供应商", () => {
  assert.deepEqual(
    MODEL_PROVIDERS.map((provider) => provider.id).sort(),
    ["ffmpeg", "pollinations", "volcengine-ark", "windows-sapi", "xying-original"]
  );
});
