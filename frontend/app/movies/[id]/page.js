import MovieClient from "./MovieClient";
import { serverGet } from "@/lib/server-api";
import { img } from "@/lib/base";

const SITE = "https://makuku.ddns.net";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const movie = await serverGet(`/movies/${id}`);
  if (!movie || !movie.title) {
    return { title: "Фильм — WAW", description: "Оценки и рецензии на фильмы и сериалы." };
  }
  const name = `${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
  const title = `${name} — оценки и рецензии | WAW`;
  const rated = movie.count > 0 ? `Оценка ${movie.score}/10 от зрителей (${movie.count}). ` : "";
  const description = (`${rated}${movie.overview || ""}`).trim().slice(0, 300)
    || `Оценки и рецензии зрителей на фильм ${name}.`;
  const poster = movie.poster ? img("w500", movie.poster) : null;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/waw-movie/movies/${id}` },
    openGraph: {
      title, description, type: "video.movie", locale: "ru_RU",
      url: `${SITE}/waw-movie/movies/${id}`,
      images: poster ? [{ url: poster, width: 500, height: 750, alt: name }] : [],
    },
    twitter: {
      card: poster ? "summary_large_image" : "summary",
      title, description, images: poster ? [poster] : [],
    },
  };
}

export default async function MoviePage({ params }) {
  const { id } = await params;
  const [movie, reviews] = await Promise.all([
    serverGet(`/movies/${id}`),
    serverGet(`/movies/${id}/reviews`),
  ]);
  return <MovieClient id={id} initial={{ movie, reviews: Array.isArray(reviews) ? reviews : [] }} />;
}
