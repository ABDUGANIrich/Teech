import type { Metadata } from "next";

export const siteUrl = new URL(
  process.env.APP_URL || "https://teech-nu.vercel.app",
).origin;
export const siteTitle = "Teech — Learn with Sage. Teach Pip if you like.";
export const siteDescription =
  "Learn with Sage through short courses and practice, then optionally teach Pip. Start from a topic or notes, or bring your own notes straight to Pip.";

export const publicPages = {
  home: {
    path: "/",
    title: siteTitle,
    description: siteDescription,
    imageAlt:
      "Teech: learn with Sage, the owl teacher, and optionally teach Pip, the curious student.",
  },
  sage: {
    path: "/teacher-sample",
    title: "Sage sample",
    description:
      "Try Sage's fixed sample course: explanations, a worked example, practice and illustrative feedback. Open answers are not assessed. No account needed.",
    imageAlt:
      "Try Sage: a fixed sample course with explanations and practice. No account needed. Sage is an owl with glasses.",
  },
  pip: {
    path: "/sample",
    title: "Pip sample",
    description:
      "Teach Pip the water cycle, answer follow-up questions and review your explanation. No account needed. Uses live AI when available, or a labeled fixed preview.",
    imageAlt:
      "Try Pip: explain the water cycle to a curious student. Live AI or a labeled fixed preview. No account needed.",
  },
} as const;

export type PublicPage = keyof typeof publicPages;

export function publicPageMetadata(page: PublicPage): Metadata {
  const { path, title, description } = publicPages[page];
  const shareTitle = page === "home" ? title : `${title} · Teech`;
  return {
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Teech",
      locale: "en_US",
      title: shareTitle,
      description,
      url: new URL(path, siteUrl).href,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
    },
  };
}
