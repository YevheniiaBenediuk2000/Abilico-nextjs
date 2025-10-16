export function showModal(message) {
  modal.style.display = "block";
  modal.querySelector("h2").textContent = message;
}
export const hideModal = () => (modal.style.display = "none");
