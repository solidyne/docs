import { useEffect, useState } from "react";

export default function DownloadsFromAPI() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("https://solidyne.dx.com.ar/DW/docs_downloads.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Error loading downloads JSON");
        }
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p>Error: {error}</p>;
  }

  if (!data) {
    return <p>Loading downloads...</p>;
  }

  return (
    <div>
      {Object.entries(data).map(([key, product]) => (
        <div key={key} style={{ marginBottom: "2rem" }}>
          <h2>{product.product_name}</h2>
          <ul>
            {product.downloads.map((item, index) => (
              <li key={index} style={{ marginBottom: "1rem" }}>
                <strong>{item.component}</strong>
                {item.version && <> – v{item.version}</>}
                {item.date && <> ({item.date})</>}
                <br />
                {item.description && <span>{item.description}<br /></span>}
                {item.platform && <em>{item.platform}<br /></em>}
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}