const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const QUIET_ZONE_MODULES = 4;

// QR Model 2, error-correction level M. Each tuple is:
// [number of blocks, total codewords per block, data codewords per block].
// Supporting versions 1-10 keeps the encoder small while covering normal URLs
// up to 213 UTF-8 bytes.
const MEDIUM_RS_BLOCKS = [
  null,
  [[1, 26, 16]],
  [[1, 44, 28]],
  [[1, 70, 44]],
  [[2, 50, 32]],
  [[2, 67, 43]],
  [[4, 43, 27]],
  [[4, 49, 31]],
  [[2, 60, 38], [2, 61, 39]],
  [[3, 58, 36], [2, 59, 37]],
  [[4, 69, 43], [1, 70, 44]],
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

let fieldValue = 1;
for (let exponent = 0; exponent < 255; exponent += 1) {
  GF_EXP[exponent] = fieldValue;
  GF_LOG[fieldValue] = exponent;
  fieldValue <<= 1;
  if (fieldValue & 0x100) fieldValue ^= 0x11d;
}
for (let exponent = 255; exponent < GF_EXP.length; exponent += 1) {
  GF_EXP[exponent] = GF_EXP[exponent - 255];
}

function multiplyInField(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function appendBits(target, value, length) {
  for (let bit = length - 1; bit >= 0; bit -= 1) {
    target.push((value >>> bit) & 1);
  }
}

function expandBlocks(version) {
  const blocks = [];
  for (const [count, totalCount, dataCount] of MEDIUM_RS_BLOCKS[version]) {
    for (let index = 0; index < count; index += 1) {
      blocks.push({ totalCount, dataCount });
    }
  }
  return blocks;
}

function chooseVersion(byteLength) {
  for (let version = 1; version < MEDIUM_RS_BLOCKS.length; version += 1) {
    const dataCodewords = expandBlocks(version)
      .reduce((sum, block) => sum + block.dataCount, 0);
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCodewords * 8) return version;
  }

  throw new RangeError(
    "二维码内容过长：当前本地编码器最多支持 213 个 UTF-8 字节。",
  );
}

function makeDataCodewords(bytes, version, dataCapacity) {
  const bits = [];
  appendBits(bits, 0b0100, 4); // Byte mode.
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacityBits = dataCapacity * 8;
  for (let index = 0; index < Math.min(4, capacityBits - bits.length); index += 1) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value << 1) | bits[offset + bit];
    }
    codewords.push(value);
  }

  const pads = [0xec, 0x11];
  while (codewords.length < dataCapacity) {
    codewords.push(pads[(codewords.length - Math.ceil(bits.length / 8)) % 2]);
  }
  return codewords;
}

function makeGeneratorPolynomial(degree) {
  let polynomial = [1];
  for (let exponent = 0; exponent < degree; exponent += 1) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= multiplyInField(polynomial[index], GF_EXP[exponent]);
    }
    polynomial = next;
  }
  return polynomial;
}

function makeErrorCorrectionCodewords(data, degree) {
  const generator = makeGeneratorPolynomial(degree);
  const remainder = [...data, ...new Array(degree).fill(0)];

  for (let offset = 0; offset < data.length; offset += 1) {
    const factor = remainder[offset];
    if (factor === 0) continue;
    for (let index = 0; index < generator.length; index += 1) {
      remainder[offset + index] ^=
        multiplyInField(generator[index], factor);
    }
  }
  return remainder.slice(data.length);
}

function makeCodewords(bytes, version) {
  const blocks = expandBlocks(version);
  const dataCapacity = blocks.reduce((sum, block) => sum + block.dataCount, 0);
  const data = makeDataCodewords(bytes, version, dataCapacity);
  const dataBlocks = [];
  const errorBlocks = [];
  let offset = 0;

  for (const block of blocks) {
    const blockData = data.slice(offset, offset + block.dataCount);
    dataBlocks.push(blockData);
    errorBlocks.push(
      makeErrorCorrectionCodewords(blockData, block.totalCount - block.dataCount),
    );
    offset += block.dataCount;
  }

  const result = [];
  const longestDataBlock = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < longestDataBlock; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) result.push(block[index]);
    }
  }

  const errorLength = errorBlocks[0].length;
  for (let index = 0; index < errorLength; index += 1) {
    for (const block of errorBlocks) result.push(block[index]);
  }
  return result;
}

function setFunctionModule(modules, functionModules, x, y, dark) {
  modules[y][x] = dark;
  functionModules[y][x] = true;
}

function drawFinderPattern(modules, functionModules, centerX, centerY) {
  const size = modules.length;
  for (let deltaY = -4; deltaY <= 4; deltaY += 1) {
    for (let deltaX = -4; deltaX <= 4; deltaX += 1) {
      const x = centerX + deltaX;
      const y = centerY + deltaY;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      setFunctionModule(
        modules,
        functionModules,
        x,
        y,
        distance !== 2 && distance !== 4,
      );
    }
  }
}

function alignmentPatternPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let position = size - 7; positions.length < count; position -= step) {
    positions.splice(1, 0, position);
  }
  return positions;
}

function drawAlignmentPattern(modules, functionModules, centerX, centerY) {
  for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
    for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      setFunctionModule(
        modules,
        functionModules,
        centerX + deltaX,
        centerY + deltaY,
        distance !== 1,
      );
    }
  }
}

function formatBits(mask) {
  // Error-correction level M has a two-bit format value of 00.
  const data = mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormatBits(modules, functionModules, mask, reserve) {
  const size = modules.length;
  const bits = formatBits(mask);
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    if (reserve) functionModules[y][x] = true;
  };
  const bit = (index) => ((bits >>> index) & 1) !== 0;

  for (let index = 0; index <= 5; index += 1) set(8, index, bit(index));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) {
    set(14 - index, 8, bit(index));
  }

  for (let index = 0; index < 8; index += 1) {
    set(size - 1 - index, 8, bit(index));
  }
  for (let index = 8; index < 15; index += 1) {
    set(8, size - 15 + index, bit(index));
  }
  set(8, size - 8, true);
}

function drawVersionBits(modules, functionModules, version) {
  if (version < 7) return;
  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;

  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) !== 0;
    const x = modules.length - 11 + (index % 3);
    const y = Math.floor(index / 3);
    setFunctionModule(modules, functionModules, x, y, dark);
    setFunctionModule(modules, functionModules, y, x, dark);
  }
}

function drawFunctionPatterns(modules, functionModules, version) {
  const size = modules.length;
  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, size - 4, 3);
  drawFinderPattern(modules, functionModules, 3, size - 4);

  const positions = alignmentPatternPositions(version, size);
  for (const y of positions) {
    for (const x of positions) {
      if (!functionModules[y][x]) {
        drawAlignmentPattern(modules, functionModules, x, y);
      }
    }
  }

  // Alignment patterns take precedence where they cross the timing lines.
  for (let index = 0; index < size; index += 1) {
    if (!functionModules[index][6]) {
      setFunctionModule(modules, functionModules, 6, index, index % 2 === 0);
    }
    if (!functionModules[6][index]) {
      setFunctionModule(modules, functionModules, index, 6, index % 2 === 0);
    }
  }

  drawFormatBits(modules, functionModules, 0, true);
  drawVersionBits(modules, functionModules, version);
}

function placeCodewords(modules, functionModules, codewords) {
  const size = modules.length;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functionModules[y][x]) continue;
        const byte = codewords[bitIndex >>> 3];
        modules[y][x] = byte === undefined
          ? false
          : ((byte >>> (7 - (bitIndex & 7))) & 1) !== 0;
        bitIndex += 1;
      }
    }
  }
}

function isMaskDark(mask, x, y) {
  const product = x * y;
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (product % 2) + (product % 3) === 0;
    case 6: return ((product % 2) + (product % 3)) % 2 === 0;
    case 7: return ((x + y) % 2 + (product % 3)) % 2 === 0;
    default: throw new RangeError("未知的二维码掩码。");
  }
}

function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;

  const scoreLine = (line) => {
    let lineScore = 0;
    let runLength = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) {
        runLength += 1;
      } else {
        if (runLength >= 5) lineScore += runLength - 2;
        runLength = 1;
      }
    }
    if (runLength >= 5) lineScore += runLength - 2;

    const finderA = "10111010000";
    const finderB = "00001011101";
    const binary = line.map((dark) => (dark ? "1" : "0")).join("");
    for (let index = 0; index <= binary.length - 11; index += 1) {
      const section = binary.slice(index, index + 11);
      if (section === finderA || section === finderB) lineScore += 40;
    }
    return lineScore;
  };

  for (let index = 0; index < size; index += 1) {
    score += scoreLine(modules[index]);
    score += scoreLine(modules.map((row) => row[index]));
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (
        modules[y][x + 1] === color
        && modules[y + 1][x] === color
        && modules[y + 1][x + 1] === color
      ) {
        score += 3;
      }
    }
  }

  const darkCount = modules.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0,
  );
  const totalCount = size * size;
  score += Math.floor(Math.abs(darkCount * 20 - totalCount * 10) / totalCount) * 10;
  return score;
}

function makeMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const codewords = makeCodewords(bytes, version);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const functionModules = Array.from(
    { length: size },
    () => new Array(size).fill(false),
  );

  drawFunctionPatterns(modules, functionModules, version);
  placeCodewords(modules, functionModules, codewords);

  let best = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => [...row]);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!functionModules[y][x] && isMaskDark(mask, x, y)) {
          candidate[y][x] = !candidate[y][x];
        }
      }
    }
    drawFormatBits(candidate, functionModules, mask, false);
    const score = penaltyScore(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      bestMask = mask;
    }
  }

  return { modules: best, version, mask: bestMask };
}

function setAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
}

/**
 * Render a dependency-free QR code into a host-page container.
 *
 * @param {Element} container Element whose contents should be replaced.
 * @param {string} text URL or other short UTF-8 text to encode.
 * @returns {SVGElement} The generated SVG element.
 */
export function renderQrCode(container, text) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("renderQrCode 需要一个有效的容器元素。");
  }
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("二维码内容必须是非空字符串。");
  }

  const { modules, version, mask } = makeMatrix(text);
  const size = modules.length;
  const viewSize = size + QUIET_ZONE_MODULES * 2;
  const documentRef = container.ownerDocument || document;
  const svg = documentRef.createElementNS(SVG_NAMESPACE, "svg");
  setAttributes(svg, {
    class: "qr-code",
    viewBox: `0 0 ${viewSize} ${viewSize}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "扫码打开答题页",
    "data-qr-version": version,
    "data-qr-error-correction": "M",
    "data-qr-mask": mask,
  });

  const title = documentRef.createElementNS(SVG_NAMESPACE, "title");
  title.textContent = "扫码打开答题页";
  svg.append(title);

  const background = documentRef.createElementNS(SVG_NAMESPACE, "rect");
  setAttributes(background, {
    x: 0,
    y: 0,
    width: viewSize,
    height: viewSize,
    fill: "#ffffff",
  });
  svg.append(background);

  const commands = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) {
        commands.push(
          `M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`,
        );
      }
    }
  }

  const path = documentRef.createElementNS(SVG_NAMESPACE, "path");
  setAttributes(path, {
    d: commands.join(""),
    fill: "#000000",
    "shape-rendering": "crispEdges",
  });
  svg.append(path);
  container.replaceChildren(svg);
  return svg;
}
