import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Create a Supabase client with the service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Regular Supabase client for user verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// DELETE - Delete the authenticated user's account
export async function DELETE(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];

    // Verify the token and get the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid token or user not found" },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Delete user's profile data first (cascade should handle most, but being explicit)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Error deleting user profile:", profileError);
      // Continue with account deletion even if profile deletion fails
    }

    // Delete user's places
    const { error: placesError } = await supabaseAdmin
      .from("places")
      .delete()
      .eq("user_id", userId);

    if (placesError) {
      console.error("Error deleting user places:", placesError);
    }

    // Delete user's saved places
    const { error: savedPlacesError } = await supabaseAdmin
      .from("saved_places")
      .delete()
      .eq("user_id", userId);

    if (savedPlacesError) {
      console.error("Error deleting user saved places:", savedPlacesError);
    }

    // Delete user's reviews
    const { error: reviewsError } = await supabaseAdmin
      .from("reviews")
      .delete()
      .eq("user_id", userId);

    if (reviewsError) {
      console.error("Error deleting user reviews:", reviewsError);
    }

    // Delete user's ratings
    const { error: ratingsError } = await supabaseAdmin
      .from("ratings")
      .delete()
      .eq("user_id", userId);

    if (ratingsError) {
      console.error("Error deleting user ratings:", ratingsError);
    }

    // Delete user's votes
    const { error: votesError } = await supabaseAdmin
      .from("place_votes")
      .delete()
      .eq("user_id", userId);

    if (votesError) {
      console.error("Error deleting user votes:", votesError);
    }

    // Delete user's obstacles
    const { error: obstaclesError } = await supabaseAdmin
      .from("obstacles")
      .delete()
      .eq("user_id", userId);

    if (obstaclesError) {
      console.error("Error deleting user obstacles:", obstaclesError);
    }

    // Finally, delete the user from Supabase Auth using admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );

    if (deleteError) {
      console.error("Error deleting user account:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete user account" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Account deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in delete account:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
