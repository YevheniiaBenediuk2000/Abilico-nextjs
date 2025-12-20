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
      .select(`
        *,
        places (
          id,
          name,
          lat,
          lon,
          city,
          country
        )
      `)
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    console.log(`[Admin API] Fetched ${data?.length || 0} place reports with place data`);
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

    // Step 2: Determine new status (allow reversibility)
    const newStatus = action === "approve" ? "approved" : "rejected";
    const isReversal =
      (report.status === "approved" && action === "reject") ||
      (report.status === "rejected" && action === "approve");

    // Step 3: Update report status (always allowed for admins)
    // Note: We allow reversibility, but prevent duplicate actions (idempotency)
    // If status is already the target status, return success without update
    if (report.status === newStatus) {
      console.log(
        `[Admin API] Report ${id} already ${newStatus}, returning current state`
      );
      return NextResponse.json({ data: report });
    }
    const { data: updatedReport, error: updateError } = await supabase
      .from("place_reports")
      .update({ status: newStatus })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Step 4: Update place based on action and report reason
    if (report.place_id) {
      const placeUpdate = {
        updated_at: new Date().toISOString(),
      };

      if (action === "approve") {
        // Approve: Apply report data to place
        if (report.accessibility_reality) {
          placeUpdate.accessibility_status = report.accessibility_reality;
        }

        if (report.accessibility_issues && Array.isArray(report.accessibility_issues)) {
          placeUpdate.accessibility_keywords = report.accessibility_issues;
        }

        if (report.comment) {
          placeUpdate.accessibility_comment = report.comment;
        }

        // Handle permanently_closed reports
        if (report.reason === "permanently_closed") {
          placeUpdate.status = "closed";
        }
      } else if (action === "reject" && isReversal) {
        // Reject (reversal): Revert place state if it was previously approved
        if (report.reason === "permanently_closed") {
          // Revert closed status back to active
          placeUpdate.status = "active";
        }
        // For accessibility reports, we leave the place data unchanged
        // (simpler approach - previous state is preserved)
      }

      // Only update if there are changes to make
      if (Object.keys(placeUpdate).length > 1) {
        const { error: placeUpdateError } = await supabase
          .from("places")
          .update(placeUpdate)
          .eq("id", report.place_id);

        if (placeUpdateError) {
          console.error("[Admin API] Error updating place:", placeUpdateError);
          // Don't fail the whole request, but log the error
        } else {
          console.log(
            `[Admin API] Updated place ${report.place_id} (reversal: ${isReversal})`
          );
        }
      }
    }

    // Log action for audit trail
    console.log(
      `[Admin API] ${action === "approve" ? "Approved" : "Rejected"} report ${id}`,
      {
        reportId: id,
        action,
        previousStatus: report.status,
        newStatus: updatedReport.status,
        isReversal,
        placeId: report.place_id,
        placeUpdated: action === "approve" && report.place_id ? true : false,
      }
    );

    return NextResponse.json({ data: updatedReport });
  } catch (e) {
    console.error("[Admin API] Error processing report:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

