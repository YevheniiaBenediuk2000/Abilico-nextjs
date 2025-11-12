// middleware.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function middleware(req) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: req.headers.get("Authorization") } } }
    );

    const { data } = await supabase.auth.getUser();

    const allowed = [
        "yevheniiabenediuk@gmail.com",
        "victor.shevchuk.96@gmail.com",
    ];

    if (!data?.user || !allowed.includes(data.user.email)) {
        // redirect to /auth page if not logged in or not allowed
        return NextResponse.redirect(new URL("/auth", req.url));
    }

    // otherwise allow access
    return NextResponse.next();
}

// restrict to /admin routes only
export const config = {
    matcher: ["/admin/:path*"],
};