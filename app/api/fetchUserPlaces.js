import { supabase } from "./supabaseClient.js";

/**
 * Fetches user-added places from Supabase and converts them to GeoJSON format.
 * User places have source = 'user' and osm_id = null.
 * @param {L.LatLngBounds} bounds - Map bounds to filter places
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchUserPlaces(bounds) {
  try {
    const s = bounds.getSouth();
    const w = bounds.getWest();
    const n = bounds.getNorth();
    const e = bounds.getEast();

    // Query places within bounds where source = 'user' and status is 'active'
    // Closed and archived places are excluded from user-facing queries (preserved for admin/history)
    const { data, error } = await supabase
      .from("places")
      .select("*")
      .eq("source", "user")
      .is("osm_id", null) // Ensure only user-added places
      .eq("status", "active") // Only show active places (excludes closed and archived)
      .gte("lat", s)
      .lte("lat", n)
      .gte("lon", w)
      .lte("lon", e);

    if (error) {
      console.error("Error fetching user places:", error);
      return { type: "FeatureCollection", features: [] };
    }

    if (!data || data.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    // Convert Supabase rows to GeoJSON features
    const features = data.map((place) => {
      // Convert place_type to OSM-style tags for icon generation
      const tags = {
        name: place.name,
        place_type: place.place_type,
        source: place.source,
        id: place.id, // Store Supabase ID for reference
      };

      // Map place_type to OSM tags for proper icon display
      // IMPORTANT: Map to tags that makiIconFor.mjs recognizes!
      // Check makiIconFor.mjs for the correct tag mappings
      if (place.place_type) {
        // Map our place types to OSM-style tags that match makiIconFor.mjs mappings
        const typeToTag = {
          // Tourism (hotel uses tourism, not amenity!) - see TOURISM_TO_MAKI
          hotel: { tourism: "hotel" }, // tourism:hotel -> "lodging" icon in makiIconFor
          
          // Amenities (food & drink) - see AMENITY_TO_MAKI
          restaurant: { amenity: "restaurant" }, // amenity:restaurant -> "restaurant" icon
          cafe: { amenity: "cafe" }, // amenity:cafe -> "cafe" icon
          
          // Amenities (healthcare) - see AMENITY_TO_MAKI
          hospital: { amenity: "hospital" }, // amenity:hospital -> "hospital" icon
          pharmacy: { amenity: "pharmacy" }, // amenity:pharmacy -> "pharmacy" icon
          
          // Amenities (learning & culture) - see AMENITY_TO_MAKI
          library: { amenity: "library" }, // amenity:library -> "library" icon
          school: { amenity: "school" }, // amenity:school -> "school" icon
          
          // Leisure - see LEISURE_TO_MAKI
          park: { leisure: "park" }, // leisure:park -> "park" icon
          
          // Amenities (water & toilets) - see AMENITY_TO_MAKI
          toilet: { amenity: "toilets" }, // amenity:toilets -> "toilet" icon
          
          // Amenities (mobility) - see AMENITY_TO_MAKI
          parking: { amenity: "parking" }, // amenity:parking -> "parking" icon
          
          // Shop - see SHOP_TO_MAKI
          shop: { shop: "general" }, // shop:general -> "shop" icon (fallback)
          
          // Public transport - see PUBTRANS_TO_MAKI
          stop: { public_transport: "stop_position" }, // public_transport:stop_position -> "bus" icon
          
          // Amenities (shelter) - might not have direct mapping, will use fallback
          shelter: { amenity: "shelter" }, // amenity:shelter -> fallback to "information"
          
          // Housing - not a standard OSM tag, use residential (might not work)
          housing: { amenity: "residential" }, // This might not work, will fallback
          
          // Other - fallback
          other: {}, // Will use fallback "information" icon
        };

        const tagMapping = typeToTag[place.place_type];
        if (tagMapping) {
          Object.assign(tags, tagMapping);
        } else {
          // Fallback: try as amenity if not found
          tags.amenity = place.place_type;
        }

        // Add place_type as a tag for filtering
        tags.place_type = place.place_type;
      }

      // Add additional user-submitted data as tags
      if (place.city) tags["addr:city"] = place.city;
      if (place.country) tags["addr:country"] = place.country;
      if (place.accessibility_comments) tags.accessibility_comments = place.accessibility_comments;
      if (place.photos && Array.isArray(place.photos)) tags.photos = place.photos;

      // Add OSM-standard accessibility tags for proper icon coloring
      // These values come from accessibility_keywords JSONB field (designated, yes, limited, no)
      // They will be used by getAccessibilityTier() to determine badge color
      if (place.accessibility_keywords && typeof place.accessibility_keywords === 'object') {
        const accKw = place.accessibility_keywords;
        
        // Overall accessibility - OSM standard: wheelchair=designated/yes/limited/no
        if (accKw.wheelchair) {
          tags.wheelchair = accKw.wheelchair;
        }
        
        // Step-free entrance - store as additional info
        if (accKw.step_free_entrance) {
          tags["entrance:step_free"] = accKw.step_free_entrance;
        }
        
        // Accessible toilet - OSM uses toilets:wheelchair or wheelchair:toilets
        if (accKw.accessible_toilet) {
          tags["toilets:wheelchair"] = accKw.accessible_toilet; // OSM standard
        }
      }

      // Create GeoJSON feature
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [place.lon, place.lat],
        },
        properties: {
          id: place.id, // Supabase UUID
          osm_id: null, // User places have no OSM ID
          osm_type: null,
          name: place.name,
          tags: tags,
          // Store source for reference
          source: "user",
          place_type: place.place_type,
        },
      };
    });

    return {
      type: "FeatureCollection",
      features: features,
    };
  } catch (error) {
    console.error("Error in fetchUserPlaces:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

