const detailsPanel = document.getElementById("details-panel");

const destinationSearchBar = document.getElementById("destination-search-bar");
const destinationSearchBarHome = destinationSearchBar.parentElement;
const destinationSearchInput = document.getElementById(
  "destination-search-input"
);
const destinationSuggestions = document.getElementById(
  "destination-suggestions"
);

const departureSearchBar = document.getElementById("departure-search-bar");
const departureSearchInput = document.getElementById("departure-search-input");
const departureSuggestions = document.getElementById("departure-suggestions");

const reviewForm = detailsPanel.querySelector("#review-form");
const reviewsList = detailsPanel.querySelector("#reviews-list");
const submitReviewBtn = detailsPanel.querySelector("#submit-review-btn");

const offcanvasEl = document.getElementById("placeOffcanvas");
const offcanvasTitle = document.getElementById("placeOffcanvasLabel");

const directionsUi = document.getElementById("directions-ui");

const elements = {
  detailsPanel,
  destinationSearchBar,
  destinationSearchBarHome,
  destinationSearchInput,
  destinationSuggestions,
  departureSearchBar,
  departureSearchInput,
  departureSuggestions,
  reviewForm,
  reviewsList,
  submitReviewBtn,
  offcanvasEl,
  offcanvasTitle,
  directionsUi,
};

export default elements;
