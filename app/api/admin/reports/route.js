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
          country,
          status
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
    // Core principle: Reports never directly change places. Admins confirm reports → admin actions change places.
    if (report.place_id && action === "approve") {
      const placeUpdate = {
        updated_at: new Date().toISOString(),
      };

      // Handle each report type according to the moderation model
      switch (report.reason) {
        case "accessibility_info_wrong":
          // ✅ Place stays visible
          // ✅ User-reported accessibility info is ADDED (not replacing original)
          // ❌ Place is NOT removed
          
          // Store user-reported accessibility in a separate field
          // This preserves the original OSM/place accessibility status
          const userReportedAccessibility = {};
          
          // Map accessibility_reality to wheelchair field (if provided)
          if (report.accessibility_reality && report.accessibility_reality.trim() !== "") {
            userReportedAccessibility.wheelchair = report.accessibility_reality.trim();
          }
          
          // Map accessibility_issues array (if provided)
          if (report.accessibility_issues && Array.isArray(report.accessibility_issues) && report.accessibility_issues.length > 0) {
            userReportedAccessibility.issues = report.accessibility_issues;
          }
          
          // Store user-reported accessibility in a dedicated field
          // This allows displaying both original and user-reported status
          placeUpdate.user_reported_accessibility = userReportedAccessibility;
          
          // Also store the report comment if provided
          if (report.comment && report.comment.trim() !== "") {
            placeUpdate.user_reported_accessibility_comment = report.comment.trim();
          }
          
          // Optional: Set last_verified_at if field exists
          placeUpdate.last_verified_at = new Date().toISOString();
          break;

        case "permanently_closed":
          // ✅ Place becomes inactive / hidden (status = 'closed')
          // ❌ Place is NOT deleted
          // ❌ Routes should avoid it
          // ❌ Should not appear in search
          placeUpdate.status = "closed";
          // Add context message about closure
          const closureMessage = "Marked as permanently closed (verified by admin)";
          if (report.comment && report.comment.trim() !== "") {
            placeUpdate.accessibility_comment = `${closureMessage}. ${report.comment}`;
          } else {
            placeUpdate.accessibility_comment = closureMessage;
          }
          break;

        case "wrong_type":
          // ✅ Place stays visible
          // ✅ Category is corrected
          // Note: For "wrong_type" reports, the admin should manually update place_type
          // This is a placeholder - in a full implementation, you might want to accept
          // a corrected_type field from the admin panel
          // For now, we log that this needs manual admin action
          console.log(
            `[Admin API] Report ${id}: wrong_type - requires manual category update by admin`
          );
          // If the report has a suggested_type in comment or metadata, you could use it here
          // For now, we'll just update the timestamp to indicate action was taken
          break;

        case "duplicate":
          // ✅ One place remains active
          // ❌ Duplicate place is archived
          // 🔗 Optional: merged into canonical place (future enhancement)
          placeUpdate.status = "archived";
          // Add context message
          const archiveMessage = "Marked as duplicate (verified by admin)";
          if (report.comment && report.comment.trim() !== "") {
            placeUpdate.accessibility_comment = `${archiveMessage}. ${report.comment}`;
          } else {
            placeUpdate.accessibility_comment = archiveMessage;
          }
          break;

        case "location_wrong":
          // ✅ Coordinates updated
          // ✅ Place stays active
          // Note: For "location_wrong" reports, the admin should manually update coordinates
          // This requires admin to search via Photon/map and drag pin
          // For now, we log that this needs manual admin action
          console.log(
            `[Admin API] Report ${id}: location_wrong - requires manual coordinate update by admin`
          );
          // If the report has corrected coordinates in metadata, you could use them here
          // For now, we'll just update the timestamp to indicate action was taken
          break;

        case "other":
          // ⚠ Admin decision required
          // Admin chooses one: Update accessibility, Update category, Mark closed, Archive place, Reject report
          // "Other" is intentionally non-automated
          console.log(
            `[Admin API] Report ${id}: other - requires manual admin decision`
          );
          // No automatic place update for "other" reports
          // Admin must manually decide what action to take
          break;

        default:
          // Unknown reason - log for investigation
          console.warn(
            `[Admin API] Report ${id}: Unknown reason "${report.reason}" - no automatic action`
          );
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
            `[Admin API] Updated place ${report.place_id} for reason: ${report.reason}`
          );
        }
      }
    } else if (report.place_id && action === "reject" && isReversal) {
      // Reject (reversal): Revert place state if it was previously approved
      const placeUpdate = {
        updated_at: new Date().toISOString(),
      };

      // Revert based on the original report reason
      switch (report.reason) {
        case "permanently_closed":
          // Revert closed status back to active
          placeUpdate.status = "active";
          break;

        case "duplicate":
          // Revert archived status back to active
          placeUpdate.status = "active";
          break;

        case "accessibility_info_wrong":
          // Revert: Clear user-reported accessibility by setting to null
          placeUpdate.user_reported_accessibility = null;
          placeUpdate.user_reported_accessibility_comment = null;
          break;

        case "wrong_type":
        case "location_wrong":
        case "other":
          // These don't have automatic updates, so no reversal needed
          break;
      }

      // Only update if there are changes to make
      if (Object.keys(placeUpdate).length > 1) {
        const { error: placeUpdateError } = await supabase
          .from("places")
          .update(placeUpdate)
          .eq("id", report.place_id);

        if (placeUpdateError) {
          console.error("[Admin API] Error reverting place:", placeUpdateError);
        } else {
          console.log(
            `[Admin API] Reverted place ${report.place_id} (reversal of ${report.reason})`
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

