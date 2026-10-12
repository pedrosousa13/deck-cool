import type { ReactNode } from "react";

interface Props {
  title: string;
  html: string;
  children?: ReactNode;
}

/** A page from content/. The title in <head> is build.head's, from src/seo.ts. */
export default function Layout({ title, html, children }: Props) {
  // A page with no body, as the home page, is its components alone.
  if (html.trim() === "") return <>{children}</>;
  return (
    <article className="site-page">
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {children}
    </article>
  );
}
