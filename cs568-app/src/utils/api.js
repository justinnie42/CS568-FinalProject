const API_BASE = "/api";

export const fetchTracks = async () => {
  const response = await fetch(`${API_BASE}/tracks`);

  if (!response.ok) {
    throw new Error("Could not load tracks from backend");
  }

  return response.json();
};

export const fetchRecommendations = async ({ seedTrackId, controls, limit = 5 }) => {
  const response = await fetch(`${API_BASE}/recommendations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      seedTrackId,
      controls,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not load recommendations from backend");
  }

  return response.json();
};
