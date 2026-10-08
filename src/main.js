import { glyphs } from "./glyphs.js";

const view = document.querySelector(".view");
const header = document.querySelector(".site-header");
const lightbox = document.querySelector(".lightbox");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  site: null,
  categories: {},
  projects: [],
  images: {},
  filter: null,
  route: null
};

/* ---------- Utilitaires ---------- */

function escapeHtml(value = "") {
  return String(value)
    // Typographie française : espaces insécables autour de « » et avant : ; ? !
    .replace(/« /g, "« ")
    .replace(/ ([»:;?!])/g, " $1")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function glyph(name, className = "") {
  const shape = glyphs[name];
  if (!shape) {
    return "";
  }
  return `<svg class="glyph ${className}" viewBox="0 0 ${shape.w} ${shape.h}" aria-hidden="true" focusable="false"><path d="${shape.d}"/></svg>`;
}

function hash(value) {
  let result = 0;
  for (const char of value) {
    result = (result * 31 + char.codePointAt(0)) | 0;
  }
  return Math.abs(result);
}

function paragraphs(text = "") {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function imageMeta(project, file) {
  return state.images[`${project.slug}/${file.normalize("NFC")}`];
}

function media(meta, { sizes = "100vw", alt = "", eager = false } = {}) {
  if (!meta) {
    return "";
  }
  const srcset = meta.srcset.map((source) => `${source.src} ${source.w}w`).join(", ");
  const fallback = meta.srcset.at(-1).src;
  return `<figure class="media" style="aspect-ratio: ${meta.w} / ${meta.h}; --lqip: url('${meta.lqip}'); background-color: ${meta.color}">
    <img src="${fallback}" srcset="${srcset}" sizes="${sizes}" width="${meta.w}" height="${meta.h}" alt="${escapeHtml(alt)}"
      loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""} />
  </figure>`;
}

function revealImages(root) {
  root.querySelectorAll(".media img").forEach((image) => {
    if (image.complete && image.naturalWidth) {
      image.classList.add("is-loaded");
    } else {
      image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    }
  });
}

function categoryColor(key) {
  return state.categories[key]?.color ?? "var(--ink)";
}

function setTitle(title) {
  document.title = title ? `${title} — ${state.site.name}` : `${state.site.name} — illustration, édition, didactique`;
}

/* ---------- Accueil ---------- */

function filterButtons() {
  const used = new Set(state.projects.flatMap((project) => project.categories));
  const keys = Object.keys(state.categories).filter((key) => used.has(key));
  return keys
    .map((key, index) => {
      const category = state.categories[key];
      const pressed = state.filter === key;
      const separator = index === keys.length - 1 ? "." : ",";
      const label = index === 0 ? category.label : category.label.toLowerCase();
      return `<li><button class="filter" type="button" data-filter="${key}" aria-pressed="${pressed}" style="--accent: ${category.color}">
        <span class="filter__glyph">${glyph(category.glyph)}</span><span class="filter__label">${escapeHtml(label)}</span></button><span class="filter__sep" aria-hidden="true">${separator}</span></li>`;
    })
    .join("");
}

function card(project) {
  const tilt = ((hash(project.slug) % 7) - 3) * 0.45;
  const glyphsHtml = project.categories
    .map((key) => {
      const category = state.categories[key];
      return category
        ? `<span title="${escapeHtml(category.label)}" style="--c: ${category.color}; display: contents">${glyph(category.glyph)}</span>`
        : "";
    })
    .join("");
  const cover = project.cover ? imageMeta(project, project.cover) : null;
  const visual = cover
    ? media(cover, {
        sizes: "(max-width: 600px) 92vw, (max-width: 1100px) 46vw, 31vw",
        alt: project.title
      })
    : `<div class="media"><div class="card__poster">${glyph(state.categories[project.categories[0]]?.glyph ?? "pasteque")}<span>En cours · ${escapeHtml(project.year)}</span></div></div>`;

  return `<a class="card${cover ? "" : " card--text"}" href="#/projet/${project.slug}" style="--tilt: ${tilt}deg">
    ${visual}
    <div class="card__meta">
      <h2 class="card__title">${escapeHtml(project.title)}</h2>
      <span class="card__year">${escapeHtml(project.year)}</span>
      ${project.summary ? `<p class="card__summary">${escapeHtml(project.summary)}</p>` : ""}
      <span class="card__glyphs">${glyphsHtml}</span>
    </div>
  </a>`;
}

function columnCount() {
  if (window.matchMedia("(min-width: 1100px)").matches) return 3;
  if (window.matchMedia("(min-width: 601px)").matches) return 2;
  return 1;
}

function layoutMasonry() {
  const container = view.querySelector(".masonry");
  const status = view.querySelector(".index__status");
  if (!container) {
    return;
  }

  const visible = state.projects.filter((project) => !state.filter || project.categories.includes(state.filter));
  const count = Math.min(columnCount(), Math.max(1, visible.length));
  const columns = Array.from({ length: count }, () => ({ height: 0, html: [] }));

  // Placement « au plus court » : garde l'ordre de lecture tout en équilibrant les colonnes.
  visible.forEach((project) => {
    const cover = project.cover ? imageMeta(project, project.cover) : null;
    const ratio = cover ? cover.h / cover.w : 1.25;
    const target = columns.reduce((min, column) => (column.height < min.height - 0.05 ? column : min), columns[0]);
    target.html.push(card(project));
    target.height += ratio + 0.35;
  });

  if (!visible.length) {
    container.innerHTML = `<div class="empty-state"><p>Aucun projet ici pour l’instant.</p><button type="button" data-filter-reset>Tout afficher</button></div>`;
  } else {
    container.innerHTML = columns.map((column) => `<div class="masonry__col">${column.html.join("")}</div>`).join("");
  }

  if (status) {
    const label = state.filter ? state.categories[state.filter].label : null;
    status.textContent = label
      ? `${visible.length} projet${visible.length > 1 ? "s" : ""} · ${label}`
      : `${visible.length} projets`;
  }

  revealImages(container);
}

function renderHome() {
  setTitle();
  const site = state.site;
  view.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      <h1 class="hero__title" id="hero-title">
        <span class="hero__ornament hero__ornament--a">${glyph("fleuron5")}</span>
        <span>Iona</span><span>Sagnelonge</span>
        <span class="hero__ornament hero__ornament--b">${glyph("fleuron7")}</span>
        <span class="hero__ornament hero__ornament--c">${glyph("cerise")}</span>
      </h1>
      <div class="hero__intro">
        <p class="hero__lead">${escapeHtml(site.bio[0])}</p>
        <ul class="filters"${state.filter ? " data-active" : ""} aria-label="Filtrer les projets par discipline">${filterButtons()}</ul>
        <p class="hero__hint">${matchMedia("(hover: hover)").matches ? "Promenez la souris pour semer" : "Touchez la page pour semer"}</p>
      </div>
    </section>
    <section class="index" id="projets" aria-label="Projets">
      <p class="index__status" aria-live="polite"></p>
      <div class="masonry"></div>
    </section>`;
  layoutMasonry();
}

function setFilter(key) {
  state.filter = state.filter === key ? null : key;
  const list = view.querySelector(".filters");
  list?.toggleAttribute("data-active", Boolean(state.filter));
  list?.querySelectorAll(".filter").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
  });

  const update = () => layoutMasonry();
  if (document.startViewTransition && !reducedMotion.matches) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

/* ---------- Projet ---------- */

function galleryRows(project) {
  const metas = project.images.map((file, index) => ({ file, index, meta: imageMeta(project, file) })).filter((item) => item.meta);
  const isPortrait = (item) => item.meta.h > item.meta.w * 1.05;
  const rows = [];

  for (let i = 0; i < metas.length; i += 1) {
    const current = metas[i];
    const next = metas[i + 1];
    if (isPortrait(current) && next && isPortrait(next)) {
      rows.push({ items: [current, next], kind: "pair" });
      i += 1;
    } else {
      rows.push({ items: [current], kind: isPortrait(current) ? "solo-portrait" : "solo" });
    }
  }
  return rows;
}

function galleryItem(project, item, sizes, eager) {
  return `<button class="gallery__item" type="button" data-index="${item.index}" aria-label="Agrandir l’image ${item.index + 1}">
    ${media(item.meta, { sizes, alt: `${project.title}, image ${item.index + 1}`, eager })}
  </button>`;
}

function renderGallery(project) {
  if (!project.images.length) {
    const names = project.categories.map((key) => state.categories[key]?.glyph).filter(Boolean);
    return `<div class="gallery__placeholder">
      <div class="gallery__placeholder-glyphs">${names.map((name) => glyph(name)).join("")}</div>
      <p>Projet en cours — images à venir</p>
    </div>`;
  }

  if (project.layout === "grid") {
    return `<div class="gallery gallery--grid">${project.images
      .map((file, index) => ({ file, index, meta: imageMeta(project, file) }))
      .filter((item) => item.meta)
      .map((item) => galleryItem(project, item, "(max-width: 600px) 46vw, (max-width: 900px) 31vw, 22vw", item.index < 3))
      .join("")}</div>`;
  }

  return `<div class="gallery">${galleryRows(project)
    .map((row, rowIndex) => {
      const sizes = row.kind === "pair" ? "(max-width: 600px) 46vw, (max-width: 900px) 46vw, 32vw" : "(max-width: 900px) 94vw, 66vw";
      const items = row.items.map((item) => galleryItem(project, item, sizes, rowIndex === 0)).join("");
      return `<div class="gallery__row gallery__row--${row.kind}" style="--cols: ${row.items.length}">${items}</div>`;
    })
    .join("")}</div>`;
}

function renderProject(slug) {
  const index = state.projects.findIndex((project) => project.slug === slug);
  if (index === -1) {
    location.replace("#/");
    return;
  }

  const project = state.projects[index];
  const next = state.projects[(index + 1) % state.projects.length];
  const nextCover = next.cover ? imageMeta(next, next.cover) : null;
  setTitle(project.title);

  const categories = project.categories
    .map((key) => state.categories[key])
    .filter(Boolean)
    .map(
      (category, i) =>
        `<li><a href="#/" data-filter-link="${project.categories[i]}" style="--c: ${category.color}">${glyph(category.glyph)}${escapeHtml(category.label)}</a></li>`
    )
    .join("");

  const links = (project.links ?? [])
    .map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a></li>`)
    .join("");

  view.innerHTML = `
    <article class="project">
      <div class="project__text">
        <a class="back" href="#/" data-back>${glyph("chenille")}<span>Tous les projets</span></a>
        ${project.year ? `<p class="project__year">${escapeHtml(project.year)}</p>` : ""}
        <h1 class="project__title">${escapeHtml(project.title)}</h1>
        ${project.summary ? `<p class="project__summary">${escapeHtml(project.summary)}</p>` : ""}
        ${categories ? `<ul class="project__cats" aria-label="Disciplines">${categories}</ul>` : ""}
        ${project.body ? `<div class="project__body">${paragraphs(project.body)}</div>` : ""}
        ${project.credits ? `<p class="project__credits">${escapeHtml(project.credits)}</p>` : ""}
        ${links ? `<ul class="project__links">${links}</ul>` : ""}
      </div>
      ${renderGallery(project)}
      <a class="next-project" href="#/projet/${next.slug}">
        <span class="next-project__label">Projet suivant</span>
        <span class="next-project__title">${escapeHtml(next.title)}</span>
        ${nextCover ? media(nextCover, { sizes: "11rem", alt: "" }) : ""}
      </a>
    </article>`;

  revealImages(view);
  view.querySelector(".project")._project = project;
}

/* ---------- Infos ---------- */

function renderInfos() {
  setTitle("Infos");
  const site = state.site;
  const contact = [
    site.email ? `<a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>` : "",
    site.instagram
      ? `<a href="https://www.instagram.com/${escapeHtml(site.instagram.replace(/^@/, ""))}/" target="_blank" rel="noopener">@${escapeHtml(site.instagram.replace(/^@/, ""))}</a>`
      : ""
  ].join("");

  const legend = Object.entries(state.categories)
    .map(([, category]) => `<li>${glyph(category.glyph)}${escapeHtml(category.label)}</li>`)
    .join("");

  view.innerHTML = `
    <section class="infos">
      <h1 class="infos__title">Bonjour ${glyph("coeur")}</h1>
      <div>
        <div class="infos__bio">${site.bio.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>
        ${contact ? `<div class="infos__contact">${contact}</div>` : ""}
        <ul class="infos__legend" aria-label="Légende des disciplines">${legend}</ul>
      </div>
      <div>
        <h2 class="infos__section-title">Repères</h2>
        <ol class="milestones">${site.milestones
          .map((item) => `<li><time>${escapeHtml(item.year)}</time><span>${escapeHtml(item.text)}</span></li>`)
          .join("")}</ol>
      </div>
    </section>`;
}

/* ---------- Routeur ---------- */

function parseRoute() {
  const path = location.hash.replace(/^#\/?/, "");
  const [section, slug] = path.split("/");
  if (section === "projet" && slug) return { name: "project", slug: decodeURIComponent(slug) };
  if (section === "infos") return { name: "infos" };
  return { name: "home" };
}

function render() {
  const previous = state.route;
  const route = parseRoute();
  state.route = route;

  if (route.name === "project") renderProject(route.slug);
  else if (route.name === "infos") renderInfos();
  else renderHome();

  document.body.dataset.view = route.name;
  document.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === route.name || (route.name === "project" && link.dataset.route === "home");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  sowing.setEnabled(route.name !== "project");

  // Retour à l'accueil depuis un projet : on revient sur la mosaïque, à hauteur du projet quitté.
  if (route.name === "home" && previous?.name === "project") {
    const target = view.querySelector(`.card[href="#/projet/${CSS.escape(previous.slug)}"]`);
    (target ?? view.querySelector(".index"))?.scrollIntoView({ block: "center" });
  } else {
    window.scrollTo(0, 0);
  }

  if (previous && !reducedMotion.matches) {
    view.classList.remove("is-entering");
    void view.offsetWidth;
    view.classList.add("is-entering");
  }
  if (previous) {
    view.focus({ preventScroll: true });
  }
  updateScrolled();
}

/* ---------- Visionneuse ---------- */

const lightboxState = { project: null, index: 0 };
const lightboxImage = lightbox.querySelector(".lightbox__image");
const lightboxCaption = lightbox.querySelector(".lightbox__caption");
const lightboxPrev = lightbox.querySelector(".lightbox__nav--prev");
const lightboxNext = lightbox.querySelector(".lightbox__nav--next");
lightboxPrev.innerHTML = glyph("chenille");
lightboxNext.innerHTML = glyph("chenille");

function showLightboxImage(index) {
  const { project } = lightboxState;
  const total = project.images.length;
  lightboxState.index = Math.max(0, Math.min(total - 1, index));
  const meta = imageMeta(project, project.images[lightboxState.index]);
  if (!meta) return;

  lightboxImage.classList.add("is-switching");
  const largest = meta.srcset.at(-1).src;
  const preload = new Image();
  preload.onload = preload.onerror = () => {
    lightboxImage.src = largest;
    lightboxImage.alt = `${project.title}, image ${lightboxState.index + 1}`;
    lightboxImage.classList.remove("is-switching");
  };
  preload.src = largest;

  lightboxCaption.textContent = `${project.title} — ${lightboxState.index + 1} / ${total}`;
  lightboxPrev.disabled = lightboxState.index === 0;
  lightboxNext.disabled = lightboxState.index === total - 1;

  // Précharge la suivante pour une navigation fluide.
  const following = imageMeta(project, project.images[lightboxState.index + 1] ?? "");
  if (following) new Image().src = following.srcset.at(-1).src;
}

function openLightbox(project, index) {
  lightboxState.project = project;
  lightboxImage.removeAttribute("src");
  showLightboxImage(index);
  lightbox.showModal();
}

lightboxPrev.addEventListener("click", () => showLightboxImage(lightboxState.index - 1));
lightboxNext.addEventListener("click", () => showLightboxImage(lightboxState.index + 1));
lightbox.querySelector(".lightbox__close").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox || event.target.classList.contains("lightbox__figure")) lightbox.close();
});
lightbox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") showLightboxImage(lightboxState.index - 1);
  if (event.key === "ArrowRight") showLightboxImage(lightboxState.index + 1);
});

let swipeStart = null;
lightbox.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY };
});
lightbox.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    showLightboxImage(lightboxState.index + (dx < 0 ? 1 : -1));
  }
});

/* ---------- Semis de glyphes ---------- */

const sowing = (() => {
  const canvas = document.querySelector(".sowing");
  const context = canvas.getContext("2d");
  const names = ["cerise", "champignon", "citron", "gland", "mirabelles", "raisin", "carotte", "chou", "fleuron2", "fleuron4", "fleuron6", "fleuron8", "fraise", "poire", "peche", "myrtilles", "coeur"];
  const paths = new Map(names.map((name) => [name, new Path2D(glyphs[name].d)]));
  const sprouts = [];
  let enabled = true;
  let frame = 0;
  let last = null;
  let ratio = 1;
  let colors = ["#2626b8"];

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
  }

  function spawn(x, y) {
    const name = names[Math.floor(Math.random() * names.length)];
    const shape = glyphs[name];
    sprouts.push({
      x,
      y,
      name,
      size: 18 + Math.random() * 22,
      w: shape.w,
      h: shape.h,
      rotation: (Math.random() - 0.5) * 0.9,
      color: colors[Math.floor(Math.random() * colors.length)],
      born: performance.now(),
      life: 2600 + Math.random() * 1600
    });
    if (sprouts.length > 70) sprouts.shift();
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function draw(now) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = sprouts.length - 1; i >= 0; i -= 1) {
      const sprout = sprouts[i];
      const age = (now - sprout.born) / sprout.life;
      if (age >= 1) {
        sprouts.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, age * 6);
      const scale = (1 - (1 - grow) ** 3) * (sprout.size / Math.max(sprout.w, sprout.h));
      const alpha = age > 0.6 ? 1 - (age - 0.6) / 0.4 : 1;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.translate(sprout.x, sprout.y);
      context.rotate(sprout.rotation + Math.sin(age * 6) * 0.05);
      context.scale(scale, scale);
      context.translate(-sprout.w / 2, -sprout.h);
      context.globalAlpha = alpha;
      context.fillStyle = sprout.color;
      context.fill(paths.get(sprout.name));
    }
    context.globalAlpha = 1;
    frame = sprouts.length ? requestAnimationFrame(draw) : 0;
  }

  function onMove(event) {
    if (!enabled || reducedMotion.matches || lightbox.open) return;
    const point = { x: event.clientX, y: event.clientY };
    const spacing = event.pointerType === "touch" ? 55 : 70;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < spacing) return;
    // Le canvas est sous le contenu : les glyphes n'apparaissent que sur le papier.
    last = point;
    spawn(point.x, point.y + 10);
  }

  function onTap(event) {
    if (event.pointerType !== "touch" || !enabled || reducedMotion.matches) return;
    if (event.target.closest(".media, a, button")) return;
    for (let i = 0; i < 3; i += 1) {
      spawn(event.clientX + (Math.random() - 0.5) * 60, event.clientY + (Math.random() - 0.5) * 40);
    }
  }

  return {
    init(categories) {
      colors = ["#2626b8", "#2626b8", ...Object.values(categories).map((category) => category.color)];
      resize();
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onTap, { passive: true });
    },
    setEnabled(value) {
      enabled = value;
      if (!value) {
        sprouts.length = 0;
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };
})();

/* ---------- Événements globaux ---------- */

function updateScrolled() {
  document.body.classList.toggle("is-scrolled", window.scrollY > window.innerHeight * 0.35);
}

document.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    setFilter(filterButton.dataset.filter);
    return;
  }

  if (event.target.closest("[data-filter-reset]")) {
    setFilter(state.filter);
    return;
  }

  const filterLink = event.target.closest("[data-filter-link]");
  if (filterLink) {
    event.preventDefault();
    state.filter = filterLink.dataset.filterLink;
    location.hash = "#/";
    requestAnimationFrame(() => view.querySelector(".index")?.scrollIntoView({ behavior: "smooth" }));
    return;
  }

  const galleryButton = event.target.closest(".gallery__item");
  if (galleryButton) {
    const project = view.querySelector(".project")?._project;
    if (project) openLightbox(project, Number(galleryButton.dataset.index));
    return;
  }

  if (event.target.closest(".skip-link")) {
    event.preventDefault();
    view.focus();
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("scroll", updateScrolled, { passive: true });

let lastColumns = columnCount();
window.addEventListener("resize", () => {
  const columns = columnCount();
  if (columns !== lastColumns && state.route?.name === "home") {
    lastColumns = columns;
    layoutMasonry();
  }
});

document.querySelector("[data-year]").textContent = new Date().getFullYear();
document.querySelector(".site-footer__crawler").innerHTML = glyph("chenille");

/* ---------- Démarrage ---------- */

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : ${response.status}`);
  return response.json();
}

try {
  const [content, images] = await Promise.all([loadJson("content/projects.json"), loadJson("content/images.json")]);
  state.site = content.site;
  state.categories = content.categories;
  state.projects = content.projects;
  state.images = Object.fromEntries(Object.entries(images).map(([key, value]) => [key.normalize("NFC"), value]));
  sowing.init(state.categories);
  render();
} catch (error) {
  console.error(error);
  view.innerHTML = `<p style="padding: 2rem">Le contenu n’a pas pu être chargé.</p>`;
}
