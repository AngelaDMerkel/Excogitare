import { MapStudio } from "./studio/studio";

export const metadata = {
  title: "Excogitare — Civ V Map Studio",
  description: "Create, refine, sketch, repair and export multiplayer Civilization V worlds in your browser.",
};

export default function Home() {
  return <MapStudio />;
}
