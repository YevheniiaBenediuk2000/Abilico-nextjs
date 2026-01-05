"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/api/supabaseClient";

export default function AdminPanel() {
    const [user, setUser] = useState(null);
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            const email = data?.user?.email;
            const allowed = [
                "yevheniiabenediuk@gmail.com",
                "victor.shevchuk.96@gmail.com",
            ];
            if (allowed.includes(email)) setUser(data.user);
            else router.push("/auth");
        });
    }, [router]);

    if (!user) return <p>Checking access...</p>;

    return (
        <iframe
            src="https://abilico.appsmith.com/app/abilico-admin-panel/obstacles-691245bb71bf1d3aaa13dae5"
            style={{ width: "100%", height: "100vh", border: "none" }}
            allow="clipboard-read; clipboard-write"
        />
    );
}