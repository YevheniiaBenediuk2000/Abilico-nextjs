"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../api/supabaseClient";
import { getNextRegistrationStep } from "../../utils/userPreferences";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";
import Grid from "@mui/material/Grid";
import Autocomplete from "@mui/material/Autocomplete";
import debounce from "lodash.debounce";

export default function RegisterPersonalInfoPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [country, setCountry] = useState("");
  const [countryOptions, setCountryOptions] = useState([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [countryInputValue, setCountryInputValue] = useState("");
  const [city, setCity] = useState("");
  const [cityOptions, setCityOptions] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityInputValue, setCityInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [validationError, setValidationError] = useState("");

  // Check if user is authenticated
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      setCheckingAuth(false);

      // Load existing profile data if available
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, home_area")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        // Split full_name into first name and surname
        if (profile.full_name) {
          const nameParts = profile.full_name.trim().split(/\s+/);
          if (nameParts.length >= 2) {
            setFirstName(nameParts.slice(0, -1).join(" ")); // Everything except last word
            setSurname(nameParts[nameParts.length - 1]); // Last word
          } else if (nameParts.length === 1) {
            setFirstName(nameParts[0]);
          }
        }

        // Parse home_area to extract city and country if it's in "City, Country" format
        if (profile.home_area) {
          const parts = profile.home_area.split(",").map((p) => p.trim());
          if (parts.length >= 2) {
            setCity(parts[0]);
            setCityInputValue(parts[0]);
            setCountry(parts.slice(1).join(", ")); // Handle cases like "City, State, Country"
          } else {
            // If not in expected format, treat as city
            setCity(profile.home_area);
            setCityInputValue(profile.home_area);
          }
        }
      }
    }
    checkAuth();
  }, [router]);

  // Memoized country search function
  const searchCountries = useMemo(
    () =>
      debounce(async (query) => {
        if (!query || query.length < 2) {
          setCountryOptions([]);
          return;
        }

        setCountryLoading(true);
        try {
          const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
            query
          )}&limit=30`;

          const response = await fetch(url);
          const data = await response.json();

          // Extract unique country names from all results
          // Prioritize results where osm_value is "country", but also include countries from other features
          const countries = new Map();
          (data.features || []).forEach((feature) => {
            const countryName = feature.properties.country;
            const placeType = feature.properties.osm_value;

            if (countryName) {
              // Prioritize direct country matches, but also collect countries from other features
              const isDirectCountry = placeType === "country";
              const existing = countries.get(countryName);

              if (!existing || (isDirectCountry && !existing.isDirect)) {
                countries.set(countryName, {
                  name: countryName,
                  isDirect: isDirectCountry,
                });
              }
            }
          });

          // Sort: direct country matches first, then alphabetically
          const sortedCountries = Array.from(countries.values())
            .sort((a, b) => {
              if (a.isDirect && !b.isDirect) return -1;
              if (!a.isDirect && b.isDirect) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((item) => item.name)
            .slice(0, 20);

          setCountryOptions(sortedCountries);
        } catch (error) {
          console.error("Error fetching countries:", error);
          setCountryOptions([]);
        } finally {
          setCountryLoading(false);
        }
      }, 200),
    []
  );

  // Memoized city search function
  const searchCities = useMemo(
    () =>
      debounce(async (query, selectedCountry) => {
        if (!query || query.length < 2 || !selectedCountry) {
          setCityOptions([]);
          return;
        }

        setCityLoading(true);
        try {
          // Build search query with city name and country
          const searchQuery = `${query}, ${selectedCountry}`;
          const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
            searchQuery
          )}&limit=15`;

          const response = await fetch(url);
          const data = await response.json();

          // Extract unique city names from the results
          const cities = new Map();
          (data.features || []).forEach((feature) => {
            const cityName = feature.properties.name;
            const cityCountry = feature.properties.country;
            const placeType = feature.properties.osm_value; // city, town, village, etc.

            // Only include cities/towns/villages from the selected country
            if (
              cityName &&
              cityCountry &&
              cityCountry.toLowerCase() === selectedCountry.toLowerCase() &&
              (placeType === "city" ||
                placeType === "town" ||
                placeType === "village")
            ) {
              // Use Map to avoid duplicates, prioritize cities over towns
              if (!cities.has(cityName)) {
                cities.set(cityName, { name: cityName, type: placeType });
              }
            }
          });

          // Sort: cities first, then towns, then villages, then alphabetically
          const sortedCities = Array.from(cities.values())
            .sort((a, b) => {
              const typeOrder = { city: 0, town: 1, village: 2 };
              const aOrder = typeOrder[a.type] ?? 3;
              const bOrder = typeOrder[b.type] ?? 3;
              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.name.localeCompare(b.name);
            })
            .map((item) => item.name)
            .slice(0, 10);

          setCityOptions(sortedCities);
        } catch (error) {
          console.error("Error fetching cities:", error);
          setCityOptions([]);
        } finally {
          setCityLoading(false);
        }
      }, 200),
    []
  );

  // Effect to search countries when input changes
  useEffect(() => {
    if (countryInputValue) {
      searchCountries(countryInputValue);
    } else {
      setCountryOptions([]);
      setCountryLoading(false);
    }
  }, [countryInputValue, searchCountries]);

  // Effect to search cities when input changes and country is selected
  useEffect(() => {
    if (cityInputValue && country) {
      searchCities(cityInputValue, country);
    } else {
      setCityOptions([]);
      setCityLoading(false);
    }
  }, [cityInputValue, country, searchCities]);

  const handleSkip = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      // Create a minimal profile entry if it doesn't exist (so flow knows user skipped this step)
      if (!existingProfile) {
        const { error } = await supabase.from("profiles").insert({
          id: user.id,
          full_name: null,
          home_area: null,
          accessibility_preferences: [],
          disability_types: [],
        });

        if (error) {
          console.error("Error creating profile:", error);
          // Continue anyway - user can still proceed
        }
      }

      // Navigate to next registration step
      const nextStep = await getNextRegistrationStep(supabase, user.id);
      router.push(nextStep || "/dashboard");
    } catch (error) {
      console.error("Error:", error);
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setValidationError("");

    // Build full name from first name and surname
    const fullName = [firstName.trim(), surname.trim()]
      .filter(Boolean)
      .join(" ");

    // Build home area from city and country
    const homeAreaParts = [city.trim(), country.trim()].filter(Boolean);
    const homeArea = homeAreaParts.length > 0 ? homeAreaParts.join(", ") : null;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      let error;
      // Only save if user provided at least one field
      const hasName = fullName && fullName.trim().length > 0;
      const hasHomeArea = homeArea && homeArea.trim().length > 0;

      if (existingProfile) {
        // Profile exists, update only provided fields
        const updateData = {};
        if (hasName) updateData.full_name = fullName.trim();
        if (hasHomeArea) updateData.home_area = homeArea;
        else if (!hasName) updateData.home_area = null; // Allow clearing home area

        if (Object.keys(updateData).length > 0) {
          ({ error } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("id", user.id));
        } else {
          // No changes, just continue
          error = null;
        }
      } else {
        // Profile doesn't exist, insert it (create with empty defaults if nothing provided)
        ({ error } = await supabase.from("profiles").insert({
          id: user.id,
          full_name: hasName ? fullName.trim() : null,
          home_area: hasHomeArea ? homeArea : null,
          accessibility_preferences: [],
          disability_types: [],
        }));
      }

      if (error) {
        console.error("Error saving personal info:", error);
        setValidationError(
          `Failed to save: ${error.message || "Unknown error"}`
        );
        setLoading(false);
        return;
      }

      // Navigate to next registration step
      const nextStep = await getNextRegistrationStep(supabase, user.id);
      router.push(nextStep || "/dashboard");
    } catch (error) {
      console.error("Error:", error);
      setValidationError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (checkingAuth) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
        py: 4,
        px: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: { xs: "100%", sm: 600 },
          width: "100%",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          borderRadius: 2,
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
          {/* Title */}
          <Typography
            variant="h4"
            component="h1"
            sx={{
              mb: 1.5,
              fontWeight: 600,
              textAlign: "center",
              color: "text.primary",
            }}
          >
            Tell us about yourself
          </Typography>

          {/* Description */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              mb: 5,
              textAlign: "center",
              fontSize: "0.95rem",
            }}
          >
            We'll use this information to personalise your experience.
          </Typography>

          {/* Name and Surname in one row */}
          <Grid container spacing={4} sx={{ mb: 5 }}>
            <Grid item xs={12} sm="auto">
              <TextField
                label="Name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setValidationError("");
                }}
                error={!!validationError && validationError.includes("Name")}
                autoFocus
                sx={{
                  width: { xs: "100%", sm: "500px" },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    fontSize: "1rem",
                    height: "56px",
                    "& fieldset": {
                      borderWidth: 1.5,
                      borderColor: "rgba(0, 0, 0, 0.23)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.5)",
                    },
                    "&.Mui-focused fieldset": {
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputBase-input": {
                    py: 1.5,
                    textAlign: "left",
                    "&::placeholder": {
                      color: "text.secondary",
                      opacity: 1,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    fontSize: "1rem",
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm="auto">
              <TextField
                label="Surname"
                value={surname}
                onChange={(e) => {
                  setSurname(e.target.value);
                  setValidationError("");
                }}
                sx={{
                  width: { xs: "100%", sm: "500px" },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    fontSize: "1rem",
                    height: "56px",
                    "& fieldset": {
                      borderWidth: 1.5,
                      borderColor: "rgba(0, 0, 0, 0.23)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.5)",
                    },
                    "&.Mui-focused fieldset": {
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputBase-input": {
                    py: 1.5,
                    textAlign: "left",
                    "&::placeholder": {
                      color: "text.secondary",
                      opacity: 1,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    fontSize: "1rem",
                  },
                }}
              />
            </Grid>
          </Grid>

          {/* Location Section - Country and City */}
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h6"
              component="label"
              sx={{
                mb: 2.5,
                fontWeight: 500,
                display: "block",
                color: "text.primary",
              }}
            >
              Location{" "}
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 400 }}
              >
                (Optional)
              </Typography>
            </Typography>

            <Grid container spacing={4}>
              <Grid item xs={12} sm="auto">
                <Autocomplete
                  freeSolo
                  options={countryOptions}
                  value={country}
                  loading={countryLoading}
                  inputValue={countryInputValue}
                  onInputChange={(event, newInputValue, reason) => {
                    setCountryInputValue(newInputValue);
                    if (reason === "input") {
                      // User is typing
                    }
                  }}
                  onChange={(event, newValue) => {
                    setCountry(newValue || "");
                    setCountryInputValue(newValue || "");
                    // Clear city when country changes
                    if (newValue !== country) {
                      setCity("");
                      setCityInputValue("");
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Country"
                      placeholder="Search or type country"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {countryLoading ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                      sx={{
                        width: { xs: "100%", sm: "500px" },
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          fontSize: "1rem",
                          height: "56px",
                          "& fieldset": {
                            borderWidth: 1.5,
                            borderColor: "rgba(0, 0, 0, 0.23)",
                          },
                          "&:hover fieldset": {
                            borderColor: "rgba(0, 0, 0, 0.5)",
                          },
                          "&.Mui-focused fieldset": {
                            borderWidth: 2,
                          },
                        },
                        "& .MuiInputBase-input": {
                          py: 1.5,
                          textAlign: "left",
                          "&::placeholder": {
                            color: "text.secondary",
                            opacity: 1,
                          },
                        },
                        "& .MuiAutocomplete-input": {
                          "&::placeholder": {
                            color: "text.secondary",
                            opacity: 1,
                          },
                        },
                        "& .MuiInputLabel-root": {
                          fontSize: "1rem",
                        },
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm="auto">
                <Autocomplete
                  freeSolo
                  options={cityOptions}
                  value={city}
                  loading={cityLoading}
                  disabled={!country}
                  inputValue={cityInputValue}
                  onInputChange={(event, newInputValue, reason) => {
                    setCityInputValue(newInputValue);
                    if (reason === "input") {
                      // User is typing
                    }
                  }}
                  onChange={(event, newValue) => {
                    setCity(newValue || "");
                    setCityInputValue(newValue || "");
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="City"
                      placeholder={
                        country ? "Search or type city" : "Select country first"
                      }
                      helperText={
                        country
                          ? "City or neighbourhood"
                          : "Please select a country first"
                      }
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {cityLoading ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                      sx={{
                        width: { xs: "100%", sm: "500px" },
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          fontSize: "1rem",
                          height: "56px",
                          "& fieldset": {
                            borderWidth: 1.5,
                            borderColor: "rgba(0, 0, 0, 0.23)",
                          },
                          "&:hover fieldset": {
                            borderColor: "rgba(0, 0, 0, 0.5)",
                          },
                          "&.Mui-focused fieldset": {
                            borderWidth: 2,
                          },
                        },
                        "& .MuiInputBase-input": {
                          py: 1.5,
                          textAlign: "left",
                          "&::placeholder": {
                            color: "text.secondary",
                            opacity: 1,
                          },
                        },
                        "& .MuiAutocomplete-input": {
                          "&::placeholder": {
                            color: "text.secondary",
                            opacity: 1,
                          },
                        },
                        "& .MuiInputLabel-root": {
                          fontSize: "1rem",
                        },
                      }}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>

          {/* Validation Error */}
          {validationError && (
            <Box sx={{ mb: 3 }}>
              <FormHelperText error sx={{ fontSize: "0.875rem" }}>
                {validationError}
              </FormHelperText>
            </Box>
          )}

          {/* Navigation Buttons */}
          <Stack direction="row" spacing={2} sx={{ mt: 5 }}>
            <Button
              variant="outlined"
              onClick={handleBack}
              disabled={loading}
              sx={{
                flex: 1,
                py: 1.25,
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              Back
            </Button>
            <Button
              variant="text"
              onClick={handleSkip}
              disabled={loading}
              sx={{
                flex: 1,
                py: 1.25,
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              Skip
            </Button>
            <Button
              variant="contained"
              onClick={handleContinue}
              disabled={loading}
              sx={{
                flex: 1,
                py: 1.25,
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 500,
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                "&:hover": {
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Continue"
              )}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
