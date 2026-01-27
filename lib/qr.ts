export function extractStudentIdFromText(text: string): string | null {
  if (!text) return null;

  const t = text.trim();
  if (!t) return null;

  // URLなら pathname から抽出
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t);
      const m = u.pathname.match(/\/instructor\/student\/([^/]+)/);
      return m?.[1] ? decodeURIComponent(m[1]) : null;
    } catch {
      // URLとして壊れてても下の処理へ
    }
  }

  // パスだけ
  const m = t.match(/\/instructor\/student\/([^/]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]);

  // それ以外は studentId 直入力扱い
  return t;
}