import { glyphs } from "./glyphs.js";

const view = document.querySelector(".view");
const lightbox = document.querySelector(".lightbox");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  site: null,
  home: null,
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

function paragraphs(text = "") {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function imageMeta(slug, file) {
  return state.images[`${slug}/${String(file).normalize("NFC")}`];
}

function srcsetOf(meta) {
  return meta.srcset.map((source) => `${source.src} ${source.w}w`).join(", ");
}

function imgTag(meta, { sizes = "100vw", alt = "", eager = false, className = "" } = {}) {
  return `<img class="${className}" src="${meta.srcset.at(-1).src}" srcset="${srcsetOf(meta)}" sizes="${sizes}" width="${meta.w}" height="${meta.h}" alt="${escapeHtml(alt)}"
    loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""} />`;
}

function placeholderStyle(meta) {
  return `--lqip: url('${meta.lqip}'); background-color: ${meta.color}`;
}

function media(meta, options = {}) {
  if (!meta) {
    return "";
  }
  return `<figure class="media" style="aspect-ratio: ${meta.w} / ${meta.h}; ${placeholderStyle(meta)}">${imgTag(meta, options)}</figure>`;
}

function revealImages(root) {
  root.querySelectorAll("img").forEach((image) => {
    if (image.complete && image.naturalWidth) {
      image.classList.add("is-loaded");
    } else {
      image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    }
  });
}

function capturePointer(element, event) {
  try {
    element.setPointerCapture(event.pointerId);
  } catch {
    // Pointeur déjà relâché : rien à capturer.
  }
}

function setTitle(title) {
  document.title = title ? `${title} — ${state.site.name}` : `${state.site.name} — illustration, édition, didactique`;
}

function categoryLabels(project) {
  return project.categories
    .map((key) => state.categories[key]?.label)
    .filter(Boolean)
    .join(", ");
}

/* ---------- Accueil : carrousel ---------- */

function homeSlides() {
  // Photos choisies dans data/accueil/ (projects.json > home.images), sinon les couvertures des projets.
  const chosen = (state.home?.images ?? [])
    .map((item) => (typeof item === "string" ? { file: item } : item))
    .map((item) => ({
      meta: imageMeta("accueil", item.file),
      project: state.projects.find((project) => project.slug === item.project)
    }))
    .filter((slide) => slide.meta);

  if (chosen.length) {
    return chosen;
  }

  return state.projects
    .filter((project) => project.cover)
    .map((project) => ({ meta: imageMeta(project.slug, project.cover), project }))
    .filter((slide) => slide.meta);
}

function renderHome() {
  setTitle();
  const slides = homeSlides();
  const cardHtml = (slide, index) => {
    const tag = slide.project ? "a" : "div";
    const href = slide.project ? ` href="#/projet/${slide.project.slug}"` : "";
    const label = slide.project ? ` data-label="${escapeHtml(slide.project.title)}" aria-label="${escapeHtml(slide.project.title)}"` : "";
    return `<li class="deck__slot">
      <${tag} class="deck__card"${href}${label} draggable="false" data-index="${index}">
        <span class="deck__image" style="${placeholderStyle(slide.meta)}">
          ${imgTag(slide.meta, { sizes: "(max-width: 600px) 92vw, (max-width: 1000px) 31vw, 23vw", alt: "", eager: index < 8 })}
        </span>
      </${tag}>
      ${slide.project ? `<span class="deck__caption" aria-hidden="true">${escapeHtml(slide.project.title)}</span>` : ""}
    </li>`;
  };

  view.innerHTML = `
    <h1 class="visually-hidden">Iona Sagnelonge — portfolio</h1>
    <ul class="deck" aria-label="Projets">${slides.map(cardHtml).join("")}</ul>
    <button class="deck__tidy" type="button" hidden><span class="nav-word">ranger</span></button>`;

  revealImages(view);
  deck.mount(view.querySelector(".deck"));
}

/* Collection de cartes : grille régulière, cartes attrapables et lançables à la souris */
const deck = (() => {
  const tooltip = document.createElement("span");
  tooltip.className = "deck__tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  document.body.append(tooltip);

  const canDrag = window.matchMedia("(hover: hover) and (pointer: fine)");
  let root = null;
  let cards = [];
  let topZ = 10;

  function render(card) {
    const s = card._state;
    card.style.setProperty("--x", `${s.x}px`);
    card.style.setProperty("--y", `${s.y}px`);
    card.style.setProperty("--tilt", `${s.tilt}deg`);
  }

  function showTooltip(card, event) {
    if (!card.dataset.label || !canDrag.matches) return;
    tooltip.textContent = card.dataset.label;
    tooltip.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 16}px)`;
    tooltip.classList.add("is-visible");
  }

  function hideTooltip() {
    tooltip.classList.remove("is-visible");
  }

  function glide(card) {
    const s = card._state;
    cancelAnimationFrame(s.frame);
    const step = () => {
      s.vx *= 0.9;
      s.vy *= 0.9;
      s.x += s.vx;
      s.y += s.vy;
      s.tilt += (s.rest - s.tilt) * 0.12;
      render(card);
      if (Math.abs(s.vx) + Math.abs(s.vy) > 0.3 || Math.abs(s.rest - s.tilt) > 0.1) {
        s.frame = requestAnimationFrame(step);
      }
    };
    s.frame = requestAnimationFrame(step);
  }

  function bind(card) {
    card._state = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, rest: 0, frame: 0 };
    let drag = null;

    card.addEventListener("dragstart", (event) => event.preventDefault());
    card.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse") showTooltip(card, event);
      if (!drag) return;
      const s = card._state;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.moved += Math.hypot(dx, dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      if (drag.moved < 5) return;
      if (!drag.started) {
        drag.started = true;
        card.classList.add("is-grabbed");
        view.querySelector(".deck__tidy").hidden = false;
      }
      s.x += dx;
      s.y += dy;
      s.vx = dx;
      s.vy = dy;
      // La carte penche dans le sens du mouvement.
      s.tilt = Math.max(-14, Math.min(14, s.rest + dx * 0.6));
      render(card);
    });
    card.addEventListener("pointerleave", hideTooltip);
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !canDrag.matches) return;
      cancelAnimationFrame(card._state.frame);
      drag = { lastX: event.clientX, lastY: event.clientY, moved: 0, started: false };
      topZ += 1;
      card.style.zIndex = String(topZ);
      capturePointer(card, event);
    });
    const release = () => {
      if (!drag) return;
      const { started } = drag;
      drag = null;
      card.classList.remove("is-grabbed");
      if (started) {
        // Après un lancer, on ne suit pas le lien.
        card.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
        card._state.rest = (Math.random() - 0.5) * 8;
        glide(card);
      }
    };
    card.addEventListener("pointerup", release);
    card.addEventListener("pointercancel", release);
  }

  function tidy() {
    cards.forEach((card) => {
      cancelAnimationFrame(card._state.frame);
      Object.assign(card._state, { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, rest: 0 });
      card.classList.add("is-tidying");
      render(card);
      setTimeout(() => card.classList.remove("is-tidying"), 800);
    });
    view.querySelector(".deck__tidy").hidden = true;
  }

  window.addEventListener("hashchange", hideTooltip);
  window.addEventListener("scroll", hideTooltip, { passive: true });

  return {
    mount(element) {
      root = element;
      cards = [...root.querySelectorAll(".deck__card")];
      cards.forEach(bind);
      view.querySelector(".deck__tidy").addEventListener("click", tidy);
    }
  };
})();


/* ---------- Projets ---------- */

function projectCard(project) {
  const cover = project.cover ? imageMeta(project.slug, project.cover) : null;
  const visual = cover
    ? `<div class="card__image" style="${placeholderStyle(cover)}">${imgTag(cover, {
        sizes: "(max-width: 600px) 92vw, (max-width: 1000px) 46vw, 31vw",
        alt: project.title
      })}</div>`
    : `<div class="card__image card__image--text">${glyph(state.categories[project.categories[0]]?.glyph ?? "pasteque")}<span>En cours</span></div>`;

  return `<a class="card" href="#/projet/${project.slug}" data-categories="${project.categories.join(" ")}">
    <div class="card__frame">
      ${visual}
      <span class="card__veil" aria-hidden="true"></span>
    </div>
    <h2 class="card__title"><span class="card__title-text">${escapeHtml(project.title)}</span></h2>
    <p class="card__meta">${escapeHtml(categoryLabels(project))}${project.year ? ` · ${escapeHtml(project.year)}` : ""}</p>
  </a>`;
}

function filterBar() {
  const used = new Set(state.projects.flatMap((project) => project.categories));
  const keys = Object.keys(state.categories).filter((key) => used.has(key));
  const all = `<li><button class="filter" type="button" data-filter="" aria-pressed="${!state.filter}"><span class="nav-word">tous</span></button></li>`;
  return (
    all +
    keys
      .map((key) => {
        const category = state.categories[key];
        return `<li><button class="filter" type="button" data-filter="${key}" aria-pressed="${state.filter === key}" style="--accent: ${category.color}"><span class="nav-word">${escapeHtml(category.label.toLowerCase())}</span></button></li>`;
      })
      .join("")
  );
}

function applyFilter() {
  const grid = view.querySelector(".grid");
  if (!grid) return;
  grid.querySelectorAll(".card").forEach((card) => {
    const match = !state.filter || card.dataset.categories.split(" ").includes(state.filter);
    card.classList.toggle("is-veiled", !match);
  });
  view.querySelectorAll(".filter").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === (state.filter ?? "")));
  });
}

function renderProjects() {
  setTitle("Projets");
  view.innerHTML = `
    <section class="projects">
      <h1 class="visually-hidden">Projets</h1>
      <ul class="filters" aria-label="Filtrer par discipline">${filterBar()}</ul>
      <div class="grid">${state.projects.map(projectCard).join("")}</div>
    </section>`;
  revealImages(view);
  applyFilter();
}

/* ---------- Projet ---------- */

function galleryRows(project) {
  const metas = project.images
    .map((file, index) => ({ file, index, meta: imageMeta(project.slug, file) }))
    .filter((item) => item.meta);
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
      .map((file, index) => ({ file, index, meta: imageMeta(project.slug, file) }))
      .filter((item) => item.meta)
      .map((item) => galleryItem(project, item, "(max-width: 600px) 46vw, (max-width: 900px) 31vw, 22vw", item.index < 3))
      .join("")}</div>`;
  }

  return `<div class="gallery">${galleryRows(project)
    .map((row, rowIndex) => {
      const sizes = row.kind === "pair" ? "(max-width: 600px) 92vw, (max-width: 900px) 46vw, 32vw" : "(max-width: 900px) 94vw, 66vw";
      const items = row.items.map((item) => galleryItem(project, item, sizes, rowIndex === 0)).join("");
      return `<div class="gallery__row gallery__row--${row.kind}" style="--cols: ${row.items.length}">${items}</div>`;
    })
    .join("")}</div>`;
}

function renderProject(slug) {
  const index = state.projects.findIndex((project) => project.slug === slug);
  if (index === -1) {
    location.replace("#/projets");
    return;
  }

  const project = state.projects[index];
  const next = state.projects[(index + 1) % state.projects.length];
  const nextCover = next.cover ? imageMeta(next.slug, next.cover) : null;
  setTitle(project.title);

  const categories = project.categories
    .filter((key) => state.categories[key])
    .map((key) => {
      const category = state.categories[key];
      return `<li><a href="#/projets" data-filter-link="${key}" style="--c: ${category.color}">${glyph(category.glyph)}${escapeHtml(category.label)}</a></li>`;
    })
    .join("");

  const links = (project.links ?? [])
    .map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a></li>`)
    .join("");

  view.innerHTML = `
    <article class="project">
      <div class="project__text">
        <a class="back" href="#/projets">${glyph("chenille")}<span>Tous les projets</span></a>
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

/* ---------- Infos, compétences, contact ---------- */

function listSection(title, items, renderItem) {
  if (!items?.length) return "";
  return `<section class="page__section">
    <h2 class="page__section-title">${escapeHtml(title)}</h2>
    <ul class="page__list">${items.map(renderItem).join("")}</ul>
  </section>`;
}

function renderInfos() {
  setTitle("Infos");
  const site = state.site;
  view.innerHTML = `
    <section class="page page--infos">
      <h1 class="page__title">Infos</h1>
      <div class="page__bio">${site.bio.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>
      <div class="page__cv">
        ${(site.cv ?? [])
          .map((section) =>
            listSection(section.title, section.items, (item) => `<li><time>${escapeHtml(item.year)}</time><span>${escapeHtml(item.text)}</span></li>`)
          )
          .join("")}
      </div>
    </section>`;
}

function renderSkills() {
  setTitle("Compétences");
  const disciplines = Object.values(state.categories)
    .map((category) => `<li class="skill--discipline">${glyph(category.glyph)}<span>${escapeHtml(category.label)}</span></li>`)
    .join("");

  view.innerHTML = `
    <section class="page page--skills">
      <h1 class="page__title">Compétences</h1>
      <section class="page__section">
        <h2 class="page__section-title">Disciplines</h2>
        <ul class="disciplines">${disciplines}</ul>
      </section>
      <div class="page__cv">
        ${(state.site.skills ?? [])
          .map((group) => listSection(group.title, group.items, (item) => `<li><span>${escapeHtml(item)}</span></li>`))
          .join("")}
      </div>
    </section>`;
}

function renderContact() {
  setTitle("Contact");
  const site = state.site;
  const handle = (site.instagram ?? "").replace(/^@/, "");
  const lines = [
    site.email ? `<a class="nav-word" href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>` : "",
    handle ? `<a class="nav-word" href="https://www.instagram.com/${escapeHtml(handle)}/" target="_blank" rel="noopener">instagram</a>` : ""
  ].filter(Boolean);

  view.innerHTML = `
    <section class="page page--contact">
      <h1 class="page__title">Contact</h1>
      <div class="contact__links">
        ${lines.length ? lines.join("") : `<p class="contact__empty">Coordonnées bientôt disponibles.</p>`}
      </div>
      <button class="credits-toggle" type="button" aria-expanded="false" aria-controls="credits"><span class="nav-word">Crédits</span></button>
      <dl class="credits" id="credits" hidden>
        ${(site.credits ?? []).map((credit) => `<dt>${escapeHtml(credit.label)}</dt><dd>${escapeHtml(credit.text)}</dd>`).join("")}
      </dl>
    </section>`;
}

/* ---------- Routeur ---------- */

const routes = {
  home: renderHome,
  projects: renderProjects,
  infos: renderInfos,
  competences: renderSkills,
  contact: renderContact
};

function parseRoute() {
  const path = location.hash.replace(/^#\/?/, "");
  const [section, slug] = path.split("/");
  if (section === "projet" && slug) return { name: "project", slug: decodeURIComponent(slug) };
  if (section === "projets") return { name: "projects" };
  if (section in routes) return { name: section };
  return { name: "home" };
}

function render() {
  const previous = state.route;
  const route = parseRoute();
  state.route = route;

  if (route.name === "project") renderProject(route.slug);
  else routes[route.name]();

  document.body.dataset.view = route.name;
  document.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === route.name || (route.name === "project" && link.dataset.route === "projects");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  sowing.setEnabled(!["project", "projects"].includes(route.name));

  // Retour à la liste depuis un projet : on revient à hauteur du projet quitté.
  const card = route.name === "projects" && previous?.name === "project"
    ? view.querySelector(`.card[href="#/projet/${CSS.escape(previous.slug)}"]`)
    : null;
  if (card) card.scrollIntoView({ block: "center" });
  else window.scrollTo(0, 0);

  if (previous && !reducedMotion.matches) {
    view.classList.remove("is-entering");
    void view.offsetWidth;
    view.classList.add("is-entering");
  }
  if (previous) {
    view.focus({ preventScroll: true });
  }
  scrollbar.update();
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
  const meta = imageMeta(project.slug, project.images[lightboxState.index]);
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
  const following = imageMeta(project.slug, project.images[lightboxState.index + 1] ?? "");
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

/* ---------- Barre de défilement ---------- */

const scrollbar = (() => {
  const bar = document.querySelector(".scrollbar");
  const thumb = bar.querySelector(".scrollbar__thumb");
  let drag = null;

  function metrics() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const track = bar.clientHeight;
    const size = Math.max(40, track * (window.innerHeight / document.documentElement.scrollHeight));
    return { scrollable, track, size };
  }

  function update() {
    const { scrollable, track, size } = metrics();
    bar.classList.toggle("is-hidden", scrollable <= 2);
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${progress * (track - size)}px)`;
  }

  function scrollToPointer(clientY, offset) {
    const { scrollable, track, size } = metrics();
    const top = bar.getBoundingClientRect().top;
    const ratio = (clientY - top - offset) / (track - size);
    window.scrollTo(0, Math.max(0, Math.min(1, ratio)) * scrollable);
  }

  bar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const thumbRect = thumb.getBoundingClientRect();
    const onThumb = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    const offset = onThumb ? event.clientY - thumbRect.top : thumbRect.height / 2;
    drag = { offset };
    capturePointer(bar, event);
    bar.classList.add("is-dragging");
    scrollToPointer(event.clientY, offset);
  });
  bar.addEventListener("pointermove", (event) => {
    if (drag) scrollToPointer(event.clientY, drag.offset);
  });
  const stop = () => {
    drag = null;
    bar.classList.remove("is-dragging");
  };
  bar.addEventListener("pointerup", stop);
  bar.addEventListener("pointercancel", stop);

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new ResizeObserver(update).observe(document.body);

  return { update };
})();

/* ---------- Rebond en haut de page : on aperçoit le bleu derrière ---------- */

(() => {
  // macOS et iOS ont déjà un rebond natif qui laisse voir le fond bleu de <html>.
  const nativeBounce = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  if (nativeBounce) return;

  let pull = 0;
  let releaseTimer = 0;

  function set(value, animate) {
    pull = value;
    document.body.classList.toggle("is-pulled", pull > 0.5);
    document.body.style.transition = animate ? "transform 650ms cubic-bezier(0.22, 1.4, 0.36, 1)" : "none";
    document.body.style.transform = pull > 0.5 ? `translateY(${pull}px)` : "";
  }

  window.addEventListener(
    "wheel",
    (event) => {
      if (reducedMotion.matches || lightbox.open || event.defaultPrevented) return;
      if (window.scrollY > 0 || (event.deltaY >= 0 && pull === 0)) return;
      const max = 180;
      const next = event.deltaY < 0 ? pull + -event.deltaY * 0.4 * (1 - pull / max) : pull - event.deltaY;
      set(Math.max(0, Math.min(max, next)), false);
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => set(0, true), 140);
    },
    { passive: true }
  );
})();

/* ---------- Chenille ---------- */

(() => {
  const crawler = document.querySelector(".crawler");
  const body = crawler.querySelector(".crawler__body");
  const footer = document.querySelector(".site-footer");
  body.innerHTML = glyph("chenille");

  let x = 24;
  let last = 0;
  let drag = null;
  let looping = false;
  const speed = 22;

  function place() {
    crawler.style.transform = `translateX(${x}px)`;
  }

  function step(now) {
    const delta = Math.min(64, now - (last || now));
    last = now;
    if (!drag && !looping && !reducedMotion.matches) {
      x += (speed * delta) / 1000;
      if (x > footer.clientWidth + 10) x = -crawler.offsetWidth - 10;
      place();
    }
    requestAnimationFrame(step);
  }

  function loop() {
    if (looping || reducedMotion.matches) return;
    looping = true;
    crawler.classList.add("is-looping");
    const animation = body.animate(
      [
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-18px) rotate(-90deg)", offset: 0.25 },
        { transform: "translateY(-28px) rotate(-180deg)", offset: 0.5 },
        { transform: "translateY(-18px) rotate(-270deg)", offset: 0.75 },
        { transform: "translateY(0) rotate(-360deg)" }
      ],
      { duration: 900, easing: "cubic-bezier(0.45, 0, 0.3, 1)" }
    );
    const advance = body.animate([{ marginLeft: "0px" }, { marginLeft: "46px" }], { duration: 900, easing: "ease-in-out" });
    animation.onfinish = () => {
      advance.cancel();
      x += 46;
      place();
      looping = false;
      crawler.classList.remove("is-looping");
    };
  }

  crawler.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    drag = { start: event.clientX, origin: x, moved: 0, time: performance.now() };
    capturePointer(crawler, event);
    crawler.classList.add("is-grabbed");
  });
  crawler.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.start;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    x = Math.max(-crawler.offsetWidth / 2, Math.min(footer.clientWidth - crawler.offsetWidth / 2, drag.origin + dx));
    place();
  });
  const release = () => {
    if (!drag) return;
    const wasClick = drag.moved < 5 && performance.now() - drag.time < 400;
    drag = null;
    crawler.classList.remove("is-grabbed");
    if (wasClick) loop();
  };
  crawler.addEventListener("pointerup", release);
  crawler.addEventListener("pointercancel", release);
  crawler.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      loop();
    }
  });

  place();
  requestAnimationFrame(step);
})();

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
      size: 14 + Math.random() * 12,
      w: shape.w,
      h: shape.h,
      rotation: (Math.random() - 0.5) * 0.9,
      color: colors[Math.floor(Math.random() * colors.length)],
      born: performance.now(),
      life: 2200 + Math.random() * 1400
    });
    if (sprouts.length > 60) sprouts.shift();
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
    if (!enabled || reducedMotion.matches || lightbox.open || event.pointerType !== "mouse") return;
    const point = { x: event.clientX, y: event.clientY };
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 70) return;
    // Le canvas est sous le contenu : les glyphes n'apparaissent que sur le papier.
    last = point;
    spawn(point.x, point.y + 10);
  }

  return {
    init(categories) {
      colors = ["#2626b8", "#2626b8", ...Object.values(categories).map((category) => category.color)];
      resize();
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", onMove, { passive: true });
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
  document.body.classList.toggle("is-scrolled", window.scrollY > 4);
}

document.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    const key = filterButton.dataset.filter || null;
    state.filter = state.filter === key ? null : key;
    applyFilter();
    return;
  }

  const filterLink = event.target.closest("[data-filter-link]");
  if (filterLink) {
    state.filter = filterLink.dataset.filterLink;
    return;
  }

  const creditsToggle = event.target.closest(".credits-toggle");
  if (creditsToggle) {
    const credits = view.querySelector(".credits");
    const open = credits.hidden;
    credits.hidden = !open;
    creditsToggle.setAttribute("aria-expanded", String(open));
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

document.querySelector("[data-year]").textContent = new Date().getFullYear();

/* ---------- Démarrage ---------- */

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : ${response.status}`);
  return response.json();
}

try {
  const [content, images] = await Promise.all([loadJson("content/projects.json"), loadJson("content/images.json")]);
  state.site = content.site;
  state.home = content.home;
  state.categories = content.categories;
  state.projects = content.projects;
  state.images = Object.fromEntries(Object.entries(images).map(([key, value]) => [key.normalize("NFC"), value]));
  sowing.init(state.categories);
  render();
} catch (error) {
  console.error(error);
  view.innerHTML = `<p style="padding: 2rem">Le contenu n’a pas pu être chargé.</p>`;
}
