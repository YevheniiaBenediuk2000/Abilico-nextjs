import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Fetch all user-submitted places
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("places")
      .select(
        `id,
        osm_id,
        name,
        country,
        city,
        lat,
        lon,
        created_at,
        place_type,
        source,
        photos,
        submitted_by_name,
        submitted_by_email,
        accessibility_comments,
        accessibility_keywords,
        status`
      )
      .eq("source", "user")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching places:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete a place
export async function DELETE(request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("places").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting place:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update place status
export async function PATCH(request) {
  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "ID and status are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("places")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error updating place:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
