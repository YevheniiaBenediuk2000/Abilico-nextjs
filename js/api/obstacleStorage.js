export async function obstacleStorage(method = "GET", obstacleFeatures) {
  const OBSTACLES_API = "https://api.jsonbin.io/v3/b/6845f7fc8960c979a5a6c156";

  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key":
          "$2a$10$CjX0SSivai4LuK1ps.sJ6.FKHGD47V/3f8GYK8no8xge0UWBPIwbq",
        "X-Access-Key":
          "$2a$10$SjMeRlsBbS2GI3An8hRhouhWQJ7AN800E.UmFOm2JBiIxgFm4WkxO",
      },
    };
    if (method === "PUT") {
      options.body = JSON.stringify(obstacleFeatures);
    }

    const response = await fetch(OBSTACLES_API, options);

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return data.record;
  } catch (e) {
    console.error("Loading obstacles failed:", e);
  }
}

export async function reviewStorage(method = "GET", reviews) {
  const REVIEWS_API = "https://api.jsonbin.io/v3/b/68460b568a456b7966ab06c7";

  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key":
          "$2a$10$CjX0SSivai4LuK1ps.sJ6.FKHGD47V/3f8GYK8no8xge0UWBPIwbq",
        "X-Access-Key":
          "$2a$10$SjMeRlsBbS2GI3An8hRhouhWQJ7AN800E.UmFOm2JBiIxgFm4WkxO",
      },
    };
    if (method === "PUT") {
      options.body = JSON.stringify(reviews);
    }

    const response = await fetch(REVIEWS_API, options);

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return data.record;
  } catch (e) {
    console.error("Loading obstacles failed:", e);
    return [];
  }
}
