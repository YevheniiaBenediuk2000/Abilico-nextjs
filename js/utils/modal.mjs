const modal = document.getElementById("constraint-modal");
const modalCloseBtn = document.getElementById("constraint-modal-close");

export function showModal(message) {
  modal.style.display = "block";
  modal.querySelector("h2").textContent = message;
}
const hideModal = () => (modal.style.display = "none");

modalCloseBtn.addEventListener("click", hideModal);
window.addEventListener("click", (e) => e.target === modal && hideModal());
