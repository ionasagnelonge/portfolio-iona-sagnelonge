import "./style.css";
import projectsData from "./data/projects.json";

const imageAssetUrls = import.meta.glob("/data/**/*.{png,jpg,jpeg,JPG,gif,svg}", {
  eager: true,
  import: "default"
});

const categoryButtons = document.querySelectorAll(".category-button");
const projectList = document.querySelector(".project-list");
const carouselTrack = document.querySelector(".carousel-track");
const carouselPreviousButton = document.querySelector(".carousel-arrow--left");
const carouselNextButton = document.querySelector(".carousel-arrow--right");
const projectText = document.querySelector(".project-text");
let activeCarouselIndex = 0;
let carouselSyncFrame = 0;

function parseLengthToPixels(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 0;
  }

  if (trimmedValue.endsWith("rem")) {
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return (parseFloat(trimmedValue) || 0) * rootFontSize;
  }

  return parseFloat(trimmedValue) || 0;
}

function normalizeAssetPath(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .toLowerCase();
}

const imageAssets = Object.entries(imageAssetUrls).map(([path, url]) => ({
  normalizedPath: normalizeAssetPath(path),
  normalizedBasename: normalizeAssetPath(path.split("/").pop() ?? ""),
  url
}));

function resolveImageUrl(path) {
  const normalizedPath = normalizeAssetPath(path);
  const basename = normalizeAssetPath(path.split("/").pop() ?? "");

  const exactMatch = imageAssets.find((asset) => {
    return asset.normalizedPath === normalizedPath || asset.normalizedPath === `/${normalizedPath}`;
  });

  if (exactMatch) {
    return exactMatch.url;
  }

  const basenameMatch = imageAssets.find((asset) => asset.normalizedBasename === basename);
  return basenameMatch?.url ?? path;
}

function setActiveCategory(nextButton) {
  categoryButtons.forEach((button) => {
    const isActive = button === nextButton;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const isAlreadyActive = button.getAttribute("aria-pressed") === "true";
    setActiveCategory(isAlreadyActive ? null : button);
  });
});

function setActiveProject(nextButton, projectButtons) {
  projectButtons.forEach((button) => {
    const isActive = button === nextButton;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function getSlideScrollLeft(slide) {
  if (!carouselTrack || !slide) {
    return 0;
  }

  const centeredOffset = slide.offsetLeft - (carouselTrack.clientWidth - slide.clientWidth) / 2;
  return Math.max(0, centeredOffset);
}

function getCarouselSlides() {
  return carouselTrack ? Array.from(carouselTrack.children) : [];
}

function updateCarouselEdgePadding() {
  if (!carouselTrack) {
    return;
  }

  const slides = getCarouselSlides();
  const firstSlide = slides[0];
  const lastSlide = slides.at(-1);
  const minimumPadding = parseLengthToPixels(
    getComputedStyle(document.documentElement).getPropertyValue("--carousel-peek")
  );

  if (!firstSlide || !lastSlide) {
    carouselTrack.style.paddingLeft = `${minimumPadding}px`;
    carouselTrack.style.paddingRight = `${minimumPadding}px`;
    carouselTrack.style.scrollPaddingLeft = `${minimumPadding}px`;
    carouselTrack.style.scrollPaddingRight = `${minimumPadding}px`;
    return;
  }

  const leftPadding = Math.max(minimumPadding, (carouselTrack.clientWidth - firstSlide.clientWidth) / 2);
  const rightPadding = Math.max(minimumPadding, (carouselTrack.clientWidth - lastSlide.clientWidth) / 2);

  carouselTrack.style.paddingLeft = `${leftPadding}px`;
  carouselTrack.style.paddingRight = `${rightPadding}px`;
  carouselTrack.style.scrollPaddingLeft = `${leftPadding}px`;
  carouselTrack.style.scrollPaddingRight = `${rightPadding}px`;
}

function getClosestSlideIndex() {
  if (!carouselTrack) {
    return 0;
  }

  const slides = getCarouselSlides();
  const viewportCenter = carouselTrack.scrollLeft + carouselTrack.clientWidth / 2;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  slides.forEach((slide, index) => {
    const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
    const distance = Math.abs(slideCenter - viewportCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function setActiveCarouselSlide(index, options = {}) {
  if (!carouselTrack) {
    return;
  }

  const { align = false, behavior = "smooth" } = options;
  const slides = getCarouselSlides();

  if (!slides.length) {
    activeCarouselIndex = 0;
    updateCarouselArrows();
    return;
  }

  updateCarouselEdgePadding();

  const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
  activeCarouselIndex = nextIndex;

  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === nextIndex;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-current", isActive ? "true" : "false");
  });

  if (align) {
    const activeSlide = slides[nextIndex];

    if (activeSlide instanceof HTMLElement) {
      carouselTrack.scrollTo({
        left: getSlideScrollLeft(activeSlide),
        behavior
      });
    }
  }

  updateCarouselArrows();
}

function queueCarouselSync() {
  if (carouselSyncFrame || !carouselTrack) {
    return;
  }

  carouselSyncFrame = requestAnimationFrame(() => {
    carouselSyncFrame = 0;
    setActiveCarouselSlide(getClosestSlideIndex());
  });
}

function updateCarouselArrows() {
  if (!carouselTrack || !carouselPreviousButton || !carouselNextButton) {
    return;
  }

  const slides = getCarouselSlides();
  const firstSlide = slides[0];
  const lastSlide = slides.at(-1);

  if (!firstSlide || !lastSlide) {
    carouselPreviousButton.disabled = true;
    carouselNextButton.disabled = true;
    return;
  }

  const threshold = 4;
  const firstSlideScrollLeft = getSlideScrollLeft(firstSlide);
  const lastSlideScrollLeft = getSlideScrollLeft(lastSlide);

  carouselPreviousButton.disabled = carouselTrack.scrollLeft <= firstSlideScrollLeft + threshold;
  carouselNextButton.disabled = carouselTrack.scrollLeft >= lastSlideScrollLeft - threshold;
}

function moveCarousel(direction) {
  if (!carouselTrack) {
    return;
  }

  const slides = getCarouselSlides();

  if (!slides.length) {
    return;
  }

  setActiveCarouselSlide(activeCarouselIndex + direction, {
    align: true,
    behavior: "smooth"
  });
}

function renderProjectCarousel(project) {
  if (!carouselTrack || !project) {
    return;
  }

  const images = project.images?.length ? project.images : project.coverImage ? [project.coverImage] : [];

  carouselTrack.innerHTML = "";
  activeCarouselIndex = 0;

  images.forEach((imagePath, index) => {
    const slide = document.createElement("div");
    const image = document.createElement("img");
    const imageUrl = resolveImageUrl(imagePath);

    slide.className = "carousel-slide";
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-label", `${project.title} image ${index + 1}`);
    slide.setAttribute("aria-current", "false");

    image.className = "carousel-slide__image";
    image.src = imageUrl;
    image.alt = `${project.title} image ${index + 1}`;
    image.addEventListener("load", () => {
      updateCarouselEdgePadding();
      setActiveCarouselSlide(activeCarouselIndex, {
        align: true,
        behavior: "auto"
      });
    });

    slide.append(image);
    carouselTrack.append(slide);
  });

  requestAnimationFrame(() => {
    setActiveCarouselSlide(0, {
      align: true,
      behavior: "auto"
    });
  });
}

function renderProjectText(project) {
  if (!projectText || !project) {
    return;
  }

  const summary = project.text?.summary?.trim();
  const body = project.text?.body?.trim();
  const year = project.year?.trim();

  projectText.innerHTML = "";

  if (summary) {
    const summaryElement = document.createElement("p");
    summaryElement.className = "project-text__summary";
    summaryElement.textContent = summary;
    projectText.append(summaryElement);
  }

  if (year) {
    const yearElement = document.createElement("p");
    yearElement.className = "project-text__year";
    yearElement.textContent = year;
    projectText.append(yearElement);
  }

  if (body) {
    const bodyElement = document.createElement("p");
    bodyElement.className = "project-text__body";
    bodyElement.textContent = body;
    projectText.append(bodyElement);
  }
}

if (projectList) {
  const projectButtons = projectsData.projects.map((project) => {
    const button = document.createElement("button");
    button.className = "project-button";
    button.type = "button";
    button.textContent = project.title;
    button.dataset.projectSlug = project.slug;
    button.setAttribute("aria-pressed", "false");
    projectList.append(button);
    return button;
  });

  projectButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      setActiveProject(button, projectButtons);
      renderProjectCarousel(projectsData.projects[index]);
      renderProjectText(projectsData.projects[index]);
    });

    if (index === 0) {
      setActiveProject(button, projectButtons);
      renderProjectCarousel(projectsData.projects[index]);
      renderProjectText(projectsData.projects[index]);
    }
  });
}

carouselPreviousButton?.addEventListener("click", () => {
  moveCarousel(-1);
});

carouselNextButton?.addEventListener("click", () => {
  moveCarousel(1);
});

carouselTrack?.addEventListener("scroll", updateCarouselArrows);
carouselTrack?.addEventListener("scroll", queueCarouselSync);
window.addEventListener("resize", () => {
  updateCarouselEdgePadding();
  setActiveCarouselSlide(activeCarouselIndex, {
    align: true,
    behavior: "auto"
  });
});
