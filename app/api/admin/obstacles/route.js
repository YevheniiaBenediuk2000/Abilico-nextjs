import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Fetch all obstacles
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("obstacles")
      .select("*")
      .order("date_added", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching obstacles:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete an obstacle
export async function DELETE(request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("obstacles").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting obstacle:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update obstacle status
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
      .from("obstacles")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error updating obstacle:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
