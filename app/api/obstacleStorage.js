import { supabase } from "./supabaseClient.js";

export async function obstacleStorage(method = "GET", obstacleData) {
  try {
    if (method === "GET") {
      const { data, error } = await supabase.from("obstacles").select("*");
      if (error) throw error;
      return data;
    }

    if (method === "POST") {
      const { data, error } = await supabase
          .from("obstacles")
          .insert([obstacleData])
          .select(); // ✅ return inserted row(s)
      if (error) throw error;
      console.log("✅ Inserted:", data);
      return data;
    }

    if (method === "PUT") {
      // 🛠 Update an existing obstacle by ID
      const { id, ...updateFields } = obstacleData;
      const { data, error } = await supabase
          .from("obstacles")
          .update(updateFields)
          .eq("id", id)
          .select();
      if (error) throw error;
      console.log("✏️ Updated obstacle:", data);
      return data;
    }

    if (method === "DELETE") {
      const { error } = await supabase
          .from("obstacles")
          .delete()
          .eq("id", obstacleData.id);
      console.log("Deleting from Supabase with ID:", obstacleData.id);
      if (error) throw error;
      console.log("🗑️ Deleted obstacle:", obstacleData.id);
      return true;
    }
  } catch (e) {
    console.error("❌ Obstacle storage failed:", e);
    return [];
  }
}