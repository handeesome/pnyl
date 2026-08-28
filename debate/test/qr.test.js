import assert from "node:assert/strict";
import test from "node:test";

import { renderQrCode } from "../public/qr.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.children = [];
    this.textContent = "";
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}

const documentRef = {
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, documentRef); }
};

test("renders the room join URL as a scannable SVG with a quiet zone", () => {
  const container = new FakeElement("div", documentRef);
  const svg = renderQrCode(container, "https://debate.ducenhan.com/join/?room=7H3K9P");
  const version = Number(svg.attributes["data-qr-version"]);
  assert.ok(version >= 1 && version <= 10);
  assert.equal(svg.attributes["data-qr-error-correction"], "M");
  assert.equal(svg.attributes.viewBox, `0 0 ${version * 4 + 17 + 8} ${version * 4 + 17 + 8}`);
  assert.equal(container.children[0], svg);
  assert.ok(svg.children.some((child) => child.tagName === "path"));
});

test("rejects an empty QR payload", () => {
  const container = new FakeElement("div", documentRef);
  assert.throws(() => renderQrCode(container, ""), TypeError);
});
