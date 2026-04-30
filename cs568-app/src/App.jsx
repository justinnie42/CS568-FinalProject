import { useEffect, useMemo, useState } from "react";
import { loadTracksFromVectorFile } from "./utils/loadVectorTracks";
import {
  getBaselineRecommendations,
  getHiddenGemRecommendations,
} from "./utils/recommender";

const ratingQuestions = [
  { key: "taste", label: "The songs match my taste." },
  { key: "listen", label: "I would consider listening to these songs." },
  { key: "discovery", label: "This list helped me discover new music." },
  { key: "diverse", label: "The songs felt diverse." },
  { key: "random", label: "The songs felt too random." },
];

function App() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [seedId, setSeedId] = useState("");
  const [seedSearch, setSeedSearch] = useState("");

  const [controls, setControls] = useState({
    discovery: 60,
    energy: 60,
    danceability: 60,
    mood: 55,
    acousticness: 40,
    tempo: 50,
  });

  const [ratings, setRatings] = useState({
    baseline: {},
    hiddenGems: {},
    control: "",
    preference: "",
    notes: "",
  });

  const [savedCount, setSavedCount] = useState(
    Number(localStorage.getItem("studyResponseCount") || 0)
  );

  useEffect(() => {
    loadTracksFromVectorFile()
      .then(({ tracks }) => {
        setTracks(tracks);
        setSeedId(tracks[0]?.id || "");
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(
          "Could not load tracks_vectors.json. Make sure it is inside the public folder."
        );
        setLoading(false);
      });
  }, []);

  const seedTrack = useMemo(() => {
    return tracks.find((track) => track.id === seedId) || tracks[0];
  }, [tracks, seedId]);

  // Reset ratings when switching songs
  useEffect(() => {
    setRatings({
      baseline: {},
      hiddenGems: {},
      control: "",
      preference: "",
      notes: "",
    });
  }, [seedId]);

  const filteredSeeds = useMemo(() => {
    const q = seedSearch.toLowerCase().trim();

    let results;

    if (!q) {
      results = tracks.slice(0, 50);
    } else {
      // Split query into terms for more flexible searching
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      
      results = tracks
        .filter((track) => {
          const titleLower = track.title.toLowerCase();
          const artistLower = track.artist.toLowerCase();
          const genreLower = track.genre.toLowerCase();
          
          // All terms must match somewhere in title, artist, or genre
          return terms.every(term => 
            titleLower.includes(term) || 
            artistLower.includes(term) || 
            genreLower.includes(term)
          );
        })
        .sort((a, b) => {
          // Prioritize title matches, then artist, then genre
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();
          const aArtist = a.artist.toLowerCase();
          const bArtist = b.artist.toLowerCase();
          const aGenre = a.genre.toLowerCase();
          const bGenre = b.genre.toLowerCase();
          
          // Exact matches first
          if (aTitle === q && bTitle !== q) return -1;
          if (bTitle === q && aTitle !== q) return 1;
          if (aArtist === q && bArtist !== q) return -1;
          if (bArtist === q && aArtist !== q) return 1;
          
          // Starts with query
          if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
          if (bTitle.startsWith(q) && !aTitle.startsWith(q)) return 1;
          if (aArtist.startsWith(q) && !bArtist.startsWith(q)) return -1;
          if (bArtist.startsWith(q) && !aArtist.startsWith(q)) return 1;
          
          return 0;
        })
        .slice(0, 50);
    }

    if (seedTrack && !results.some((track) => track.id === seedTrack.id)) {
      return [seedTrack, ...results];
    }

    return results;
  }, [tracks, seedSearch, seedTrack]);

  const baselineRecommendations = useMemo(() => {
    if (!seedTrack) return [];
    return getBaselineRecommendations(tracks, seedTrack, 5);
  }, [tracks, seedTrack]);

  const hiddenGemRecommendations = useMemo(() => {
    if (!seedTrack) return [];
    return getHiddenGemRecommendations(tracks, seedTrack, controls, 5);
  }, [tracks, seedTrack, controls]);

  const updateControl = (key, value) => {
    setControls((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  const updateRating = (system, key, value) => {
    setRatings((prev) => ({
      ...prev,
      [system]: {
        ...prev[system],
        [key]: Number(value),
      },
    }));
  };

  const saveResponse = () => {
    if (!seedTrack) return;

    const existingResponses = JSON.parse(
      localStorage.getItem("studyResponses") || "[]"
    );

    const response = {
      timestamp: new Date().toISOString(),
      seedSong: `${seedTrack.title} — ${seedTrack.artist}`,
      seedTrackId: seedTrack.id,
      controls,
      baselineSongs: baselineRecommendations.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        popularity: track.popularity,
        relevance: track.relevance,
        score: track.score,
      })),
      hiddenGemSongs: hiddenGemRecommendations.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        popularity: track.popularity,
        relevance: track.relevance,
        score: track.score,
      })),
      ratings,
    };

    const updatedResponses = [...existingResponses, response];

    localStorage.setItem("studyResponses", JSON.stringify(updatedResponses));
    localStorage.setItem("studyResponseCount", String(updatedResponses.length));
    setSavedCount(updatedResponses.length);

    alert("Response saved locally.");
  };

  const downloadCSV = () => {
    const responses = JSON.parse(localStorage.getItem("studyResponses") || "[]");

    if (responses.length === 0) {
      alert("No responses saved yet.");
      return;
    }

    const rows = responses.map((r) => ({
      timestamp: r.timestamp,
      seedSong: r.seedSong,
      seedTrackId: r.seedTrackId,
      discovery: r.controls.discovery,
      energy: r.controls.energy,
      danceability: r.controls.danceability,
      mood: r.controls.mood,
      acousticness: r.controls.acousticness,
      tempo: r.controls.tempo,

      baselineTaste: r.ratings.baseline.taste || "",
      baselineListen: r.ratings.baseline.listen || "",
      baselineDiscovery: r.ratings.baseline.discovery || "",
      baselineDiverse: r.ratings.baseline.diverse || "",
      baselineRandom: r.ratings.baseline.random || "",

      hiddenTaste: r.ratings.hiddenGems.taste || "",
      hiddenListen: r.ratings.hiddenGems.listen || "",
      hiddenDiscovery: r.ratings.hiddenGems.discovery || "",
      hiddenDiverse: r.ratings.hiddenGems.diverse || "",
      hiddenRandom: r.ratings.hiddenGems.random || "",

      controlRating: r.ratings.control || "",
      preference: r.ratings.preference || "",
      notes: r.ratings.notes || "",

      baselineSongs: r.baselineSongs
        .map((track) => `${track.title} — ${track.artist}`)
        .join(" | "),
      hiddenGemSongs: r.hiddenGemSongs
        .map((track) => `${track.title} — ${track.artist}`)
        .join(" | "),

      baselineAvgPopularity: average(
        r.baselineSongs.map((track) => track.popularity)
      ),
      hiddenGemAvgPopularity: average(
        r.hiddenGemSongs.map((track) => track.popularity)
      ),
    }));

    const headers = Object.keys(rows[0]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header]).replaceAll('"', '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "hidden_gems_study_responses.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

  const clearResponses = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all locally saved study responses?"
    );

    if (!confirmed) return;

    localStorage.removeItem("studyResponses");
    localStorage.removeItem("studyResponseCount");
    setSavedCount(0);
  };

  if (loading) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Loading tracks...</h1>
          <p className="subtitle">Reading your vector file.</p>
        </section>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Could not load dataset</h1>
          <p className="subtitle">{loadError}</p>
          <p className="subtitle">
            Expected file path: <strong>public/tracks_vectors.json</strong>
          </p>
        </section>
      </main>
    );
  }

  if (!seedTrack) {
    return (
      <main className="app">
        <section className="panel">
          <h1>No valid tracks found</h1>
          <p className="subtitle">
            Check that your vector JSON has a top-level tracks array.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">HCI-AI Research Prototype</p>
          <h1>Hidden Gems Recommender</h1>
          <p className="subtitle">
            Compare a popularity-biased baseline against a controllable
            recommendation system that promotes less popular songs while trying
            to preserve relevance.
          </p>
        </div>

        <div className="privacy-card">
          <strong>Privacy note</strong>
          <p>
            No Spotify login required. This prototype only uses your selected
            seed song, slider settings, ratings, and optional comments.
          </p>
          <p>
            Dataset loaded: <strong>{tracks.length.toLocaleString()}</strong>{" "}
            tracks.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="step">Step 1</p>
            <h2>Choose your taste</h2>
          </div>
        </div>

        <label className="field-label" htmlFor="seed-search">
          Search for a song, artist, or genre
        </label>

        <input
          id="seed-search"
          className="select"
          value={seedSearch}
          onChange={(e) => setSeedSearch(e.target.value)}
          placeholder="Example: Frank Ocean, acoustic, Hold On..."
        />

        <label className="field-label" htmlFor="seed-song">
          Pick a seed song
        </label>

        <select
          id="seed-song"
          className="select"
          value={seedId}
          onChange={(e) => setSeedId(e.target.value)}
        >
          {filteredSeeds.map((track) => (
            <option key={track.id} value={track.id}>
              {track.title} — {track.artist}
            </option>
          ))}
        </select>

        <div className="seed-card">
          <div>
            <h3>{seedTrack.title}</h3>
            <p>
              {seedTrack.artist} · {seedTrack.genre}
            </p>
          </div>
          <span className="badge">Popularity {seedTrack.popularity}/100</span>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="step">Step 2</p>
            <h2>Tune the hidden-gems recommender</h2>
          </div>
        </div>

        <div className="sliders-grid">
          <Slider
            label="Discovery Level"
            left="Familiar"
            right="Hidden Gems"
            value={controls.discovery}
            onChange={(value) => updateControl("discovery", value)}
          />

          <Slider
            label="Energy"
            left="Calm"
            right="Intense"
            value={controls.energy}
            onChange={(value) => updateControl("energy", value)}
          />

          <Slider
            label="Danceability"
            left="Less danceable"
            right="More danceable"
            value={controls.danceability}
            onChange={(value) => updateControl("danceability", value)}
          />

          <Slider
            label="Mood"
            left="Darker"
            right="Brighter"
            value={controls.mood}
            onChange={(value) => updateControl("mood", value)}
          />

          <Slider
            label="Acousticness"
            left="Electronic"
            right="Acoustic"
            value={controls.acousticness}
            onChange={(value) => updateControl("acousticness", value)}
          />

          <Slider
            label="Tempo"
            left="Slow"
            right="Fast"
            value={controls.tempo}
            onChange={(value) => updateControl("tempo", value)}
          />
        </div>
      </section>

      <section className="comparison-grid">
        <RecommendationList
          title="List A"
          subtitle="Popularity-biased baseline"
          tracks={baselineRecommendations}
          type="baseline"
          ratings={ratings.baseline}
          onRate={updateRating}
          seedTrackId={seedTrack.id}
        />

        <RecommendationList
          title="List B"
          subtitle="Controllable hidden-gems recommender"
          tracks={hiddenGemRecommendations}
          type="hiddenGems"
          ratings={ratings.hiddenGems}
          onRate={updateRating}
          seedTrackId={seedTrack.id}
        />
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="step">Step 3</p>
            <h2>Final comparison</h2>
          </div>
        </div>

        <label className="field-label">
          Which list would you rather use for discovering new music?
        </label>

        <div className="choice-row">
          {["List A", "List B", "No preference"].map((choice) => (
            <button
              key={choice}
              className={
                ratings.preference === choice ? "choice active" : "choice"
              }
              onClick={() =>
                setRatings((prev) => ({ ...prev, preference: choice }))
              }
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>

        <label className="field-label">
          I felt in control of the recommendations in List B.
        </label>

        <RatingButtons
          value={ratings.control}
          onChange={(value) =>
            setRatings((prev) => ({ ...prev, control: Number(value) }))
          }
        />

        <label className="field-label" htmlFor="notes">
          What did you like or dislike?
        </label>

        <textarea
          id="notes"
          className="textarea"
          value={ratings.notes}
          onChange={(e) =>
            setRatings((prev) => ({ ...prev, notes: e.target.value }))
          }
          placeholder="Example: List B felt more interesting, but a few songs seemed too random..."
        />

        <div className="actions">
          <button className="primary-button" onClick={saveResponse}>
            Save study response
          </button>

          <button className="secondary-button" onClick={downloadCSV}>
            Download CSV
          </button>

          <button className="secondary-button" onClick={clearResponses}>
            Clear saved responses
          </button>

          <span className="saved-count">{savedCount} saved locally</span>
        </div>
      </section>
    </main>
  );
}

function Slider({ label, left, right, value, onChange }) {
  return (
    <div className="slider-card">
      <div className="slider-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="slider-labels">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function RecommendationList({ title, subtitle, tracks, type, ratings, onRate, seedTrackId }) {
  const avgPopularity = average(tracks.map((track) => track.popularity));
  console.log(tracks);
  return (
    <section className="panel recommendation-panel">
      <div className="section-header">
        <div>
          <p className="step">{subtitle}</p>
          <h2>{title}</h2>
        </div>

        <span className="badge">Avg popularity {avgPopularity}/100</span>
      </div>

      <div className="song-list">
        {tracks.map((track, index) => (
          <SongCard key={`${seedTrackId}-${track.id}`} track={track} rank={index + 1} />
        ))}
      </div>

      <div className="ratings-block">
        <h3>Rate {title}</h3>

        {ratingQuestions.map((question) => (
          <div className="rating-question" key={question.key}>
            <span>{question.label}</span>

            <RatingButtons
              value={ratings[question.key]}
              onChange={(value) => onRate(type, question.key, value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function SongCard({ track, rank }) {
  const hiddenGemLabel =
    track.popularity < 30
      ? "Hidden Gem"
      : track.popularity < 55
      ? "Moderate"
      : "Mainstream";

  return (
    <article className="song-card">
      <div className="rank">{rank}</div>

      <div className="song-main">
        <div className="song-title-row">
          <h3>{track.title}</h3>
          <span className="badge">{hiddenGemLabel}</span>
        </div>

        <p>
          {track.artist} · {track.genre}
        </p>

        <p className="reason">Why: {track.reason}</p>
      </div>

      <div className="song-stats">
        <span>Popularity</span>
        <strong>{track.popularity}/100</strong>
      </div>
    </article>
  );
}

function RatingButtons({ value, onChange }) {
  return (
    <div className="rating-buttons">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          className={Number(value) === rating ? "rating active" : "rating"}
          onClick={() => onChange(rating)}
          type="button"
        >
          {rating}
        </button>
      ))}
    </div>
  );
}

function average(values) {
  if (!values.length) return 0;

  const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return Number((sum / values.length).toFixed(1));
}

export default App;