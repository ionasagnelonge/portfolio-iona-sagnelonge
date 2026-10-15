# Portfolio — Iona Sagnelonge

Site statique (Vite), déployé automatiquement sur GitHub Pages à chaque push sur `main`.

## Modifier le contenu

Tout le contenu est dans **`public/content/projects.json`** :

- `site` : bio, `skills` (compétences) et `cv` (page Infos), `email`, `instagram` et `credits` (page Contact).
- `categories` : disciplines, avec leur glyphe (dessin tiré de la police Feroniapi) et leur couleur.
- `projects` : un objet par projet, **dans l’ordre d’affichage**.
  - `folder` : nom du dossier dans `data/` contenant les originaux.
  - `images` : noms des fichiers, dans l’ordre voulu. `cover` : l’image de la grille des projets.
  - `sticker` : l’image détourée du mur d’accueil (voir plus bas).
  - `summary`, `body` (paragraphes séparés par une ligne vide), `credits`, `links`.

Modifier un texte ne nécessite rien d’autre que d’éditer ce fichier.

## Stickers de la page d’accueil

L’accueil est un mur de stickers, un par projet. Tant qu’un projet n’a pas de sticker,
sa couverture est affichée façon photo à bord blanc.

1. Exporter l’image détourée en **PNG avec fond transparent** (environ 1500 px de large suffit).
2. La déposer dans `data/stickers/`.
3. Dans `projects.json`, renseigner le champ `sticker` du projet : `"sticker": "ours.png"`.
4. Lancer l’optimisation des images (ci-dessous) : le contour blanc est ajouté automatiquement
   autour de la silhouette ; l’ombre est ajoutée par le site.

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

- Feroniapi (tous les textes et les glyphes) — `src/assets/fonts/`.
