import json
import pandas as pd
from pathlib import Path

INPUT_CSV = "tracks.csv"
OUTPUT_JSON = "public/tracks_vectors.json"

FEATURES = [
    "danceability",
    "energy",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
    "tempo_norm",
]

def normalize_tempo(tempo):
    # Spotify tempos are often roughly between 60 and 220 BPM.
    # Clamp to keep values between 0 and 1.
    if pd.isna(tempo):
        return 0.0

    value = (tempo - 60) / (220 - 60)
    return max(0.0, min(1.0, value))

def safe_float(value):
    if pd.isna(value):
        return 0.0
    return float(value)

def main():
    df = pd.read_csv(INPUT_CSV)

    df["tempo_norm"] = df["tempo"].apply(normalize_tempo)

    tracks = []

    for _, row in df.iterrows():
        vector = [safe_float(row[feature]) for feature in FEATURES]

        track = {
            "id": str(row["track_id"]),
            "title": str(row["track_name"]),
            "artist": str(row["artists"]),
            "album": str(row["album_name"]),
            "genre": str(row["track_genre"]),
            "popularity": int(row["popularity"]),
            "explicit": str(row["explicit"]).lower() == "true",
            "vector": vector,
        }

        tracks.append(track)

    output = {
        "features": FEATURES,
        "tracks": tracks,
    }

    Path("public").mkdir(exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Saved {len(tracks)} tracks to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()