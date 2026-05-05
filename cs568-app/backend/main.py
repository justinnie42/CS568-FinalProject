from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import faiss
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer


APP_DIR = Path(__file__).resolve().parents[1]
TRACKS_CSV = APP_DIR / "tracks.csv"
MODEL_NAME = "TF-IDF metadata embeddings + TruncatedSVD + numeric audio attributes"
MAX_TRACKS = 15000
SEARCH_CANDIDATES = 250
TEXT_EMBEDDING_DIMENSIONS = 128
TEXT_WEIGHT = 0.78
NUMERIC_WEIGHT = 0.22

FEATURES = [
    "danceability",
    "energy",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
    "tempo_norm",
    "popularity_norm",
]


class Controls(BaseModel):
    discovery: float = Field(60, ge=0, le=100)
    energy: float = Field(60, ge=0, le=100)
    danceability: float = Field(60, ge=0, le=100)
    mood: float = Field(55, ge=0, le=100)
    acousticness: float = Field(40, ge=0, le=100)
    tempo: float = Field(50, ge=0, le=100)


class RecommendationRequest(BaseModel):
    seedTrackId: str
    controls: Controls
    limit: int = Field(5, ge=1, le=25)


app = FastAPI(title="Hidden Gems FAISS Recommender")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    catalog = get_catalog()
    return {
        "ok": True,
        "modelName": MODEL_NAME,
        "trackCount": len(catalog.tracks),
        "features": FEATURES,
    }


@app.get("/api/tracks")
def tracks() -> dict[str, Any]:
    catalog = get_catalog()
    return {
        "modelName": MODEL_NAME,
        "trackCount": len(catalog.tracks),
        "features": FEATURES,
        "tracks": [public_track(track) for track in catalog.tracks],
    }


@app.post("/api/recommendations")
def recommendations(request: RecommendationRequest) -> dict[str, Any]:
    catalog = get_catalog()
    seed_index = catalog.track_index_by_id.get(request.seedTrackId)

    if seed_index is None:
        raise HTTPException(status_code=404, detail="Seed track not found")

    baseline = get_baseline_recommendations(catalog, seed_index, request.limit)
    hidden_gems = get_hidden_gem_recommendations(
        catalog,
        seed_index,
        request.controls,
        request.limit,
    )

    return {
        "modelName": MODEL_NAME,
        "trackCount": len(catalog.tracks),
        "baselineRecommendations": baseline,
        "hiddenGemRecommendations": hidden_gems,
    }


class Catalog:
    def __init__(
        self,
        tracks: list[dict[str, Any]],
        embeddings: np.ndarray,
        index: faiss.Index,
        vectorizer: TfidfVectorizer,
        reducer: TruncatedSVD,
    ) -> None:
        self.tracks = tracks
        self.embeddings = embeddings
        self.index = index
        self.vectorizer = vectorizer
        self.reducer = reducer
        self.track_index_by_id = {
            track["id"]: index for index, track in enumerate(self.tracks)
        }


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    if not TRACKS_CSV.exists():
        raise RuntimeError(f"Could not find dataset at {TRACKS_CSV}")

    df = pd.read_csv(TRACKS_CSV)
    df = (
        df.drop_duplicates(subset=["track_name", "artists"])
        .sort_values("popularity", ascending=False)
        .head(MAX_TRACKS)
        .copy()
    )
    df["tempo_norm"] = df["tempo"].apply(normalize_tempo)
    df["popularity_norm"] = df["popularity"].fillna(0).astype(float) / 100

    tracks = [row_to_track(row) for _, row in df.iterrows()]
    numeric_vectors = np.array([track["numericVector"] for track in tracks], dtype="float32")

    metadata_texts = [track_to_embedding_text(track) for track in tracks]
    vectorizer = TfidfVectorizer(
        max_features=12000,
        ngram_range=(1, 2),
        min_df=2,
        stop_words="english",
    )
    text_matrix = vectorizer.fit_transform(metadata_texts)
    reducer = TruncatedSVD(
        n_components=min(TEXT_EMBEDDING_DIMENSIONS, text_matrix.shape[1] - 1),
        random_state=42,
    )
    text_embeddings = reducer.fit_transform(text_matrix).astype("float32")

    embeddings = combine_embeddings(text_embeddings, numeric_vectors)
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)

    return Catalog(
        tracks=tracks,
        embeddings=embeddings,
        index=index,
        vectorizer=vectorizer,
        reducer=reducer,
    )


def get_baseline_recommendations(
    catalog: Catalog,
    seed_index: int,
    limit: int,
) -> list[dict[str, Any]]:
    seed_track = catalog.tracks[seed_index]
    query = catalog.embeddings[seed_index : seed_index + 1]
    candidates = search(catalog, query, seed_index)

    scored = []
    for index, similarity in candidates:
        track = catalog.tracks[index]
        popularity_boost = track["popularity"] / 100
        score = 0.82 * similarity + 0.18 * popularity_boost
        scored.append(
            recommendation_payload(
                track,
                relevance=similarity,
                score=score,
                reason=f"Embedding-near {seed_track['title']}, with a popularity boost.",
            )
        )

    return sorted(scored, key=lambda track: track["score"], reverse=True)[:limit]


def get_hidden_gem_recommendations(
    catalog: Catalog,
    seed_index: int,
    controls: Controls,
    limit: int,
) -> list[dict[str, Any]]:
    seed_track = catalog.tracks[seed_index]
    preference_text = create_preference_text(seed_track, controls)
    preference_text_embedding = catalog.reducer.transform(
        catalog.vectorizer.transform([preference_text])
    ).astype("float32")

    preference_numeric = np.array([controls_to_numeric_vector(controls)], dtype="float32")
    query = combine_embeddings(preference_text_embedding, preference_numeric)
    candidates = search(catalog, query, seed_index)
    target_popularity = 70 - (controls.discovery / 100) * 50

    scored = []
    for index, similarity in candidates:
        track = catalog.tracks[index]
        discovery_match = 1 - abs(track["popularity"] - target_popularity) / 100
        score = 0.72 * similarity + 0.28 * discovery_match
        scored.append(
            recommendation_payload(
                track,
                relevance=similarity,
                score=score,
                reason=get_reason(track, controls),
            )
        )

    return sorted(scored, key=lambda track: track["score"], reverse=True)[:limit]


def search(
    catalog: Catalog,
    query: np.ndarray,
    seed_index: int,
) -> list[tuple[int, float]]:
    candidate_count = min(SEARCH_CANDIDATES + 1, len(catalog.tracks))
    similarities, indices = catalog.index.search(query.astype("float32"), candidate_count)

    return [
        (int(index), float(similarity))
        for index, similarity in zip(indices[0], similarities[0])
        if int(index) != seed_index and int(index) >= 0
    ]


def combine_embeddings(
    text_embeddings: np.ndarray,
    numeric_vectors: np.ndarray,
) -> np.ndarray:
    text_part = l2_normalize(text_embeddings) * TEXT_WEIGHT
    numeric_part = l2_normalize(numeric_vectors) * NUMERIC_WEIGHT
    combined = np.concatenate([text_part, numeric_part], axis=1).astype("float32")
    return l2_normalize(combined)


def row_to_track(row: pd.Series) -> dict[str, Any]:
    numeric_vector = [safe_float(row[feature]) for feature in FEATURES]

    return {
        "id": str(row["track_id"]),
        "title": str(row["track_name"]),
        "artist": str(row["artists"]),
        "album": str(row["album_name"]),
        "genre": str(row["track_genre"]),
        "popularity": int(row["popularity"]),
        "explicit": str(row["explicit"]).lower() == "true",
        "numericVector": numeric_vector,
    }


def public_track(track: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": track["id"],
        "title": track["title"],
        "artist": track["artist"],
        "album": track["album"],
        "genre": track["genre"],
        "popularity": track["popularity"],
        "explicit": track["explicit"],
    }


def recommendation_payload(
    track: dict[str, Any],
    relevance: float,
    score: float,
    reason: str,
) -> dict[str, Any]:
    return {
        **public_track(track),
        "relevance": round(relevance, 4),
        "score": round(score, 4),
        "hiddenGemScore": round(1 - track["popularity"] / 100, 4),
        "reason": reason,
    }


def track_to_embedding_text(track: dict[str, Any]) -> str:
    return (
        f"Song title: {track['title']}. "
        f"Artist: {track['artist']}. "
        f"Album: {track['album']}. "
        f"Genre: {track['genre']}. "
        f"Popularity: {popularity_tier(track['popularity'])}. "
        f"Audio attributes: {describe_numeric_vector(track['numericVector'])}."
    )


def create_preference_text(seed_track: dict[str, Any], controls: Controls) -> str:
    return (
        f"Recommend songs similar to {seed_track['title']} by {seed_track['artist']} "
        f"in or near the {seed_track['genre']} genre. "
        f"Preference: {discovery_text(controls.discovery)}. "
        f"Desired audio attributes: {describe_controls(controls)}."
    )


def controls_to_numeric_vector(controls: Controls) -> list[float]:
    return [
        controls.danceability / 100,
        controls.energy / 100,
        controls.mood / 100,
        controls.acousticness / 100,
        0.2,
        0.2,
        0.2,
        controls.tempo / 100,
        max(0, min(1, (70 - (controls.discovery / 100) * 50) / 100)),
    ]


def describe_numeric_vector(values: list[float]) -> str:
    labels = [
        "danceability",
        "energy",
        "mood brightness",
        "acousticness",
        "instrumentalness",
        "speechiness",
        "liveness",
        "tempo",
        "popularity",
    ]
    return ", ".join(describe_level(label, value) for label, value in zip(labels, values))


def describe_controls(controls: Controls) -> str:
    return ", ".join(
        [
            describe_level("energy", controls.energy / 100),
            describe_level("danceability", controls.danceability / 100),
            describe_level("mood brightness", controls.mood / 100),
            describe_level("acousticness", controls.acousticness / 100),
            describe_level("tempo", controls.tempo / 100),
        ]
    )


def get_reason(track: dict[str, Any], controls: Controls) -> str:
    reasons = []
    values = track["numericVector"]

    if track["popularity"] < 30:
        reasons.append("less mainstream")

    checks = [
        ("matches energy", values[1], controls.energy),
        ("matches danceability", values[0], controls.danceability),
        ("matches mood", values[2], controls.mood),
        ("matches acoustic preference", values[3], controls.acousticness),
    ]

    for label, track_value, control_value in checks:
        if abs(track_value * 100 - control_value) < 18:
            reasons.append(label)

    return (
        ", ".join(reasons)
        if reasons
        else "FAISS nearest neighbor from metadata and audio-attribute embedding."
    )


def normalize_tempo(tempo: float) -> float:
    if pd.isna(tempo):
        return 0.0

    value = (float(tempo) - 60) / 160
    return max(0.0, min(1.0, value))


def safe_float(value: Any) -> float:
    if pd.isna(value):
        return 0.0
    return float(value)


def l2_normalize(values: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return (values / norms).astype("float32")


def describe_level(label: str, value: float) -> str:
    if value >= 0.68:
        return f"high {label}"
    if value <= 0.32:
        return f"low {label}"
    return f"medium {label}"


def popularity_tier(popularity: int) -> str:
    if popularity < 30:
        return "hidden gem, obscure, low popularity"
    if popularity < 55:
        return "moderately known"
    return "mainstream, popular"


def discovery_text(discovery: float) -> str:
    if discovery >= 70:
        return "prioritize obscure hidden gems and low-popularity songs"
    if discovery >= 40:
        return "prefer somewhat less obvious recommendations"
    return "prefer familiar and more mainstream recommendations"
