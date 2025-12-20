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

// GET - Fetch all place reports
export async function GET(request) {
  const { allowed, error } = await checkAdminAccess(request);
  if (!allowed) {
    return NextResponse.json({ error }, { status: 403 });
  }

  try {
    const { data, error: dbError } = await supabase
      .from("place_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    console.log(`[Admin API] Fetched ${data?.length || 0} place reports`);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[Admin API] Error fetching place reports:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT - Approve or reject a place report
export async function PUT(request) {
  const { allowed, error } = await checkAdminAccess(request);
  if (!allowed) {
    return NextResponse.json({ error }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, action } = body; // action: 'approve' or 'reject'

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing id or action" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Step 1: Fetch the report
    const { data: report, error: fetchError } = await supabase
      .from("place_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Step 2: Check if report is already handled
    if (report.status !== "pending") {
      return NextResponse.json(
        { error: `Report already ${report.status}` },
        { status: 400 }
      );
    }

    // Step 3: Update report status
    const newStatus = action === "approve" ? "approved" : "rejected";
    const { data: updatedReport, error: updateError } = await supabase
      .from("place_reports")
      .update({ status: newStatus })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Step 4: If approved, update the place
    if (action === "approve" && report.place_id) {
      const placeUpdate = {
        updated_at: new Date().toISOString(),
      };

      // Update accessibility_status if provided
      if (report.accessibility_reality) {
        placeUpdate.accessibility_status = report.accessibility_reality;
      }

      // Update accessibility_keywords if provided
      if (report.accessibility_issues && Array.isArray(report.accessibility_issues)) {
        placeUpdate.accessibility_keywords = report.accessibility_issues;
      }

      // Update accessibility_comment if provided
      if (report.comment) {
        placeUpdate.accessibility_comment = report.comment;
      }

      const { error: placeUpdateError } = await supabase
        .from("places")
        .update(placeUpdate)
        .eq("id", report.place_id);

      if (placeUpdateError) {
        console.error("[Admin API] Error updating place:", placeUpdateError);
        // Don't fail the whole request, but log the error
        // The report is already marked as approved
      } else {
        console.log(
          `[Admin API] Updated place ${report.place_id} with report data`
        );
      }
    }

    console.log(
      `[Admin API] ${action === "approve" ? "Approved" : "Rejected"} report ${id}`
    );
    return NextResponse.json({ data: updatedReport });
  } catch (e) {
    console.error("[Admin API] Error processing report:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

