import "./style.css";

const categoryButtons = document.querySelectorAll(".category-button");

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
