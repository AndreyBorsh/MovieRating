import TvClient from "./TvClient";
import { serverGet } from "@/lib/server-api";
import { img } from "@/lib/base";

const SITE = "https://makuku.ddns.net";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const show = await serverGet(`/tv/${id}`);
  if (!show || !show.title) {
    return { title: "Сериал — WAW", description: "Оценки и рецензии на фильмы и сериалы." };
  }
  const name = `${show.title}${show.year ? ` (${show.year})` : ""}`;
  const title = `${name} — оценки и рецензии | WAW`;
  const rated = show.count > 0 ? `Оценка ${show.score}/10 от зрителей (${show.count}). ` : "";
  const description = (`${rated}${show.overview || ""}`).trim().slice(0, 300)
    || `Оценки и рецензии зрителей на сериал ${name}.`;
  const poster = show.poster ? img("w500", show.poster) : null;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/waw-movie/tv/${id}` },
    openGraph: {
      title, description, type: "video.tv_show", locale: "ru_RU",
      url: `${SITE}/waw-movie/tv/${id}`,
      images: poster ? [{ url: poster, width: 500, height: 750, alt: name }] : [],
    },
    twitter: {
      card: poster ? "summary_large_image" : "summary",
      title, description, images: poster ? [poster] : [],
    },
  };
}

export default async function TvPage({ params }) {
  const { id } = await params;
  const [show, reviews] = await Promise.all([
    serverGet(`/tv/${id}`),
    serverGet(`/tv/${id}/reviews`),
  ]);
  return <TvClient id={id} initial={{ show, reviews: Array.isArray(reviews) ? reviews : [] }} />;
}
