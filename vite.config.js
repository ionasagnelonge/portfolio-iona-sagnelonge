import { defineConfig } from "vite";
import cms from "./cms/server.js";

export default defineConfig({
  // Relative asset URLs keep the site working on GitHub Pages project URLs.
  base: "./",
  // Interface d'édition du contenu, en développement uniquement : npm run cms
  plugins: [cms()]
});
