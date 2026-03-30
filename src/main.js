import "./style.css";

const canvas = document.querySelector(".scene");
const context = canvas.getContext("2d");
const printButton = document.querySelector(".print-button");
const contactCard = document.querySelector(".contact-card");
const contactCardArt = document.querySelector(".contact-card__art");
const contactCardDownload = document.querySelector(".contact-card__download");

const state = {
  width: 0,
  height: 0,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  lastDrawPoint: null
};

const MIN_DRAW_DISTANCE = 18;

function resize() {
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  canvas.width = Math.floor(state.width * state.pixelRatio);
  canvas.height = Math.floor(state.height * state.pixelRatio);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;

  context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, state.width, state.height);
  context.fillStyle = "#111111";
  context.font = '28px "Courier New", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
}

function drawStar(x, y) {
  context.fillText("*", x, y);
}

function handlePointerMove(event) {
  const point = { x: event.clientX, y: event.clientY };

  if (state.lastDrawPoint) {
    const dx = point.x - state.lastDrawPoint.x;
    const dy = point.y - state.lastDrawPoint.y;
    const distance = Math.hypot(dx, dy);

    if (distance < MIN_DRAW_DISTANCE) {
      return;
    }
  }

  drawStar(event.clientX, event.clientY);
  state.lastDrawPoint = point;
}

function resetBrush() {
  state.lastDrawPoint = null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function renderCardImage(snapshot) {
  const image = await loadImage(snapshot);
  const exportCanvas = document.createElement("canvas");
  const exportContext = exportCanvas.getContext("2d");
  const cardWidth = 900;
  const cardHeight = 540;
  const artHeight = 260;

  exportCanvas.width = cardWidth;
  exportCanvas.height = cardHeight;

  exportContext.fillStyle = "#ffffff";
  exportContext.fillRect(0, 0, cardWidth, cardHeight);
  exportContext.drawImage(image, 0, 0, cardWidth, artHeight);

  exportContext.strokeStyle = "#111111";
  exportContext.lineWidth = 3;
  exportContext.strokeRect(0, 0, cardWidth, cardHeight);
  exportContext.beginPath();
  exportContext.moveTo(0, artHeight);
  exportContext.lineTo(cardWidth, artHeight);
  exportContext.stroke();

  exportContext.fillStyle = "#111111";
  exportContext.font = '24px "Courier New", monospace';
  exportContext.fillText("CONTACT", 48, 320);

  exportContext.font = '52px "Courier New", monospace';
  exportContext.fillText("Iona Studio", 48, 388);

  exportContext.font = '22px "Courier New", monospace';
  exportContext.fillText("Design interactif et experiences web", 48, 432);
  exportContext.fillText("bonjour@iona.studio", 48, 472);
  exportContext.fillText("+33 1 23 45 67 89", 48, 506);

  exportContext.textAlign = "right";
  exportContext.fillText("iona.studio", cardWidth - 48, 506);

  return exportCanvas.toDataURL("image/png");
}

async function captureCardBackground() {
  const snapshot = canvas.toDataURL("image/png");
  const downloadableCard = await renderCardImage(snapshot);

  contactCardArt.style.backgroundImage = `url("${snapshot}")`;
  contactCardDownload.href = downloadableCard;
  contactCard.classList.add("is-visible");
}

resize();

window.addEventListener("resize", resize);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerleave", resetBrush);
printButton.addEventListener("click", () => {
  captureCardBackground().catch((error) => {
    console.error(error);
  });
});
