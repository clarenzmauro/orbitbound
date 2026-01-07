export const wrapX = (x: number, width: number) => {
  if (width <= 0) {
    return 0;
  }
  const mod = x % width;
  return mod < 0 ? mod + width : mod;
};

export const clampY = (y: number, height: number) => {
  if (height <= 0) {
    return 0;
  }
  if (y < 0) {
    return 0;
  }
  if (y >= height) {
    return height - 1;
  }
  return y;
};

export const coordToIndex = (width: number, x: number, y: number) => y * width + x;

export const indexToCoord = (width: number, index: number) => {
  const y = Math.floor(index / width);
  const x = index % width;
  return { x, y };
};

export const manhattanDistance = (width: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.min(Math.abs(x1 - x2), width - Math.abs(x1 - x2));
  const dy = Math.abs(y1 - y2);
  return dx + dy;
};

export const isAdjacent = (width: number, x1: number, y1: number, x2: number, y2: number) =>
  manhattanDistance(width, x1, y1, x2, y2) === 1;

