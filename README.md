# Portfolio — Iona Sagnelonge

Site statique (Vite), déployé automatiquement sur GitHub Pages à chaque push sur `main`.

## Modifier le contenu

Tout le contenu est dans **`public/content/projects.json`** :

- `site` : bio, e-mail, Instagram, repères (page Infos). Le bloc contact n’apparaît que si `email` ou `instagram` est rempli.
- `categories` : disciplines, avec leur glyphe (dessin tiré de la police Feroniapi) et leur couleur.
- `projects` : un objet par projet, **dans l’ordre d’affichage**.
  - `folder` : nom du dossier dans `data/` contenant les originaux.
  - `images` : noms des fichiers, dans l’ordre voulu. `cover` : l’image de la mosaïque.
  - `layout: "grid"` : affiche les images en grille (pratique pour une série d’affiches).
  - `summary`, `body` (paragraphes séparés par une ligne vide), `credits`, `links`.

Modifier un texte ne nécessite rien d’autre que d’éditer ce fichier.

## Ajouter ou changer des images

1. Déposer les originaux (JPG, PNG, TIFF, GIF animé, CMYK… peu importe) dans `data/<dossier>/`.
2. Les référencer dans `projects.json`.
3. Lancer l’optimisation :

   ```sh
   pip install pillow
   python scripts/optimize_images.py          # seulement les images nouvelles ou modifiées
   python scripts/optimize_images.py --force  # tout régénérer
   ```

Le script produit des WebP en 640 / 1280 / 2000 px de large dans `public/images/`, convertit le CMYK
en sRGB, applique la rotation EXIF, supprime les métadonnées (dont la géolocalisation des photos de
téléphone) et écrit `public/content/images.json` (dimensions, couleur moyenne, aperçu flou).
Committer ensuite `public/images/` et `public/content/images.json`.

## Développement

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # génère dist/
```

`scripts/extract_glyphs.py` régénère `src/glyphs.js` (dessins de la police en SVG) si l’on veut
utiliser d’autres glyphes — nécessite `pip install fonttools`.

## Polices

- Feroniapi (titres et glyphes) — `src/assets/fonts/`.
- Newsreader (texte courant), Production Type, licence SIL Open Font License 1.1 — sous-ensemble latin auto-hébergé.
