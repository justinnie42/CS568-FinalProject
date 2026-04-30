const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeTempo = (tempo) => {
  return clamp((tempo - 60) / (180 - 60), 0, 1);
};

const normalizeSong = (song) => ({
  energy: song.energy / 100,
  danceability: song.danceability / 100,
  valence: song.valence / 100,
  tempo: normalizeTempo(song.tempo),
  popularity: song.popularity / 100,
});

const similarity = (a, b) => {
  const na = normalizeSong(a);
  const nb = normalizeSong(b);

  const distance = Math.sqrt(
    Math.pow(na.energy - nb.energy, 2) +
      Math.pow(na.danceability - nb.danceability, 2) +
      Math.pow(na.valence - nb.valence, 2) +
      Math.pow(na.tempo - nb.tempo, 2)
  );

  return 1 - distance / 2;
};

const sliderTargetMatch = (song, controls) => {
  const s = normalizeSong(song);

  const target = {
    energy: controls.energy / 100,
    danceability: controls.danceability / 100,
    valence: controls.mood / 100,
    tempo: controls.tempo / 100,
  };

  const distance = Math.sqrt(
    Math.pow(s.energy - target.energy, 2) +
      Math.pow(s.danceability - target.danceability, 2) +
      Math.pow(s.valence - target.valence, 2) +
      Math.pow(s.tempo - target.tempo, 2)
  );

  return 1 - distance / 2;
};

export const getBaselineRecommendations = (songs, seedSong, limit = 5) => {
  return songs
    .filter((song) => song.id !== seedSong.id)
    .map((song) => {
      const relevance = similarity(seedSong, song);
      const popularityBoost = song.popularity / 100;

      return {
        ...song,
        relevance,
        hiddenGemScore: 1 - popularityBoost,
        score: 0.75 * relevance + 0.25 * popularityBoost,
        reason: "Similar to your seed song and favored by popularity.",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export const getHiddenGemRecommendations = (
  songs,
  seedSong,
  controls,
  limit = 5
) => {
  const discoveryWeight = controls.discovery / 100;

  return songs
    .filter((song) => song.id !== seedSong.id)
    .map((song) => {
      const relevance = similarity(seedSong, song);
      const longTailBonus = 1 - song.popularity / 100;
      const controlMatch = sliderTargetMatch(song, controls);

      const score =
        0.5 * relevance +
        0.3 * controlMatch +
        0.2 * discoveryWeight * longTailBonus;

      return {
        ...song,
        relevance,
        hiddenGemScore: longTailBonus,
        score,
        reason: getReason(song, controls, longTailBonus),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

const getReason = (song, controls, longTailBonus) => {
  const reasons = [];

  if (longTailBonus > 0.65) reasons.push("less mainstream");
  if (Math.abs(song.energy - controls.energy) < 18) reasons.push("matches energy");
  if (Math.abs(song.danceability - controls.danceability) < 18)
    reasons.push("matches danceability");
  if (Math.abs(song.valence - controls.mood) < 18) reasons.push("matches mood");

  if (reasons.length === 0) {
    return "Balanced match between your seed song and discovery settings.";
  }

  return reasons.join(", ");
};