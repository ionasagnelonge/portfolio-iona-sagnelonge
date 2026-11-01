import { glyphs } from "./glyphs.js";

const view = document.querySelector(".view");
const lightbox = document.querySelector(".lightbox");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// La hauteur réelle du bandeau sert de repère aux éléments collants (barre de défilement, panneaux).
const siteHeader = document.querySelector(".site-header");
// Hauteur exacte (sous-pixel comprise) : sinon les volets dépassent de l'écran d'une fraction de pixel.
new ResizeObserver(() => {
  fitHeader();
  document.documentElement.style.setProperty("--header-h", `${siteHeader.getBoundingClientRect().height}px`);
  if (state.route) stickyPanels.update();
}).observe(siteHeader);

// Le menu reste sur la ligne du nom ; si la place manque, « Iona Sagnelonge » devient « IS ».
function fitHeader() {
  siteHeader.classList.remove("is-compact");
  if (siteHeader.scrollWidth > siteHeader.clientWidth + 1) siteHeader.classList.add("is-compact");
}
document.fonts?.ready.then(fitHeader);

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

// Partenaire ou client du projet (« La Physique Autrement ») ; à défaut, ses disciplines.
function partnerName(project) {
  const name = project.partner?.name;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : categoryLabels(project);
}

// Même chose, dans le fil d'une phrase (« avec La Physique Autrement »).
function partnerPhrase(project) {
  const { prefix, name } = project.partner ?? {};
  if (!name) return categoryLabels(project);
  return prefix ? `${prefix} ${name}` : partnerName(project);
}

/* ---------- Stickers ---------- */

// Sticker détouré du projet (data/stickers/), sinon sa couverture façon « photo-sticker ».
function stickerOf(project) {
  const cutout = project.sticker ? imageMeta("stickers", project.sticker) : null;
  if (cutout) return { meta: cutout, cutout: true };
  const cover = project.cover ? imageMeta(project.slug, project.cover) : null;
  return cover ? { meta: cover, cutout: false } : null;
}

function stickerImg(sticker, sizes, alt = "") {
  return `<img class="sticker__img${sticker.cutout ? "" : " sticker__img--photo"}" src="${sticker.meta.srcset.at(-1).src}" srcset="${srcsetOf(sticker.meta)}"
    sizes="${sizes}" width="${sticker.meta.w}" height="${sticker.meta.h}" alt="${escapeHtml(alt)}" draggable="false" decoding="async" />`;
}

/* ---------- Accueil : mur de stickers + projets ---------- */

function renderHome() {
  setTitle();
  const stickers = state.projects
    .map((project) => ({ project, sticker: stickerOf(project) }))
    .filter((item) => item.sticker);

  view.innerHTML = `
    <h1 class="visually-hidden">Iona Sagnelonge — portfolio</h1>
    <section class="wall" aria-label="Mur de stickers des projets">
      ${stickers
        .map(
          ({ project, sticker }) => `<a class="sticker${sticker.cutout ? "" : " sticker--photo"}" href="#/projet/${project.slug}" draggable="false"
            data-label="${escapeHtml(project.title)}" style="--ratio: ${sticker.meta.w / sticker.meta.h}">
            ${stickerImg(sticker, "(max-width: 600px) 40vw, 16vw", project.title)}
          </a>`
        )
        .join("")}
      <a class="wall__more" href="#/projets" aria-label="Voir les projets">↓</a>
    </section>
    ${editoSection()}
    ${projectsSection()}`;

  revealImages(view);
  wall.mount(view.querySelector(".wall"));
  applyFilter();
  stickyPanels.update();
}

// Édito : un volet blanc qui glisse sur le mur de stickers, avant les projets.
function editoSection() {
  const text = state.site.edito ?? [];
  if (!text.length) return "";
  return `<section class="edito" aria-label="Édito">
    <div class="edito__text">${text.map((block) => `<p>${escapeHtml(block)}</p>`).join("")}</div>
  </section>`;
}

/* Stickers qu'on attrape et déplace (souris ou doigt), sur le mur comme dans un projet.
   Ils restent dans leur cadre : près du bord, ils résistent comme un élastique puis reviennent.
   En mouvement, ils s'inclinent dans le sens de la trajectoire du curseur. */
const stickers = (() => {
  const mounted = new Set();
  let topZ = 10;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Positions permises (translate) pour que le sticker, rotation comprise, reste dans son cadre.
  function limits(sticker) {
    const s = sticker._state;
    const frame = sticker.offsetParent;
    if (!frame) return null;
    const w = sticker.offsetWidth;
    const h = sticker.offsetHeight;
    const angle = ((s.r + s.tilt) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const [top, right, bottom, left] = s.inset;
    const range = (origin, size, own, extent, before, after) => {
      let min = before + extent - own / 2 - origin;
      let max = size - after - extent - own / 2 - origin;
      if (min > max) min = max = (min + max) / 2;
      return { min, max, give: [Math.max(1, before), Math.max(1, after)] };
    };
    return {
      x: range(sticker.offsetLeft, frame.clientWidth, w, (w * cos + h * sin) / 2, left, right),
      y: range(sticker.offsetTop, frame.clientHeight, h, (w * sin + h * cos) / 2, top, bottom)
    };
  }

  // Au-delà de la limite, le sticker suit de moins en moins le curseur, sans jamais quitter le cadre.
  function stretch(value, { min, max, give }) {
    if (value < min) return min - give[0] * (1 - Math.exp((value - min) / (give[0] * 3)));
    if (value > max) return max + give[1] * (1 - Math.exp((max - value) / (give[1] * 3)));
    return value;
  }

  function render(sticker) {
    const s = sticker._state;
    sticker.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.r + s.tilt}deg)`;
  }

  // Remet un sticker dans son cadre (après un redimensionnement, une dispersion).
  function contain(sticker) {
    const lim = limits(sticker);
    if (!lim) return;
    const s = sticker._state;
    s.x = clamp(s.x, lim.x.min, lim.x.max);
    s.y = clamp(s.y, lim.y.min, lim.y.max);
    render(sticker);
  }

  // Boucle d'animation : suit le glisser, puis l'élan et le retour dans le cadre une fois lâché.
  function animate(sticker) {
    const s = sticker._state;
    cancelAnimationFrame(s.frame);
    const step = () => {
      const lim = limits(sticker);
      if (!lim) {
        s.frame = 0;
        return;
      }
      let outside = false;
      if (s.drag) {
        // La vitesse retombe quand le curseur s'arrête : l'inclinaison aussi.
        s.vx *= 0.8;
        s.vy *= 0.8;
      } else {
        for (const [pos, vel] of [["x", "vx"], ["y", "vy"]]) {
          const { min, max, give } = lim[pos];
          s[vel] *= 0.9;
          s[pos] += s[vel];
          // Hors du cadre : un ressort amorti le ramène en douceur.
          if (s[pos] < min || s[pos] > max) {
            const edge = s[pos] < min ? min : max;
            s[vel] = s[vel] * 0.5 + (edge - s[pos]) * 0.2;
            s[pos] = clamp(s[pos], min - give[0], max + give[1]);
            if (Math.abs(edge - s[pos]) > 0.5) outside = true;
            else s[pos] = edge;
          }
        }
      }
      s.tilt += (clamp(s.vx * 0.9, -14, 14) - s.tilt) * 0.18;
      render(sticker);
      if (s.drag || outside || Math.abs(s.vx) + Math.abs(s.vy) > 0.15 || Math.abs(s.tilt) > 0.05) {
        s.frame = requestAnimationFrame(step);
      } else {
        s.tilt = 0;
        s.frame = 0;
        contain(sticker);
      }
    };
    s.frame = requestAnimationFrame(step);
  }

  function bind(sticker, { tooltip, raise }) {
    const s = sticker._state;
    let drag = null;
    let holdTimer = 0;

    function grab() {
      drag.active = true;
      sticker.classList.add("is-grabbed");
      if (raise) {
        topZ += 1;
        sticker.style.zIndex = String(topZ);
      }
    }

    sticker.addEventListener("dragstart", (event) => event.preventDefault());
    sticker.addEventListener("contextmenu", (event) => {
      if (drag) event.preventDefault();
    });
    sticker.addEventListener("pointermove", (event) => {
      if (tooltip && event.pointerType === "mouse") wall.showTooltip(sticker.dataset.label, event);
      if (!drag) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.moved += Math.hypot(dx, dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      if (!drag.active) {
        // Au doigt, un mouvement avant la fin de l'appui = on fait défiler la page.
        if (drag.moved > 8) {
          clearTimeout(holdTimer);
          drag = null;
        }
        return;
      }
      drag.rawX += dx;
      drag.rawY += dy;
      if (drag.moved < 5) return;
      if (!drag.started) {
        drag.started = true;
        s.drag = true;
        animate(sticker);
      }
      const lim = limits(sticker);
      if (!lim) return;
      s.x = stretch(drag.rawX, lim.x);
      s.y = stretch(drag.rawY, lim.y);
      s.vx = dx;
      s.vy = dy;
    });
    sticker.addEventListener(
      "touchmove",
      (event) => {
        if (drag?.active) event.preventDefault();
      },
      { passive: false }
    );
    if (tooltip) sticker.addEventListener("pointerleave", wall.hideTooltip);
    sticker.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.vx = 0;
      s.vy = 0;
      drag = { lastX: event.clientX, lastY: event.clientY, rawX: s.x, rawY: s.y, moved: 0, started: false, active: false, touch: event.pointerType !== "mouse" };
      capturePointer(sticker, event);
      if (event.pointerType === "mouse") {
        grab();
      } else {
        // Au doigt : court appui pour décoller le sticker.
        holdTimer = setTimeout(() => {
          if (drag) {
            grab();
            navigator.vibrate?.(8);
          }
        }, 220);
      }
    });
    const release = () => {
      clearTimeout(holdTimer);
      if (!drag) return;
      const { started, active, touch } = drag;
      drag = null;
      s.drag = false;
      sticker.classList.remove("is-grabbed");
      // Un sticker déplacé (ou décollé au doigt) n'ouvre pas le projet.
      if (started || (active && touch)) {
        sticker.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
      }
      // Lâché : il garde son élan et revient dans le cadre, sans à-coup.
      if (started) animate(sticker);
    };
    sticker.addEventListener("pointerup", release);
    sticker.addEventListener("pointercancel", release);
  }

  window.addEventListener("resize", () => {
    mounted.forEach((sticker) => {
      if (sticker.isConnected) contain(sticker);
      else mounted.delete(sticker);
    });
  });

  return {
    // inset : marges [haut, droite, bas, gauche] à garder entre le sticker et le bord de son cadre.
    mount(sticker, { inset, r = 0, tooltip = false, raise = false }) {
      sticker._state = { x: 0, y: 0, r, tilt: 0, vx: 0, vy: 0, frame: 0, drag: false, inset };
      bind(sticker, { tooltip, raise });
      mounted.add(sticker);
      render(sticker);
    },
    place(sticker, x, y) {
      Object.assign(sticker._state, { x, y });
      contain(sticker);
    },
    setTopZ(value) {
      topZ = value;
    }
  };
})();

/* Mur d'atelier : stickers éparpillés sur toute la largeur, sans jamais déborder de l'écran */
const wall = (() => {
  const tooltip = document.createElement("span");
  tooltip.className = "tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  document.body.append(tooltip);

  // Zone d'apparition : marges [haut, droite, bas, gauche] ; le haut passe sous le dégradé du bandeau.
  const INSET = [28, 24, 18, 18];

  let root = null;
  let items = [];
  let lastWidth = 0;

  const random = (min, max) => min + Math.random() * (max - min);

  function showTooltip(label, event) {
    tooltip.textContent = label;
    // Près du bord droit, l'étiquette passe à gauche du curseur.
    const x = event.clientX + 16 + tooltip.offsetWidth > window.innerWidth - 12
      ? event.clientX - 16 - tooltip.offsetWidth
      : event.clientX + 16;
    tooltip.style.transform = `translate(${x}px, ${event.clientY + 18}px)`;
    tooltip.classList.add("is-visible");
  }

  function hideTooltip() {
    tooltip.classList.remove("is-visible");
  }

  // Grille irrégulière : chaque sticker occupe une case, décalé, tourné, de taille variable.
  function scatter() {
    const [top, right, bottom, left] = INSET;
    const width = root.clientWidth - left - right;
    const height = root.clientHeight - top - bottom;
    const narrow = root.clientWidth < 600;
    const count = items.length;
    const rows = Math.max(1, Math.round(Math.sqrt((count * height) / width)));
    const cols = Math.ceil(count / rows);
    const cellW = width / cols;
    const cellH = height / rows;
    const slots = Array.from({ length: rows * cols }, (_, index) => index)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    items.forEach((sticker, index) => {
      const ratio = Number(sticker.style.getPropertyValue("--ratio")) || 1;
      const slot = slots[index];
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      // Taille : la plus grande dimension remplit 70 à 100 % de la case.
      const box = Math.min(cellW, cellH) * random(narrow ? 0.72 : 0.7, narrow ? 0.95 : 1);
      const w = ratio >= 1 ? box : box * ratio;
      const h = w / ratio;
      sticker.style.width = `${w}px`;
      const cx = left + (col + 0.5) * cellW + random(-0.2, 0.2) * cellW;
      const cy = top + (row + 0.5) * cellH + random(-0.2, 0.2) * cellH;
      sticker._state.r = random(-12, 12);
      sticker.style.zIndex = String(1 + Math.floor(Math.random() * count));
      // Placé puis ramené dans la zone d'apparition, rotation comprise.
      stickers.place(sticker, cx - w / 2, cy - h / 2);
    });
    stickers.setTopZ(count + 10);
    lastWidth = root.clientWidth;
  }

  window.addEventListener("resize", () => {
    if (root?.isConnected && Math.abs(root.clientWidth - lastWidth) > 60) scatter();
  });
  window.addEventListener("hashchange", hideTooltip);
  window.addEventListener("scroll", hideTooltip, { passive: true });

  return {
    mount(element) {
      root = element;
      items = [...root.querySelectorAll(".sticker")];
      items.forEach((sticker) => stickers.mount(sticker, { inset: INSET, tooltip: true, raise: true }));
      scatter();
      root.classList.add("is-ready");
    },
    showTooltip,
    hideTooltip
  };
})();

/* ---------- Projets (sous le mur, sur l'accueil) ---------- */

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
    </div>
    <h2 class="card__title"><span class="card__title-text">${escapeHtml(project.title)}</span></h2>
    <p class="card__meta">${escapeHtml(partnerName(project))}${project.year ? ` · ${escapeHtml(project.year)}` : ""}</p>
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
        return `<li><button class="filter" type="button" data-filter="${key}" aria-pressed="${state.filter === key}"><span class="nav-word">${escapeHtml(category.label.toLowerCase())}</span></button></li>`;
      })
      .join("")
  );
}

/* Filtre : les projets écartés disparaissent aussitôt, les autres glissent
   à leur nouvelle place dans la grille (technique FLIP). */
function applyFilter(animate = false) {
  view.querySelectorAll(".filter").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === (state.filter ?? "")));
  });
  const grid = view.querySelector(".grid");
  if (!grid) return;

  const cards = [...grid.querySelectorAll(".card")];
  const matches = (card) => !state.filter || card.dataset.categories.split(" ").includes(state.filter);
  const staying = animate && !reducedMotion.matches ? cards.filter((card) => !card.hidden && matches(card)) : [];
  const before = new Map(staying.map((card) => [card, card.getBoundingClientRect()]));

  // Un glissement encore en cours (clics rapprochés) est arrêté : on repart de la position mesurée.
  cards.forEach((card) => card.getAnimations().forEach((animation) => animation.cancel()));
  cards.forEach((card) => (card.hidden = !matches(card)));

  staying.forEach((card) => {
    const from = before.get(card);
    const to = card.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  });
}

function projectsSection() {
  return `<section class="projects" id="projets" aria-labelledby="projets-title">
    <h2 class="visually-hidden" id="projets-title">Projets</h2>
    <ul class="filters" aria-label="Filtrer par discipline">${filterBar()}</ul>
    <div class="grid">${state.projects.map(projectCard).join("")}</div>
  </section>`;
}

function scrollToProjects(behavior = "smooth") {
  const section = view.querySelector("#projets");
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY - siteHeader.getBoundingClientRect().height;
  window.scrollTo({ top, behavior: reducedMotion.matches ? "auto" : behavior });
}


/* ---------- Projet ---------- */

function renderStrip(project) {
  const items = project.images
    .map((file, index) => ({ index, meta: imageMeta(project.slug, file) }))
    .filter((item) => item.meta);

  if (!items.length) {
    const names = project.categories.map((key) => state.categories[key]?.glyph).filter(Boolean);
    return `<div class="strip strip--empty">
      <div class="strip__placeholder">${names.map((name) => glyph(name)).join("")}<p>Projet en cours — images à venir</p></div>
    </div>`;
  }

  return `<div class="strip">
    <div class="strip__track">
      ${items
        .map(
          (item) => `<button class="strip__item" type="button" data-index="${item.index}" aria-label="Agrandir l’image ${item.index + 1}"
            style="aspect-ratio: ${item.meta.w} / ${item.meta.h}; --ratio: ${item.meta.w / item.meta.h}; ${placeholderStyle(item.meta)}">
            ${imgTag(item.meta, { sizes: "(max-width: 600px) 90vw, 70vw", alt: `${project.title}, image ${item.index + 1}`, eager: item.index < 3 })}
          </button>`
        )
        .join("")}
    </div>
    ${items.length > 1
      ? `<div class="strip__controls">
          <button class="strip__arrow" data-step="-1" type="button" aria-label="Image précédente">←</button>
          <ol class="strip__thumbs" aria-label="Photos du projet">
            ${items
              .map(
                (item, position) => `<li><button class="strip__thumb" type="button" data-goto="${position}" aria-label="Photo ${position + 1}"${position === 0 ? ' aria-current="true"' : ""}>
                  <img src="${item.meta.srcset[0].src}" alt="" loading="lazy" decoding="async" draggable="false" />
                </button></li>`
              )
              .join("")}
          </ol>
          <button class="strip__arrow" data-step="1" type="button" aria-label="Image suivante">→</button>
        </div>`
      : ""}
  </div>`;
}

function renderProject(slug) {
  const index = state.projects.findIndex((project) => project.slug === slug);
  if (index === -1) {
    location.replace("#/projets");
    return;
  }

  const project = state.projects[index];
  const next = state.projects[(index + 1) % state.projects.length];
  const sticker = stickerOf(project);
  setTitle(project.title);

  const links = (project.links ?? [])
    .map((link) => `<li><a class="link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a></li>`)
    .join("");
  // Sous le sous-titre : « avec La Physique Autrement, 2025 »
  const meta = [partnerPhrase(project), project.year].filter(Boolean).join(", ");

  view.innerHTML = `
    <article class="project">
      <section class="project__panel project__panel--media" aria-label="Images">
        ${renderStrip(project)}
      </section>

      <section class="project__panel project__panel--info">
        <div class="project__text">
          <h1 class="project__title">${escapeHtml(project.title)}</h1>
          ${project.summary ? `<p class="project__summary">${escapeHtml(project.summary)}</p>` : ""}
          ${meta ? `<p class="project__meta">${escapeHtml(meta)}</p>` : ""}
          ${project.body ? `<div class="project__body">${paragraphs(project.body)}</div>` : ""}
          ${project.credits ? `<p class="project__credits">${escapeHtml(project.credits)}</p>` : ""}
          ${links ? `<ul class="project__links">${links}</ul>` : ""}
        </div>
        ${sticker ? `<div class="project__sticker${sticker.cutout ? "" : " sticker--photo"}">${stickerImg(sticker, "(max-width: 900px) 60vw, 26vw")}</div>` : ""}
      </section>

      <a class="project__panel project__panel--next" href="#/projet/${next.slug}">
        <span class="next__label">Projet suivant</span>
        <span class="next__title"><span class="card__title-text">${escapeHtml(next.title)}</span></span>
      </a>
    </article>`;

  revealImages(view);
  view.querySelector(".project")._project = project;
  strip.mount(view.querySelector(".strip"), project);
  stickyPanels.update();
  const projectSticker = view.querySelector(".project__sticker");
  if (projectSticker) stickers.mount(projectSticker, { inset: [16, 16, 16, 16], r: -6 });
}

/* Bandeau d'images horizontal : défilement, glisser à la souris, flèches, vignettes.
   L'image choisie (vignette, flèche ou clic) reste sélectionnée et encadrée, même la première
   ou la dernière quand le défilement ne peut pas la centrer. */
const strip = (() => {
  let root = null;
  let track = null;
  let drag = null;
  let selected = -1;
  // Pendant un défilement lancé par un choix, la sélection ne suit pas le défilement.
  let steering = false;
  let settle = 0;

  function items() {
    return [...track.querySelectorAll(".strip__item")];
  }

  function current() {
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let distance = Infinity;
    items().forEach((item, index) => {
      const d = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    return best;
  }

  // La vignette et l'image sélectionnées sont mises en avant.
  function select(index) {
    const list = items();
    index = Math.max(0, Math.min(list.length - 1, index));
    if (index === selected) return;
    selected = index;
    list.forEach((item, position) => item.classList.toggle("is-selected", position === index));
    const thumbs = root.querySelectorAll(".strip__thumb");
    thumbs.forEach((thumb, position) => {
      if (position === index) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    });
    // Garde la vignette active visible dans la rangée (sans faire défiler la page).
    const thumb = thumbs[index];
    const row = thumb?.closest(".strip__thumbs");
    if (row) row.scrollLeft = thumb.offsetLeft - (row.clientWidth - thumb.offsetWidth) / 2;
  }

  function release(delay) {
    clearTimeout(settle);
    settle = setTimeout(() => (steering = false), delay);
  }

  // Choisit une image et la centre autant que possible.
  function go(index, { picked = true } = {}) {
    const list = items();
    select(index);
    if (picked) root.classList.add("is-picked");
    const target = list[selected];
    if (!target) return;
    steering = true;
    release(700);
    track.scrollTo({
      left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
      behavior: reducedMotion.matches ? "auto" : "smooth"
    });
  }

  function onScroll() {
    if (steering) release(150);
    else select(current());
  }

  return {
    mount(element, project) {
      if (!element || element.classList.contains("strip--empty")) return;
      root = element;
      track = element.querySelector(".strip__track");
      selected = -1;
      steering = false;
      track.addEventListener("scroll", onScroll, { passive: true });
      element.querySelectorAll(".strip__arrow").forEach((arrow) => {
        arrow.addEventListener("click", () => go(selected + Number(arrow.dataset.step)));
      });
      element.querySelectorAll(".strip__thumb").forEach((thumb) => {
        thumb.addEventListener("click", () => go(Number(thumb.dataset.goto)));
      });
      select(0);

      // Glisser à la souris pour faire défiler les images.
      track.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag = { x: event.clientX, left: track.scrollLeft, moved: 0 };
      });
      track.addEventListener("pointermove", (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x;
        drag.moved = Math.max(drag.moved, Math.abs(dx));
        if (drag.moved > 5) {
          track.classList.add("is-dragging");
          track.scrollLeft = drag.left - dx;
        }
      });
      const stop = () => {
        if (!drag) return;
        if (drag.moved > 5) {
          track.addEventListener("click", (event) => event.stopPropagation(), { capture: true, once: true });
          setTimeout(() => go(current(), { picked: false }), 0);
        }
        drag = null;
        track.classList.remove("is-dragging");
      };
      track.addEventListener("pointerup", stop);
      track.addEventListener("pointerleave", stop);
      track.addEventListener("dragstart", (event) => event.preventDefault());
      track.addEventListener("click", (event) => {
        const item = event.target.closest(".strip__item");
        if (!item) return;
        go(items().indexOf(item));
        openLightbox(project, Number(item.dataset.index));
      });
    }
  };
})();

/* Panneaux superposés : chacun reste collé en haut pendant que le suivant glisse par-dessus.
   Un panneau plus haut que l'écran colle par le bas, pour qu'on puisse lire toute sa hauteur. */
const stickyPanels = (() => {
  function update() {
    const headerHeight = siteHeader.getBoundingClientRect().height;
    document.querySelectorAll(".project__panel, .edito").forEach((panel) => {
      const top = Math.min(headerHeight, window.innerHeight - panel.offsetHeight);
      panel.style.top = `${top}px`;
    });
  }
  window.addEventListener("resize", update);
  document.fonts?.ready.then(update);
  return { update };
})();


/* ---------- Infos : présentation et contacts, compétences, parcours ---------- */

function contactLinks(site) {
  const phone = (site.phone ?? "").replace(/s+/g, "");
  return [
    site.email ? `<a class="nav-word" href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>` : "",
    phone ? `<a class="nav-word" href="tel:+33${escapeHtml(phone.replace(/^0/, ""))}">${escapeHtml(site.phone)}</a>` : "",
    site.linkedin ? `<a class="nav-word" href="${escapeHtml(site.linkedin)}" target="_blank" rel="noopener">Linkedin</a>` : ""
  ].filter(Boolean);
}

// Une entrée du parcours : titre, lieu, description, date (seul le titre est obligatoire).
function cvEntry(item) {
  const text = [].concat(item.text ?? []);
  return `<li class="cv-entry">
    <h3 class="cv-entry__title">${escapeHtml(item.title)}</h3>
    ${item.place ? `<p class="cv-entry__place">${escapeHtml(item.place)}</p>` : ""}
    ${text.map((line) => `<p class="cv-entry__text">${escapeHtml(line)}</p>`).join("")}
    ${item.date ? `<p class="cv-entry__date">${escapeHtml(item.date)}</p>` : ""}
  </li>`;
}

function renderInfos() {
  setTitle("Infos");
  const site = state.site;
  const contacts = contactLinks(site);

  view.innerHTML = `
    <article class="infos">
      <section class="infos__intro">
        <h1 class="page__title">Infos</h1>
        <div class="page__bio">${site.bio.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>
        ${contacts.length ? `<div class="contact__links">${contacts.join("")}</div>` : ""}
      </section>

      <section class="infos__skills" aria-label="Compétences">
        ${(site.skills ?? [])
          .map(
            (group) => `<section class="skill-group">
              <h2 class="skill-group__title">${glyph(group.glyph ?? "fleuron4")}<span>${escapeHtml(group.title)}</span></h2>
              <ul class="skill-group__list">${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </section>`
          )
          .join("")}
      </section>

      <section class="infos__cv" aria-label="Parcours">
        ${(site.cv ?? [])
          .map(
            (column) => `<section class="cv-column">
              <h2 class="page__section-title">${escapeHtml(column.title)}</h2>
              <ul class="cv-column__list">${column.items.map(cvEntry).join("")}</ul>
            </section>`
          )
          .join("")}
      </section>

      <footer class="infos__credits">
        <button class="credits-toggle" type="button" aria-expanded="false" aria-controls="credits"><span class="nav-word">Crédits</span></button>
        <dl class="credits" id="credits" hidden>
          ${(site.credits ?? []).map((credit) => `<dt>${escapeHtml(credit.label)}</dt><dd>${escapeHtml(credit.text)}</dd>`).join("")}
        </dl>
      </footer>
    </article>`;
}

/* ---------- Routeur ---------- */

const routes = {
  home: renderHome,
  projects: renderHome,
  infos: renderInfos
};

function parseRoute() {
  const path = location.hash.replace(/^#\/?/, "");
  const [section, slug] = path.split("/");
  if (section === "projet" && slug) return { name: "project", slug: decodeURIComponent(slug) };
  if (section === "projets") return { name: "projects" };
  // Anciennes adresses, réunies dans Infos.
  if (section === "competences" || section === "contact") return { name: "infos" };
  if (section in routes) return { name: section };
  return { name: "home" };
}

function render() {
  const previous = state.route;
  const route = parseRoute();
  state.route = route;

  // Accueil et « Projets » sont la même page : on ne la reconstruit pas, on fait juste défiler.
  const samePage = ["home", "projects"].includes(route.name) && ["home", "projects"].includes(previous?.name);
  if (route.name === "project") renderProject(route.slug);
  else if (!samePage) routes[route.name]();

  document.body.dataset.view = route.name;
  document.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === route.name || (route.name === "project" && link.dataset.route === "projects");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  // Les fruits suivent la souris au-dessus du mur de stickers et de la présentation d'Infos.
  if (["home", "projects"].includes(route.name)) sowing.setEnabled(true, ".wall");
  else sowing.setEnabled(route.name === "infos", ".infos__intro");

  // Retour depuis un projet : on revient sur sa carte dans la grille.
  const card = route.name === "projects" && previous?.name === "project"
    ? view.querySelector(`.card[href="#/projet/${CSS.escape(previous.slug)}"]`)
    : null;
  if (card) card.scrollIntoView({ block: "center" });
  else if (route.name === "projects") requestAnimationFrame(() => scrollToProjects(samePage ? "smooth" : "auto"));
  else if (route.name === "home" && samePage) window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
  else window.scrollTo(0, 0);
  requestAnimationFrame(updateScrolled);

  if (samePage) {
    scrollbar.update();
    return;
  }

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
  let zone = null;
  let frame = 0;
  let last = null;
  let ratio = 1;

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
      born: performance.now(),
      life: 2200 + Math.random() * 1400
    });
    if (sprouts.length > 60) sprouts.shift();
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function draw(now) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    // Fruits blancs, détachés du fond par une ombre très douce.
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgb(40 25 35 / 22%)";
    context.shadowBlur = 5 * ratio;
    context.shadowOffsetY = 1 * ratio;

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
      context.fill(paths.get(sprout.name));
    }
    context.globalAlpha = 1;
    frame = sprouts.length ? requestAnimationFrame(draw) : 0;
  }

  function onMove(event) {
    if (!enabled || reducedMotion.matches || lightbox.open || event.pointerType !== "mouse") return;
    if (zone && !event.target.closest?.(zone)) return;
    const point = { x: event.clientX, y: event.clientY };
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 70) return;
    // Le canvas est sous le contenu : les glyphes n'apparaissent que sur le papier.
    last = point;
    spawn(point.x, point.y + 10);
  }

  return {
    init() {
      resize();
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", onMove, { passive: true });
    },
    setEnabled(value, area = null) {
      enabled = value;
      zone = area;
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
  // Barre de filtres collée sous le bandeau : elle prend le relais du dégradé du bandeau.
  const filters = view.querySelector(".filters");
  const stuck = Boolean(filters) && filters.getBoundingClientRect().top <= siteHeader.getBoundingClientRect().height + 1;
  document.body.classList.toggle("has-stuck-filters", stuck);
}

document.addEventListener("click", (event) => {
  // Menu déjà sélectionné : on revient en haut de la page (ou du début des projets).
  const navLink = event.target.closest(".site-header [data-route]");
  if (navLink && navLink.getAttribute("href") === (location.hash || "#/")) {
    event.preventDefault();
    if (navLink.dataset.route === "projects") scrollToProjects();
    else window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    const key = filterButton.dataset.filter || null;
    state.filter = state.filter === key ? null : key;
    applyFilter(true);
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
  state.categories = content.categories;
  state.projects = content.projects;
  state.images = Object.fromEntries(Object.entries(images).map(([key, value]) => [key.normalize("NFC"), value]));
  sowing.init();
  render();
} catch (error) {
  console.error(error);
  view.innerHTML = `<p style="padding: 2rem">Le contenu n’a pas pu être chargé.</p>`;
}
