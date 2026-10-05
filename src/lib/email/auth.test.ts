import { test } from "node:test";
import assert from "node:assert/strict";
import { basicOk, bearerOk, safeEqual } from "./auth.ts";

const basic = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
test("safeEqual compares any lengths without throwing", () => { assert.equal(safeEqual("a", "a"), true); assert.equal(safeEqual("a", "ab"), false); assert.equal(safeEqual("", ""), true); });
test("bearer: exact secret only; fails closed when unset or short", () => {
  const S = "0123456789abcdef-secret";
  assert.equal(bearerOk(`Bearer ${S}`, S), true);
  for (const h of [null, undefined, "", S, `bearer ${S}`, `Bearer ${S}x`, `Bearer x${S}`, "Bearer ", "Basic abc"]) assert.equal(bearerOk(h, S), false, String(h));
  assert.equal(bearerOk("Bearer ", ""), false); assert.equal(bearerOk("Bearer short", "short"), false); assert.equal(bearerOk("Bearer x", undefined), false);
});
test("basic: user and password both exact; passwords may contain colons; fails closed when unset or weak", () => {
  assert.equal(basicOk(basic("pm", "long-enough-pass"), "pm", "long-enough-pass"), true);
  assert.equal(basicOk(basic("pm", "pa:ss:word-long"), "pm", "pa:ss:word-long"), true);
  for (const h of [null, "", basic("PM", "long-enough-pass"), basic("pm", "long-enough-pas"), basic("pm", ""), "Basic !!!", "Basic " + Buffer.from("nocolon").toString("base64"), "Bearer x"]) assert.equal(basicOk(h, "pm", "long-enough-pass"), false, String(h));
  assert.equal(basicOk(basic("pm", "long-enough-pass"), undefined, "long-enough-pass"), false);
  assert.equal(basicOk(basic("pm", "long-enough-pass"), "pm", undefined), false);
  assert.equal(basicOk(basic("pm", "short"), "pm", "short"), false);
});
