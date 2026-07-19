const SCORES_URL = (import.meta.env.VITE_API_URL || "").trim();

function normalizeRow(row) {
  return {
    id: String(row?.id ?? `${row?.name || "unknown"}-${row?.score || 0}`),
    name: String(row?.name || "Unknown"),
    score: Number(row?.score || 0),
  };
}

export function hasMockApiConfig() {
  return SCORES_URL.length > 0;
}

export async function fetchMockLeaderboard() {
  if (!SCORES_URL) {
    return [];
  }

  const response = await fetch(SCORES_URL);
  if (!response.ok) {
    throw new Error("MockAPI trả về lỗi khi lấy bảng xếp hạng.");
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(normalizeRow).sort((a, b) => b.score - a.score);
}

export async function submitMockScore({ name, score }) {
  if (!SCORES_URL) {
    return;
  }

  const response = await fetch(SCORES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      score,
    }),
  });

  if (!response.ok) {
    throw new Error("MockAPI trả về lỗi khi lưu điểm.");
  }
}
