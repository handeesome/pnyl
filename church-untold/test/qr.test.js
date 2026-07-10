import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { renderQrCode } from "../public/assets/js/qr.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.children = [];
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }
}

const documentRef = {
  createElementNS(_namespace, tagName) {
    return new FakeElement(tagName, documentRef);
  },
};

function render(text) {
  const container = new FakeElement("div", documentRef);
  return renderQrCode(container, text);
}

function matrixHash(svg) {
  const version = Number(svg.attributes["data-qr-version"]);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const path = svg.children.find((child) => child.tagName === "path");

  for (const match of path.attributes.d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    modules[Number(match[2]) - 4][Number(match[1]) - 4] = true;
  }

  const bits = modules.flat().map(Number).join("");
  return createHash("sha256").update(bits).digest("hex");
}

test("matches independently generated QR Model 2 matrices", () => {
  const cases = [
    {
      text: "https://church-untold.example.workers.dev/answer",
      version: 4,
      mask: 2,
      hash: "6dfe6787a92eea48701c1642e853fef9b47b561371bb4a0341ff4db9d71c7cdb",
    },
    {
      text: "https://example.com/answer?event=团契测试",
      version: 4,
      mask: 6,
      hash: "e28078c626d8bf1550fa08711c0fcfa68414e8280b209e65c6d9b5c1a2854736",
    },
    {
      text: "a".repeat(213),
      version: 10,
      mask: 1,
      hash: "c463831103cf25880110fdd05d58e239d21cef2d6d0d84807dbdcf713df2784d",
    },
  ];

  for (const expected of cases) {
    const svg = render(expected.text);
    assert.equal(Number(svg.attributes["data-qr-version"]), expected.version);
    assert.equal(Number(svg.attributes["data-qr-mask"]), expected.mask);
    assert.equal(svg.attributes["data-qr-error-correction"], "M");
    assert.equal(matrixHash(svg), expected.hash);
  }
});

test("includes a four-module quiet zone in its SVG viewBox", () => {
  const svg = render("https://example.com/answer");
  const version = Number(svg.attributes["data-qr-version"]);
  const expectedSize = version * 4 + 17 + 8;
  assert.equal(svg.attributes.viewBox, `0 0 ${expectedSize} ${expectedSize}`);
});

test("rejects invalid containers, empty strings, and oversized payloads", () => {
  assert.throws(() => renderQrCode(null, "https://example.com"), TypeError);
  assert.throws(() => render(""), TypeError);
  assert.throws(() => render("a".repeat(214)), RangeError);
});
