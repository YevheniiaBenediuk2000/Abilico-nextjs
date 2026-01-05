import { supabase } from "@/app/api/supabaseClient";
import { NextResponse } from "next/server";

// Allowed admin emails
const ALLOWED_ADMINS = [
  "yevheniiabenediuk@gmail.com",
  "victor.shevchuk.96@gmail.com",
];

// Helper to check admin access
async function checkAdminAccess(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { allowed: false, error: "Missing authorization header" };
    }

    const token = authHeader.split(" ")[1];

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { allowed: false, error: "Invalid token" };
    }

    if (!ALLOWED_ADMINS.includes(user.email)) {
      return { allowed: false, error: "Not authorized" };
    }

    return { allowed: true, user };
  } catch (e) {
    return { allowed: false, error: e.message };
  }
}

// GET - Fetch all obstacles
export async function GET(request) {
  const { allowed, error } = await checkAdminAccess(request);
  if (!allowed) {
    return NextResponse.json({ error }, { status: 403 });
  }

  try {
    const { data, error: dbError } = await supabase
      .from("obstacles")
      .select("*")
      .order("date_added", { ascending: false });

    if (dbError) throw dbError;

    console.log(`[Admin API] Fetched ${data?.length || 0} obstacles`);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[Admin API] Error fetching obstacles:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT - Update obstacle status
export async function PUT(request) {
  const { allowed, error } = await checkAdminAccess(request);
  if (!allowed) {
    return NextResponse.json({ error }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing id or status" },
        { status: 400 }
      );
    }

    const { data, error: dbError } = await supabase
      .from("obstacles")
      .update({ status })
      .eq("id", id)
      .select();

    if (dbError) throw dbError;

    console.log(`[Admin API] Updated obstacle ${id} status to ${status}`);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[Admin API] Error updating obstacle:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE - Delete obstacle
export async function DELETE(request) {
  const { allowed, error } = await checkAdminAccess(request);
  if (!allowed) {
    return NextResponse.json({ error }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error: dbError } = await supabase
      .from("obstacles")
      .delete()
      .eq("id", id);

    if (dbError) throw dbError;

    console.log(`[Admin API] Deleted obstacle ${id}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[Admin API] Error deleting obstacle:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
