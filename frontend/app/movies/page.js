"use client";

import { useEffect, useState } from "react";
import { getMovies, sendRating } from "@/lib/api";

export default function MoviesPage() {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    getMovies().then(setMovies);
  }, []);

  async function rate(movieId) {
    const token = localStorage.getItem("token");

    const res = await sendRating(token, {
      tmdb_id: movieId,
      p: 8,
      s: 7,
      d: 8,
      a: 9,
      v: 7,
      g: 8,
      review: "Great movie"
    });

    alert("Score: " + res.score);
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Movies</h1>

      {movies.map((m) => (
        <div key={m.id} style={{ marginBottom: 20 }}>
          <h3>{m.title}</h3>
          <button onClick={() => rate(m.id)}>Rate</button>
        </div>
      ))}
    </div>
  );
}