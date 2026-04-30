import { useMemo, useState } from "react";
import { songs } from "./data/songs";
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
  const [seedId, setSeedId] = useState(songs[0].id);
  const [controls, setControls] = useState({
    discovery: 60,
    energy: 60,
    danceability: 60,
    mood: 55,
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

  const seedSong = songs.find((song) => song.id === Number(seedId));

  const baselineRecommendations = useMemo(() => {
    return getBaselineRecommendations(songs, seedSong, 5);
  }, [seedSong]);

  const hiddenGemRecommendations = useMemo(() => {
    return getHiddenGemRecommendations(songs, seedSong, controls, 5);
  }, [seedSong, controls]);

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
    const existingResponses = JSON.parse(
      localStorage.getItem("studyResponses") || "[]"
    );

    const response = {
      timestamp: new Date().toISOString(),
      seedSong: `${seedSong.title} — ${seedSong.artist}`,
      controls,
      baselineSongs: baselineRecommendations.map(
        (song) => `${song.title} — ${song.artist}`
      ),
      hiddenGemSongs: hiddenGemRecommendations.map(
        (song) => `${song.title} — ${song.artist}`
      ),
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
      discovery: r.controls.discovery,
      energy: r.controls.energy,
      danceability: r.controls.danceability,
      mood: r.controls.mood,
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
      baselineSongs: r.baselineSongs.join(" | "),
      hiddenGemSongs: r.hiddenGemSongs.join(" | "),
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

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "hidden_gems_study_responses.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

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
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="step">Step 1</p>
            <h2>Choose your taste</h2>
          </div>
        </div>

        <label className="field-label" htmlFor="seed-song">
          Pick a song you like
        </label>
        <select
          id="seed-song"
          className="select"
          value={seedId}
          onChange={(e) => setSeedId(e.target.value)}
        >
          {songs.map((song) => (
            <option key={song.id} value={song.id}>
              {song.title} — {song.artist}
            </option>
          ))}
        </select>

        <div className="seed-card">
          <div>
            <h3>{seedSong.title}</h3>
            <p>
              {seedSong.artist} · {seedSong.genre}
            </p>
          </div>
          <span className="badge">Popularity {seedSong.popularity}/100</span>
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
          songs={baselineRecommendations}
          type="baseline"
          ratings={ratings.baseline}
          onRate={updateRating}
        />

        <RecommendationList
          title="List B"
          subtitle="Controllable hidden-gems recommender"
          songs={hiddenGemRecommendations}
          type="hiddenGems"
          ratings={ratings.hiddenGems}
          onRate={updateRating}
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

function RecommendationList({ title, subtitle, songs, type, ratings, onRate }) {
  return (
    <section className="panel recommendation-panel">
      <div className="section-header">
        <div>
          <p className="step">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="song-list">
        {songs.map((song, index) => (
          <SongCard key={song.id} song={song} rank={index + 1} />
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

function SongCard({ song, rank }) {
  const hiddenGemLabel =
    song.popularity < 30
      ? "Hidden Gem"
      : song.popularity < 55
      ? "Moderate"
      : "Mainstream";

  return (
    <article className="song-card">
      <div className="rank">{rank}</div>
      <div className="song-main">
        <div className="song-title-row">
          <h3>{song.title}</h3>
          <span className="badge">{hiddenGemLabel}</span>
        </div>
        <p>
          {song.artist} · {song.genre}
        </p>
        <p className="reason">Why: {song.reason}</p>
      </div>
      <div className="song-stats">
        <span>Popularity</span>
        <strong>{song.popularity}/100</strong>
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

export default App;