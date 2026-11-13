import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSubtitleStyle,
  toAssColor
} from "../server/media.mjs";

test("字幕样式会限制字号、描边、边距并转换 ASS 颜色", () => {
  const style = normalizeSubtitleStyle({
    font: "KaiTi",
    fontSize: 88,
    color: "#FFCC00",
    outlineColor: "#101010",
    outline: -2,
    margin: 4
  });
  assert.equal(style.fontSize, 72);
  assert.equal(style.outline, 0);
  assert.equal(style.margin, 10);
  assert.equal(toAssColor("#FFCC00"), "&H0000CCFF");
});

test("非法字幕颜色回退为安全默认值", () => {
  const style = normalizeSubtitleStyle({
    font: "Microsoft YaHei",
    color: "red",
    outlineColor: ""
  });
  assert.equal(style.color, "#FFFFFF");
  assert.equal(style.outlineColor, "#101010");
});
