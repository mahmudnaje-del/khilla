export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/**
 * Simple word-level diff calculation between original text and cleaned text
 */
export function computeWordDiff(original: string, modified: string): DiffPart[] {
  if (!original && !modified) return [];
  if (!original) return [{ value: modified, added: true }];
  if (!modified) return [{ value: original, removed: true }];

  // Tokenize by words and punctuation
  const tokenize = (text: string) => {
    return text.match(/[\w\u0600-\u06FF]+|[^\s\w\u0600-\u06FF]|\s+/g) || [];
  };

  const origTokens = tokenize(original);
  const modTokens = tokenize(modified);

  const n = origTokens.length;
  const m = modTokens.length;

  // Compute LCS (Longest Common Subsequence) table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (origTokens[i] === modTokens[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff parts
  const result: DiffPart[] = [];
  let i = n;
  let j = m;

  const stack: DiffPart[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === modTokens[j - 1]) {
      stack.push({ value: origTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ value: modTokens[j - 1], added: true });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      stack.push({ value: origTokens[i - 1], removed: true });
      i--;
    }
  }

  // Reverse stack to get normal order
  while (stack.length > 0) {
    const item = stack.pop()!;
    // Consolidate consecutive items of same type
    const last = result[result.length - 1];
    if (last && last.added === item.added && last.removed === item.removed) {
      last.value += item.value;
    } else {
      result.push(item);
    }
  }

  return result;
}
