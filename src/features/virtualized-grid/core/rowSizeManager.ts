/**
 * Fenwick tree (Binary Indexed Tree) for O(log n) cumulative height queries.
 * Enables fast scrollTop → row index lookups and totalHeight calculations.
 */
export class RowSizeManager {
  private readonly tree: number[];
  private readonly sizes: number[];
  private readonly defaultSize: number;
  private _count: number;

  constructor(count: number, defaultSize = 48) {
    this._count = count;
    this.defaultSize = defaultSize;
    this.sizes = new Array<number>(count).fill(defaultSize);
    this.tree = new Array<number>(count + 1).fill(0);
    // Build tree
    for (let i = 0; i < count; i++) {
      this.updateTree(i + 1, defaultSize);
    }
  }

  get count(): number {
    return this._count;
  }

  setSize(index: number, height: number): void {
    if (index < 0 || index >= this._count) return;
    const delta = height - (this.sizes[index] ?? this.defaultSize);
    if (delta === 0) return;
    this.sizes[index] = height;
    this.updateTree(index + 1, delta);
  }

  getSize(index: number): number {
    return this.sizes[index] ?? this.defaultSize;
  }

  /** Cumulative height from row 0 up to (not including) `index`. */
  getOffset(index: number): number {
    if (index <= 0) return 0;
    return this.prefixSum(Math.min(index, this._count));
  }

  totalHeight(): number {
    return this.prefixSum(this._count);
  }

  /** Find the row index for a given scrollTop using binary search over prefix sums. */
  findIndex(scrollTop: number): number {
    if (scrollTop <= 0) return 0;
    // Walk the Fenwick tree in O(log n)
    let idx = 0;
    let remaining = scrollTop;
    let bitMask = this.highestBit(this._count);
    while (bitMask > 0) {
      const next = idx + bitMask;
      if (next <= this._count && (this.tree[next] ?? 0) <= remaining) {
        remaining -= this.tree[next] ?? 0;
        idx = next;
      }
      bitMask >>= 1;
    }
    return Math.min(idx, this._count - 1);
  }

  resize(newCount: number): void {
    const old = this._count;
    this._count = newCount;
    if (newCount > old) {
      this.sizes.length = newCount;
      for (let i = old; i < newCount; i++) {
        this.sizes[i] = this.defaultSize;
      }
      // Rebuild the Fenwick tree from scratch. An incremental approach would
      // corrupt shared higher-level nodes that span both existing and new rows
      // (e.g. tree[8] covers rows 0-7 and must incorporate all of them). A
      // full rebuild is O(n log n) but always correct.
      this.tree.length = newCount + 1;
      this.tree.fill(0);
      for (let i = 0; i < newCount; i++) {
        this.updateTree(i + 1, this.sizes[i] ?? this.defaultSize);
      }
    } else {
      this.sizes.length = newCount;
      this.tree.length = newCount + 1;
    }
  }

  private updateTree(i: number, delta: number): void {
    for (; i <= this._count; i += i & -i) {
      this.tree[i] = (this.tree[i] ?? 0) + delta;
    }
  }

  private prefixSum(i: number): number {
    let sum = 0;
    for (let j = i; j > 0; j -= j & -j) {
      sum += this.tree[j] ?? 0;
    }
    return sum;
  }

  private highestBit(n: number): number {
    let bit = 1;
    while (bit <= n) bit <<= 1;
    return bit >> 1;
  }
}
