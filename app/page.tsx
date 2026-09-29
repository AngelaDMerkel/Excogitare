const basePath = process.env.NEXT_PUBLIC_EXCOGITARE_BASE_PATH ?? "";

export default function Home() {
  const destination = `${basePath}/v3/index.html`;
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${destination}`} />
      <main><a href={destination}>Open Excogitare V3</a></main>
    </>
  );
}
