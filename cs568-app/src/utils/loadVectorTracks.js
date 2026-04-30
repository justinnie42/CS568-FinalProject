export const loadTracksFromVectorFile = async () => {
  const response = await fetch("/tracks_vectors.json");

  if (!response.ok) {
    throw new Error("Could not load tracks_vectors.json");
  }

  const data = await response.json();

  // Deduplicate tracks by title + artist - keep only the first occurrence
  const seen = new Set();
  const uniqueTracks = data.tracks.filter((track) => {
    const key = `${track.title}|||${track.artist}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const removed = data.tracks.length - uniqueTracks.length;
  console.log(`Deduplicated: ${data.tracks.length} tracks → ${uniqueTracks.length} tracks (removed ${removed} duplicates)`);

  return {
    features: data.features,
    tracks: uniqueTracks.slice(0, 15000),
  };
};