import { useEffect, useMemo, useState } from "react";
import { fetchRecommendations, fetchTracks } from "./utils/api";

function App() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [baselineRecommendations, setBaselineRecommendations] = useState([]);
  const [hiddenGemRecommendations, setHiddenGemRecommendations] = useState([]);
  const [backendInfo, setBackendInfo] = useState(null);

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
    baselineTasteFit: 0,
    baselineComment: "",
    hiddenGemTasteFit: 0,
    hiddenGemComment: "",
  });

  const [savedCount, setSavedCount] = useState(
    Number(localStorage.getItem("studyResponseCount") || 0)
  );

  useEffect(() => {
    fetchTracks()
      .then(({ tracks, modelName, trackCount }) => {
        setTracks(tracks);
        setBackendInfo({ modelName, trackCount });
        setSeedId(tracks[0]?.id || "");
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(
          "Could not reach the Python recommendation backend. Start it with uvicorn before running the frontend."
        );
        setLoading(false);
      });
  }, []);

  const seedTrack = useMemo(() => {
    return tracks.find((track) => track.id === seedId) || tracks[0];
  }, [tracks, seedId]);

  const filteredSeeds = useMemo(() => {
    const q = seedSearch.toLowerCase().trim();

    if (!q) {
      return tracks.slice(0, 50);
    }

    // Split query into terms for more flexible searching
    const terms = q.split(/\s+/).filter((term) => term.length > 0);

    return tracks
      .filter((track) => {
        const titleLower = track.title.toLowerCase();
        const artistLower = track.artist.toLowerCase();
        const genreLower = track.genre.toLowerCase();

        // All terms must match somewhere in title, artist, or genre
        return terms.every(
          (term) =>
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
  }, [tracks, seedSearch]);

  const selectedSeedIsVisible = filteredSeeds.some(
    (track) => track.id === seedId
  );

  useEffect(() => {
    if (!seedTrack) {
      setBaselineRecommendations([]);
      setHiddenGemRecommendations([]);
      return;
    }

    let isCurrent = true;
    setRecommendationsLoading(true);
    setRatings({
      baselineTasteFit: 0,
      baselineComment: "",
      hiddenGemTasteFit: 0,
      hiddenGemComment: "",
    });

    fetchRecommendations({
      seedTrackId: seedTrack.id,
      controls,
      limit: 5,
    })
      .then((data) => {
        if (isCurrent) {
          setBaselineRecommendations(data.baselineRecommendations);
          setHiddenGemRecommendations(data.hiddenGemRecommendations);
          setBackendInfo({
            modelName: data.modelName,
            trackCount: data.trackCount,
          });
        }
      })
      .catch((err) => {
        console.error(err);
        if (isCurrent) {
          setBaselineRecommendations([]);
          setHiddenGemRecommendations([]);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setRecommendationsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [seedTrack, controls]);

  const updateControl = (key, value) => {
    setControls((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  const updateRating = (key, value) => {
    setRatings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveResponse = () => {
    if (!seedTrack) return;

    if (!ratings.baselineTasteFit || !ratings.hiddenGemTasteFit) {
      alert("Please rate how well both lists fit your taste before saving.");
      return;
    }

    const existingResponses = JSON.parse(
      localStorage.getItem("studyResponses") || "[]"
    );

    const response = {
      timestamp: new Date().toISOString(),
      seedSong: `${seedTrack.title} — ${seedTrack.artist}`,
      seedTrackId: seedTrack.id,
      controls,
      ratings,
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
      baselineTasteFit: r.ratings?.baselineTasteFit || "",
      baselineComment: r.ratings?.baselineComment || "",
      hiddenGemTasteFit: r.ratings?.hiddenGemTasteFit || "",
      hiddenGemComment: r.ratings?.hiddenGemComment || "",

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
          <p className="subtitle">Connecting to the Python FAISS backend.</p>
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
          <p className="subtitle">Expected backend URL: <strong>http://127.0.0.1:8000</strong></p>
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
            seed song and slider settings.
          </p>
          <p>
            Dataset loaded: <strong>{tracks.length.toLocaleString()}</strong>{" "}
            tracks.
          </p>
          <p>
            Backend model: <strong>{backendInfo?.modelName || "loading"}</strong>
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
          Pick a seed song ({filteredSeeds.length.toLocaleString()} shown)
        </label>

        <select
          id="seed-song"
          className="select"
          value={selectedSeedIsVisible ? seedId : ""}
          onChange={(e) => setSeedId(e.target.value)}
          disabled={filteredSeeds.length === 0}
        >
          {!selectedSeedIsVisible && (
            <option value="" disabled>
              Select a matching song
            </option>
          )}

          {filteredSeeds.length === 0 && (
            <option value="">No songs match this search</option>
          )}

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
          seedTrackId={seedTrack.id}
        />

        <RecommendationList
          title="List B"
          subtitle="Controllable hidden-gems recommender"
          tracks={hiddenGemRecommendations}
          seedTrackId={seedTrack.id}
          loading={recommendationsLoading}
        />
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="step">Step 3</p>
            <h2>Rate the recommendations</h2>
          </div>
        </div>

        <div className="ratings-grid">
          <ListRating
            title="List A"
            subtitle="How well did these songs fit your taste?"
            value={ratings.baselineTasteFit}
            comment={ratings.baselineComment}
            onRatingChange={(value) => updateRating("baselineTasteFit", value)}
            onCommentChange={(value) => updateRating("baselineComment", value)}
          />

          <ListRating
            title="List B"
            subtitle="How well did these songs fit your taste?"
            value={ratings.hiddenGemTasteFit}
            comment={ratings.hiddenGemComment}
            onRatingChange={(value) => updateRating("hiddenGemTasteFit", value)}
            onCommentChange={(value) => updateRating("hiddenGemComment", value)}
          />
        </div>
      </section>

      <section className="panel">
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

function ListRating({
  title,
  subtitle,
  value,
  comment,
  onRatingChange,
  onCommentChange,
}) {
  return (
    <div className="rating-card">
      <div className="rating-header">
        <h3>{title}</h3>
        <span className="badge">{value ? `${value}/5` : "Required"}</span>
      </div>

      <p>{subtitle}</p>

      <div className="likert-row" role="radiogroup" aria-label={`${title} taste fit`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <label
            key={rating}
            className={`likert-option ${value === rating ? "selected" : ""}`}
          >
            <input
              type="radio"
              name={`${title}-taste-fit`}
              value={rating}
              checked={value === rating}
              onChange={() => onRatingChange(rating)}
            />
            <span>{rating}</span>
          </label>
        ))}
      </div>

      <div className="rating-scale-labels">
        <span>Not my taste</span>
        <span>Strong fit</span>
      </div>

      <label className="field-label" htmlFor={`${title}-comment`}>
        Optional note
      </label>
      <textarea
        id={`${title}-comment`}
        className="textarea"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder="What made this list feel relevant or not?"
      />
    </div>
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

function RecommendationList({ title, subtitle, tracks, seedTrackId, loading = false }) {
  const avgPopularity = average(tracks.map((track) => track.popularity));

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
        {loading && <p className="reason">Asking the Python backend for recommendations...</p>}

        {tracks.map((track, index) => (
          <SongCard key={`${seedTrackId}-${track.id}`} track={track} rank={index + 1} />
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

function average(values) {
  if (!values.length) return 0;

  const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return Number((sum / values.length).toFixed(1));
}

export default App;
