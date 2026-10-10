import { formatBytes, utf8Bytes } from "../src/bytes.ts";
import { PICKER, PRODUCT } from "../src/product.ts";
import { PAGE } from "./shell.ts";
import VariantPicker from "./variant_picker.tsx";

export default function ContentPage({
  title,
  intro,
  figures,
  explainer,
}: {
  title: string;
  intro: string;
  figures: { readonly read: string; readonly sent: string };
  explainer: { readonly heading: string; readonly body: readonly string[] };
}) {
  const product = PRODUCT;
  const picker = PICKER;
  const rating =
    product.reviews.reduce((total, review) => total + review.rating, 0) /
    product.reviews.length;

  return (
    <div className={PAGE}>
      <div className="fw-hero">
        <div>
          <h1 className="fw-hero__title">{title}</h1>
          <p className="fw-hero__lede">{intro}</p>
        </div>
        <div className="fw-figures">
          <div className="fw-table" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Measured</th>
                  <th>What it is</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{formatBytes(utf8Bytes(JSON.stringify(product)))}</td>
                  <td>{figures.read}</td>
                </tr>
                <tr>
                  <td>{formatBytes(utf8Bytes(JSON.stringify(picker)))}</td>
                  <td>{figures.sent}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <section id="product" aria-labelledby="product-heading" className="fw-feature">
        <div className="fw-feature__text">
          <h2 id="product-heading">{product.name}</h2>
          <p>{product.tagline}</p>
          {product.description.map((block, index) => (
            <p key={index}>
              {block.children.map((span, at) =>
                "marks" in span ? (
                  <strong key={at}>{span.text}</strong>
                ) : (
                  span.text
                ),
              )}
            </p>
          ))}
          <p>{`Rated ${rating.toFixed(1)} out of 5 from ${String(product.reviews.length)} reviews.`}</p>
          <dl className="fw-facts">
            {product.specs.map((spec) => (
              <div key={spec.label}>
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="fw-feature__demo fw-picker">
          <VariantPicker {...picker} />
        </div>
      </section>
      <section id="explainer" aria-labelledby="explainer-heading" className="fw-feature">
        <div className="fw-feature__text">
          <h2 id="explainer-heading">{explainer.heading}</h2>
          {explainer.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
