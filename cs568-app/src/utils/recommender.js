const cosineSimilarity = (a, b) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const createControlVector = (controls) => {
  return [
    controls.danceability / 100,
    controls.energy / 100,
    controls.mood / 100,
    controls.acousticness / 100,
    0.2,
    0.2,
    0.2,
    controls.tempo / 100,
  ];
};

const getReason = (track, controls, hiddenGemBonus) => {
  const reasons = [];

  if (hiddenGemBonus > 0.7) reasons.push("less mainstream");

  const danceability = track.vector[0] * 100;
  const energy = track.vector[1] * 100;
  const mood = track.vector[2] * 100;
  const acousticness = track.vector[3] * 100;

  if (Math.abs(energy - controls.energy) < 18) {
    reasons.push("matches energy");
  }

  if (Math.abs(danceability - controls.danceability) < 18) {
    reasons.push("matches danceability");
  }

  if (Math.abs(mood - controls.mood) < 18) {
    reasons.push("matches mood");
  }

  if (Math.abs(acousticness - controls.acousticness) < 18) {
    reasons.push("matches acoustic preference");
  }

  return reasons.length > 0
    ? reasons.join(", ")
    : "Balanced match between your seed song and discovery settings.";
};

export const getBaselineRecommendations = (tracks, seedTrack, limit = 5) => {
  return tracks
    .filter((track) => track.id !== seedTrack.id)
    .map((track) => {
      const relevance = cosineSimilarity(seedTrack.vector, track.vector);
      const popularityBoost = track.popularity / 100;

      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        popularity: track.popularity,
        vector: track.vector,
        relevance,
        hiddenGemScore: 1 - popularityBoost,
        score: 0.75 * relevance + 0.25 * popularityBoost,
        reason: "Similar to your seed song, with a boost for popularity.",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export const getHiddenGemRecommendations = (
  tracks,
  seedTrack,
  controls,
  limit = 5
) => {
  const discoveryWeight = controls.discovery / 100;
  const userControlVector = createControlVector(controls);

  return tracks
    .filter((track) => track.id !== seedTrack.id)
    .map((track) => {
      const relevance = cosineSimilarity(seedTrack.vector, track.vector);
      const controlMatch = cosineSimilarity(userControlVector, track.vector);
      const hiddenGemBonus = 1 - track.popularity / 100;

      const score =
        0.5 * relevance +
        0.3 * controlMatch +
        0.2 * discoveryWeight * hiddenGemBonus;

      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        popularity: track.popularity,
        vector: track.vector,
        relevance,
        hiddenGemScore: hiddenGemBonus,
        score,
        reason: getReason(track, controls, hiddenGemBonus),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};