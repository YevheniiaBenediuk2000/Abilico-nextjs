export const fetchSuggestions = async (query) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=100`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Search error:", error);
  }
};
