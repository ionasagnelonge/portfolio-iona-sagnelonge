/* Interface du CMS local : édition de public/content/projects.json et des images des projets.
   Les échanges avec le disque et git passent par l'API du plugin Vite (cms/server.js). */

const STICKER_FOLDER = "stickers";
const PREFIXES = ["pour le", "pour la", "pour l’", "pour", "avec le", "avec la", "avec", "en collaboration avec"];

const state = {
  content: null,
  images: {},
  current: 0,
  dirty: false,
  edited: new WeakSet(), // projets modifiés depuis le dernier enregistrement
  fresh: new WeakSet(), // projets jamais enregistrés : leur identifiant suit le titre
  previews: new Map(), // aperçus locaux des images envoyées, avant optimisation
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const listEl = $("[data-projects]");
const editorEl = $("[data-editor]");
const statusEl = $("[data-status]");
const toastEl = $("[data-toast]");
const dialogEl = $("[data-dialog]");

/* ---------- Utilitaires ---------- */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function slugify(value) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "projet"
  );
}

function uniqueSlug(base, project) {
  let slug = base;
  for (let n = 2; state.content.projects.some((other) => other !== project && other.slug === slug); n++) slug = `${base}-${n}`;
  return slug;
}

function move(array, from, to) {
  array.splice(to, 0, array.splice(from, 1)[0]);
}

async function api(path, options = {}) {
  const response = await fetch(`/__cms/${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !("ok" in data)) throw new Error(data.error || `${path} : ${response.status}`);
  return data;
}

let toastTimer;
function toast(message, { error = false, duration = 3500 } = {}) {
  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", error);
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), duration);
}

// Ouvre la boîte de dialogue ; résout avec la valeur du bouton choisi.
function ask({ title, html = "", actions }) {
  $("[data-dialog-title]", dialogEl).textContent = title;
  $("[data-dialog-content]", dialogEl).innerHTML = html;
  $("[data-dialog-actions]", dialogEl).innerHTML = [...actions]
    .reverse()
    .map(({ label, value, kind = "" }) => `<button class="button ${kind}" value="${value}">${escapeHtml(label)}</button>`)
    .join("");
  dialogEl.returnValue = "";
  dialogEl.showModal();
  return new Promise((resolve) => dialogEl.addEventListener("close", () => resolve(dialogEl.returnValue), { once: true }));
}

function setBusy(busy) {
  state.busy = busy;
  document.querySelectorAll("[data-save], [data-publish]").forEach((button) => (button.disabled = busy));
}

/* ---------- Modèle ---------- */

const currentProject = () => state.content.projects[state.current];

function touch(project = currentProject()) {
  state.dirty = true;
  if (project) state.edited.add(project);
  renderList();
}

function imageKey(group, name) {
  return `${group}/${name}`.normalize("NFC");
}

function previewUrl(group, folder, name) {
  const local = state.previews.get(imageKey(folder, name));
  if (local) return local;
  const meta = state.images[imageKey(group, name)];
  if (meta) return `/${meta.srcset[0].src}`;
  return `/__cms/data/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
}

function metaLine(project) {
  const { prefix, name } = project.partner ?? {};
  const partner = name ? [prefix, name].filter(Boolean).join(" ") : "";
  return [partner, project.year].filter(Boolean).join(", ");
}

// Nettoie un projet avant écriture : couverture valide, champs vides retirés.
function tidy(project) {
  if (!project.images.includes(project.cover)) project.cover = project.images[0] ?? "";
  if (project.partner && !project.partner.name && !project.partner.prefix) delete project.partner;
  if (project.credits !== undefined && !project.credits.trim()) delete project.credits;
}

/* ---------- Liste des projets ---------- */

const searchEl = $("[data-search]");

// Le projet correspond-il à la recherche (titre, année, partenaire ou catégorie) ?
function matches(project, query) {
  if (!query) return true;
  const labels = project.categories.map((key) => state.content.categories[key]?.label ?? key);
  const text = [project.title, project.year, project.partner?.name, ...labels].join(" ");
  const fold = (value) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return fold(text).includes(fold(query));
}

function renderList() {
  const projects = state.content.projects;
  const query = searchEl.value.trim();
  const last = projects.length - 1;
  listEl.innerHTML = projects
    .map((project, index) => {
      if (!matches(project, query)) return "";
      const current = index === state.current;
      const cover = project.images.includes(project.cover) ? project.cover : project.images[0];
      const thumb = cover ? `background-image: url(&quot;${escapeHtml(previewUrl(project.slug, project.folder, cover))}&quot;)` : "";
      const sub = [project.year, project.images.length ? `${project.images.length} img.` : "sans image"].filter(Boolean).join(" · ");
      return `<li draggable="true" data-index="${index}" class="${current ? "is-current" : ""}">
        <span class="projects__thumb" style="${thumb}"></span>
        <span class="projects__text">
          <span class="projects__title">${escapeHtml(project.title || "Sans titre")}</span>
          <span class="projects__sub">${escapeHtml(sub)}</span>
        </span>
        ${state.edited.has(project) ? `<span class="projects__dirty" title="Non enregistré">●</span>` : ""}
        ${
          current
            ? `<span class="projects__moves">
                <button type="button" data-move="top" title="Tout en haut" ${index === 0 ? "disabled" : ""}>⤒</button>
                <button type="button" data-move="up" title="Monter (Alt+↑)" ${index === 0 ? "disabled" : ""}>↑</button>
                <button type="button" data-move="down" title="Descendre (Alt+↓)" ${index === last ? "disabled" : ""}>↓</button>
              </span>`
            : ""
        }
      </li>`;
    })
    .join("");
  const shown = listEl.children.length;
  $("[data-count]").textContent = query ? `${shown} sur ${projects.length} projets` : `${projects.length} projets`;
  updateStatusDirty();
}

function revealCurrent() {
  listEl.querySelector(".is-current")?.scrollIntoView({ block: "nearest" });
}

function moveCurrent(where) {
  const from = state.current;
  const to = { top: 0, up: from - 1, down: from + 1 }[where];
  if (to < 0 || to >= state.content.projects.length || to === from) return;
  move(state.content.projects, from, to);
  state.current = to;
  touch(null);
  revealCurrent();
}

searchEl.addEventListener("input", renderList);

listEl.addEventListener("click", (event) => {
  const item = event.target.closest("li");
  if (!item) return;
  const moveButton = event.target.closest("[data-move]");
  if (moveButton) return moveCurrent(moveButton.dataset.move);
  state.current = Number(item.dataset.index);
  renderList();
  renderEditor();
});

sortable(listEl, "li", (from, to) => {
  const current = currentProject();
  move(state.content.projects, from, to);
  state.current = state.content.projects.indexOf(current);
  touch(null);
});

// Réordonne par glisser-déposer les éléments `selector` de `container`.
function sortable(container, selector, onMove) {
  let from = null;
  container.addEventListener("dragstart", (event) => {
    const item = event.target.closest(selector);
    if (!item) return;
    from = Number(item.dataset.index);
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/x-cms-index", String(from));
  });
  container.addEventListener("dragover", (event) => {
    const item = event.target.closest(selector);
    if (from === null || !item) return;
    event.preventDefault();
    container.querySelectorAll(".is-over").forEach((el) => el !== item && el.classList.remove("is-over"));
    item.classList.add("is-over");
  });
  container.addEventListener("drop", (event) => {
    const item = event.target.closest(selector);
    if (from === null || !item) return;
    event.preventDefault();
    const to = Number(item.dataset.index);
    if (to !== from) onMove(from, to);
  });
  container.addEventListener("dragend", () => {
    from = null;
    container.querySelectorAll(".is-over, .is-dragging").forEach((el) => el.classList.remove("is-over", "is-dragging"));
  });
}

/* ---------- Éditeur d'un projet ---------- */

function renderEditor() {
  const project = currentProject();
  if (!project) {
    editorEl.innerHTML = `<p class="empty">Aucun projet. Créez-en un avec « + Nouveau projet ».</p>`;
    return;
  }
  const categories = Object.entries(state.content.categories);
  const partner = project.partner ?? {};

  editorEl.innerHTML = `
    <section class="card">
      <label class="field">
        <span class="field__label">Titre <code>project__title</code></span>
        <input class="input input--title" name="title" value="${escapeHtml(project.title)}" required />
      </label>
      <div class="field">
        <span class="field__label">Catégories</span>
        <div class="chips">
          ${categories
            .map(
              ([key, category]) => `<label class="chip" style="--dot: ${category.color}">
                <input type="checkbox" name="category" value="${key}" ${project.categories.includes(key) ? "checked" : ""} />
                <span class="chip__dot"></span>${escapeHtml(category.label)}
              </label>`
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Textes</h2>
      <label class="field">
        <span class="field__label">Résumé <code>project__summary</code></span>
        <input class="input" name="summary" value="${escapeHtml(project.summary)}" />
      </label>
      <div class="field">
        <span class="field__label">Méta <code>project__meta</code></span>
        <div class="row">
          <input class="input" name="prefix" list="prefixes" placeholder="pour le" value="${escapeHtml(partner.prefix)}" aria-label="Préfixe" />
          <input class="input" name="partner" placeholder="Partenaire ou commanditaire" value="${escapeHtml(partner.name)}" aria-label="Partenaire" />
          <input class="input" name="year" placeholder="Année" value="${escapeHtml(project.year)}" aria-label="Année" />
        </div>
        <datalist id="prefixes">${PREFIXES.map((prefix) => `<option value="${escapeHtml(prefix)}"></option>`).join("")}</datalist>
        <p class="preview-meta" data-meta-preview>${escapeHtml(metaLine(project)) || "—"}</p>
      </div>
      <label class="field">
        <span class="field__label">Description <code>project__body</code></span>
        <textarea class="input" name="body">${escapeHtml(project.body)}</textarea>
        <p class="field__help">Laisser une ligne vide entre deux paragraphes.</p>
      </label>
    </section>

    <section class="card">
      <h2>Images</h2>
      <p class="field__help" style="margin: -0.5rem 0 0.9rem">Glisser les images pour les réordonner. ★ choisit la couverture (grille des projets).</p>
      <ol class="gallery" data-gallery></ol>
      <label class="dropzone" data-drop="images">
        <input type="file" accept="image/*,.tif,.tiff,.svg" multiple />
        <span>Déposer des images ici ou <u>parcourir</u><br /><small>JPG, PNG, TIFF, GIF animé… en pleine résolution</small></span>
      </label>
    </section>

    <section class="card">
      <h2>Sticker</h2>
      <div class="sticker" data-sticker></div>
      <p class="field__help">PNG détouré sur fond transparent (environ 1500 px de large). Le contour blanc est ajouté automatiquement.
        Sans sticker, la couverture est affichée façon photo.</p>
    </section>

    <details class="card">
      <summary>Plus d’options</summary>
      <label class="field">
        <span class="field__label">Identifiant (adresse de la page)</span>
        <input class="input" name="slug" value="${escapeHtml(project.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <p class="field__help">#/projet/<span data-slug-preview>${escapeHtml(project.slug)}</span> — le changer casse les liens déjà partagés.</p>
      </label>
      <label class="field">
        <span class="field__label">Crédits</span>
        <input class="input" name="credits" value="${escapeHtml(project.credits)}" placeholder="Photographies : …" />
      </label>
    </details>

    <div class="actions">
      <button class="button button--primary" type="button" data-save>Enregistrer</button>
      <a class="bar__link" href="/#/projet/${escapeHtml(project.slug)}" target="_blank" rel="noopener" data-view>Voir la page</a>
      <button class="button button--danger" type="button" data-delete>Supprimer le projet</button>
    </div>`;

  renderGallery();
  renderSticker();
  setBusy(state.busy);
}

function renderGallery() {
  const project = currentProject();
  const gallery = $("[data-gallery]", editorEl);
  const cover = project.images.includes(project.cover) ? project.cover : project.images[0];
  gallery.innerHTML = project.images
    .map(
      (name, index) => `<li class="thumb" draggable="true" data-index="${index}">
        <div class="thumb__frame">
          <img src="${escapeHtml(previewUrl(project.slug, project.folder, name))}" alt="" loading="lazy"
            onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Aperçu après enregistrement' }))" />
        </div>
        <span class="thumb__index">${index + 1}</span>
        ${name === cover ? `<span class="thumb__cover">Couverture</span>` : ""}
        <div class="thumb__tools">
          <button class="icon-button${name === cover ? " is-on" : ""}" type="button" data-cover title="Utiliser comme couverture">★</button>
          <button class="icon-button" type="button" data-left title="Avancer" ${index === 0 ? "hidden" : ""}>←</button>
          <button class="icon-button" type="button" data-right title="Reculer" ${index === project.images.length - 1 ? "hidden" : ""}>→</button>
          <button class="icon-button" type="button" data-remove title="Retirer du projet">×</button>
        </div>
        <span class="thumb__name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      </li>`
    )
    .join("");
}

function renderSticker() {
  const project = currentProject();
  const box = $("[data-sticker]", editorEl);
  box.innerHTML = `
    ${
      project.sticker
        ? `<div class="thumb">
            <div class="thumb__frame"><img src="${escapeHtml(previewUrl(STICKER_FOLDER, STICKER_FOLDER, project.sticker))}" alt=""
              onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Aperçu après enregistrement' }))" /></div>
            <div class="thumb__tools"><button class="icon-button" type="button" data-remove-sticker title="Retirer le sticker">×</button></div>
            <span class="thumb__name" title="${escapeHtml(project.sticker)}">${escapeHtml(project.sticker)}</span>
          </div>`
        : ""
    }
    <label class="dropzone" data-drop="sticker">
      <input type="file" accept="image/png,image/webp,.png,.webp" />
      <span>${project.sticker ? "Remplacer le sticker" : "Déposer le sticker ici ou <u>parcourir</u>"}</span>
    </label>`;
}

/* Saisie : le modèle est mis à jour sans re-rendre le formulaire (le curseur reste en place). */
editorEl.addEventListener("input", (event) => {
  const project = currentProject();
  const { name, value } = event.target;
  if (!project || !name) return;

  if (name === "title") {
    project.title = value;
    if (state.fresh.has(project)) setSlug(project, uniqueSlug(slugify(value), project));
  } else if (name === "summary" || name === "body" || name === "year" || name === "credits") {
    project[name] = value;
  } else if (name === "prefix" || name === "partner") {
    project.partner ??= { prefix: "", name: "" };
    project.partner[name === "prefix" ? "prefix" : "name"] = value;
  } else if (name === "category") {
    project.categories = [...editorEl.querySelectorAll('[name="category"]:checked')].map((input) => input.value);
  } else if (name === "slug") {
    state.fresh.delete(project);
    project.slug = value;
    $("[data-slug-preview]", editorEl).textContent = value;
  } else {
    return;
  }
  $("[data-meta-preview]", editorEl).textContent = metaLine(project) || "—";
  touch(project);
});

function setSlug(project, slug) {
  project.slug = slug;
  const field = $('[name="slug"]', editorEl);
  if (field) field.value = slug;
  const preview = $("[data-slug-preview]", editorEl);
  if (preview) preview.textContent = slug;
}

editorEl.addEventListener("click", (event) => {
  const project = currentProject();
  const button = event.target.closest("button");
  if (!project || !button) return;
  const index = Number(button.closest("[data-index]")?.dataset.index);

  if (button.matches("[data-cover]")) {
    project.cover = project.images[index];
  } else if (button.matches("[data-left]")) {
    move(project.images, index, index - 1);
  } else if (button.matches("[data-right]")) {
    move(project.images, index, index + 1);
  } else if (button.matches("[data-remove]")) {
    project.images.splice(index, 1);
  } else if (button.matches("[data-remove-sticker]")) {
    project.sticker = "";
    renderSticker();
    return touch(project);
  } else if (button.matches("[data-save]")) {
    return save();
  } else if (button.matches("[data-delete]")) {
    return removeProject(project);
  } else {
    return;
  }
  renderGallery();
  touch(project);
});

// Réordonnancement des images par glisser-déposer.
sortable(editorEl, ".gallery .thumb", (from, to) => {
  move(currentProject().images, from, to);
  renderGallery();
  touch();
});

/* ---------- Envoi d'images ---------- */

async function upload(folder, file) {
  const query = new URLSearchParams({ folder, name: file.name });
  const { name } = await api(`upload?${query}`, { method: "POST", body: file });
  state.previews.set(imageKey(folder, name), URL.createObjectURL(file));
  return name;
}

async function addFiles(kind, files) {
  const project = currentProject();
  files = [...files].filter((file) => file.type.startsWith("image/") || /\.(tiff?|svg)$/i.test(file.name));
  if (!project || !files.length) return;
  if (!project.title.trim()) return toast("Donnez d’abord un titre au projet.", { error: true });

  try {
    if (kind === "sticker") {
      toast("Envoi du sticker…", { duration: 0 });
      project.sticker = await upload(STICKER_FOLDER, files[0]);
      renderSticker();
    } else {
      if (!project.folder) project.folder = project.slug;
      for (const [index, file] of files.entries()) {
        toast(`Envoi des images… ${index + 1}/${files.length}`, { duration: 0 });
        project.images.push(await upload(project.folder, file));
        renderGallery();
      }
    }
    touch(project);
    toast("Images ajoutées. Pensez à enregistrer.");
  } catch (error) {
    toast(`Envoi impossible : ${error.message}`, { error: true });
  }
}

editorEl.addEventListener("change", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (zone && event.target.files?.length) {
    addFiles(zone.dataset.drop, event.target.files);
    event.target.value = "";
  }
});

editorEl.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (!zone || !event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  zone.classList.add("is-over");
});
editorEl.addEventListener("dragleave", (event) => event.target.closest?.("[data-drop]")?.classList.remove("is-over"));
editorEl.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (!zone || !event.dataTransfer.files.length) return;
  event.preventDefault();
  zone.classList.remove("is-over");
  addFiles(zone.dataset.drop, event.dataTransfer.files);
});

/* ---------- Création, suppression ---------- */

$("[data-new]").addEventListener("click", () => {
  const project = {
    slug: "",
    title: "Nouveau projet",
    year: String(new Date().getFullYear()),
    categories: [],
    summary: "",
    partner: { prefix: "", name: "" },
    body: "",
    folder: "",
    cover: "",
    sticker: "",
    images: [],
    links: []
  };
  project.slug = uniqueSlug(slugify(project.title), project);
  state.content.projects.unshift(project);
  state.fresh.add(project);
  state.current = 0;
  searchEl.value = "";
  touch(project);
  revealCurrent();
  renderEditor();
  const title = $('[name="title"]', editorEl);
  title.focus();
  title.select();
});

async function removeProject(project) {
  const choice = await ask({
    title: `Supprimer « ${project.title} » ?`,
    html: `<p>Le projet disparaîtra du site après enregistrement et publication. Les fichiers originaux restent dans <code>data/</code>.</p>`,
    actions: [
      { label: "Annuler", value: "cancel" },
      { label: "Supprimer", value: "delete", kind: "button--primary" }
    ]
  });
  if (choice !== "delete") return;
  state.content.projects.splice(state.content.projects.indexOf(project), 1);
  state.current = Math.min(state.current, state.content.projects.length - 1);
  touch(null);
  renderEditor();
}

/* ---------- Enregistrement, optimisation, publication ---------- */

async function save() {
  if (state.busy) return false;
  const titleless = state.content.projects.find((project) => !project.title.trim());
  if (titleless) {
    toast("Un projet n’a pas de titre.", { error: true });
    return false;
  }
  setBusy(true);
  try {
    state.content.projects.forEach(tidy);
    toast("Enregistrement…", { duration: 0 });
    await api("content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.content) });
    state.dirty = false;
    state.edited = new WeakSet();
    state.fresh = new WeakSet();
    renderList();

    toast("Optimisation des images… (peut prendre une minute pour de nouvelles images)", { duration: 0 });
    const result = await api("optimize", { method: "POST" });
    if (result.images) state.images = normalizeKeys(result.images);
    if (!result.ok) {
      toast("Le texte est enregistré, mais l’optimisation des images a échoué.", { error: true });
      await ask({
        title: "Optimisation des images impossible",
        html: `<pre>${escapeHtml(result.output)}</pre>`,
        actions: [{ label: "Fermer", value: "ok" }]
      });
      return false;
    }
    toast("Enregistré.");
    if (currentProject()) {
      renderGallery();
      renderSticker();
      $("[data-view]", editorEl).href = `/#/projet/${currentProject().slug}`;
    }
    return true;
  } catch (error) {
    toast(`Enregistrement impossible : ${error.message}`, { error: true });
    return false;
  } finally {
    setBusy(false);
    refreshStatus();
  }
}

$("[data-publish]").addEventListener("click", async () => {
  if (state.busy) return;
  if (state.dirty && !(await save())) return;

  const status = await api("status");
  if (!status.changes.length && !status.ahead) return toast("Tout est déjà publié.");

  const choice = await ask({
    title: "Publier sur GitHub",
    html: `
      <p>${status.changes.length} fichier(s) modifié(s) seront envoyés sur la branche <strong>${escapeHtml(status.branch)}</strong>.
        Le site sera mis à jour automatiquement quelques minutes après.</p>
      ${status.changes.length ? `<ul>${status.changes.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul>` : ""}
      <label class="field">
        <span class="field__label">Description de la modification</span>
        <input class="input" name="message" value="Mise à jour du contenu" data-message />
      </label>`,
    actions: [
      { label: "Annuler", value: "cancel" },
      { label: "Publier", value: "publish", kind: "button--primary" }
    ]
  });
  if (choice !== "publish") return;
  const message = $("[data-message]", dialogEl).value;

  setBusy(true);
  toast("Publication en cours…", { duration: 0 });
  try {
    const result = await api("publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    if (result.ok) {
      toast("Publié ! Le site sera à jour dans quelques minutes.", { duration: 6000 });
    } else {
      toast("La publication a échoué.", { error: true });
      await ask({
        title: "La publication a échoué",
        html: `<p>${escapeHtml(result.error)}</p><pre>${escapeHtml(result.log)}</pre>`,
        actions: [{ label: "Fermer", value: "ok" }]
      });
    }
  } catch (error) {
    toast(`Publication impossible : ${error.message}`, { error: true });
  } finally {
    setBusy(false);
    refreshStatus();
  }
});

/* ---------- État ---------- */

let lastStatus = null;

async function refreshStatus() {
  try {
    lastStatus = await api("status");
  } catch {
    lastStatus = null;
  }
  updateStatusDirty();
}

function updateStatusDirty() {
  let text = "Tout est publié";
  let pending = false;
  if (state.dirty) {
    text = "Modifications non enregistrées";
    pending = true;
  } else if (lastStatus && (lastStatus.changes.length || lastStatus.ahead)) {
    text = "Enregistré, pas encore publié";
    pending = true;
  } else if (!lastStatus) {
    text = "";
  }
  statusEl.textContent = text;
  statusEl.classList.toggle("is-pending", pending);
}

function normalizeKeys(images) {
  return Object.fromEntries(Object.entries(images).map(([key, value]) => [key.normalize("NFC"), value]));
}

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    save();
  } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    moveCurrent(event.key === "ArrowUp" ? "up" : "down");
  }
});

/* ---------- Démarrage ---------- */

try {
  const { content, images } = await api("content");
  state.content = content;
  state.images = normalizeKeys(images);
  renderList();
  renderEditor();
  refreshStatus();
} catch (error) {
  editorEl.innerHTML = `<p class="empty">Le contenu n’a pas pu être chargé : ${escapeHtml(error.message)}</p>`;
}
