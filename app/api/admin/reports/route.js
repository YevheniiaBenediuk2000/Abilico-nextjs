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
      .select(
        `
        *,
        places (
          id,
          name,
          lat,
          lon,
          city,
          country
        )
      `
      )
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    console.log(
      `[Admin API] Fetched ${data?.length || 0} place reports with place data`
    );
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
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
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
      const placeUpdate = {};

      // DEBUG: Log the report data to see what we're working with
      console.log("[Admin API] DEBUG - Report data:", {
        place_id: report.place_id,
        reason: report.reason,
        accessibility_reality: report.accessibility_reality,
        accessibility_issues: report.accessibility_issues,
        comment: report.comment,
        action: action,
      });

      if (action === "approve") {
        // Approve: Apply ONLY the fields that the user actually submitted in the report
        // Do not overwrite existing place data with null/empty values
        // This ensures partial updates work correctly (e.g., only accessibility_status submitted)

        // Update user_reported_accessibility (JSONB object with wheelchair key)
        // This is the field the frontend looks for to display corrected accessibility
        if (
          report.accessibility_reality &&
          report.accessibility_reality.trim() !== ""
        ) {
          // Store as JSONB object with wheelchair key for frontend compatibility
          placeUpdate.user_reported_accessibility = {
            wheelchair: report.accessibility_reality,
          };
          // Also update accessibility_status for backwards compatibility
          placeUpdate.accessibility_status = report.accessibility_reality;

          console.log("[Admin API] DEBUG - Will update accessibility:", {
            user_reported_accessibility:
              placeUpdate.user_reported_accessibility,
            accessibility_status: placeUpdate.accessibility_status,
          });
        } else {
          console.log(
            "[Admin API] DEBUG - No accessibility_reality in report, skipping accessibility update"
          );
        }

        // Only update accessibility_keywords if user submitted it (not null/empty array)
        if (
          report.accessibility_issues &&
          Array.isArray(report.accessibility_issues) &&
          report.accessibility_issues.length > 0
        ) {
          placeUpdate.accessibility_keywords = report.accessibility_issues;
        }

        // Update user_reported_accessibility_comment (for frontend display)
        // Also keep accessibility_comment for backwards compatibility
        if (report.comment && report.comment.trim() !== "") {
          placeUpdate.user_reported_accessibility_comment = report.comment;
          placeUpdate.accessibility_comment = report.comment;
        }

        // Handle permanently_closed reports
        // When a place is confirmed as permanently closed:
        // 1. Mark status as 'closed' (soft delete - preserves data integrity)
        // 2. Add context message indicating admin verification
        // 3. Place will be excluded from user-facing queries (see fetchUserPlaces.js)
        // 4. Place remains in database for historical data and referential integrity
        if (report.reason === "permanently_closed") {
          placeUpdate.status = "closed";
          // Add clear context message about closure
          const closureMessage =
            "Marked as permanently closed (verified by admin)";
          if (report.comment && report.comment.trim() !== "") {
            placeUpdate.accessibility_comment = `${closureMessage}. ${report.comment}`;
            placeUpdate.user_reported_accessibility_comment = `${closureMessage}. ${report.comment}`;
          } else {
            placeUpdate.accessibility_comment = closureMessage;
            placeUpdate.user_reported_accessibility_comment = closureMessage;
          }
        }
      } else if (action === "reject" && isReversal) {
        // Reject (reversal): Revert place state if it was previously approved
        if (report.reason === "permanently_closed") {
          // Revert closed status back to active
          placeUpdate.status = "active";
        }
        // For accessibility reports, clear the user-reported fields when rejecting a reversal
        placeUpdate.user_reported_accessibility = null;
        placeUpdate.user_reported_accessibility_comment = null;
      }

      // DEBUG: Log what we're about to update
      console.log(
        "[Admin API] DEBUG - placeUpdate object:",
        JSON.stringify(placeUpdate, null, 2)
      );
      console.log(
        "[Admin API] DEBUG - placeUpdate keys count:",
        Object.keys(placeUpdate).length
      );

      // Only update if there are changes to make (at least 1 field)
      if (Object.keys(placeUpdate).length > 0) {
        console.log(
          "[Admin API] DEBUG - Executing place update for place_id:",
          report.place_id
        );

        const { data: updatedPlace, error: placeUpdateError } = await supabase
          .from("places")
          .update(placeUpdate)
          .eq("id", report.place_id)
          .select();

        if (placeUpdateError) {
          console.error("[Admin API] ERROR updating place:", placeUpdateError);
          console.error(
            "[Admin API] ERROR details:",
            JSON.stringify(placeUpdateError, null, 2)
          );
          // Don't fail the whole request, but log the error
        } else {
          console.log(
            "[Admin API] SUCCESS - Updated place:",
            JSON.stringify(updatedPlace, null, 2)
          );
        }
      } else {
        console.log(
          "[Admin API] DEBUG - No changes to make (only updated_at), skipping place update"
        );
      }
    } else {
      console.log(
        "[Admin API] DEBUG - No place_id in report, skipping place update"
      );
    }

    // Log action for audit trail
    console.log(
      `[Admin API] ${
        action === "approve" ? "Approved" : "Rejected"
      } report ${id}`,
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