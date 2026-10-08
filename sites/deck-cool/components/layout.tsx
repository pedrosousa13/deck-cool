interface Props {
  title: string;
  html: string;
}

export default function Layout({ title, html }: Props) {
  return (
    <>
      <title>{title}</title>
      <article>
        <h1>{title}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </>
  );
}
