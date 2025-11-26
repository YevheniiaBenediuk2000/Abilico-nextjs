"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../auth/page";
import MapLayout from "../components/MapLayout";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import SecurityIcon from "@mui/icons-material/Security";
import EmailIcon from "@mui/icons-material/Email";
import { deepOrange, deepPurple } from "@mui/material/colors";

// Helper function to get initials from email
function getInitialsFromEmail(email) {
  if (!email) return "?";
  const parts = email.split("@")[0];
  const words = parts.split(/[._-]/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return parts.substring(0, 2).toUpperCase();
}

// Helper function to get color based on email
function getAvatarColor(email) {
  if (!email) return deepOrange[500];
  const hash = email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? deepOrange[500] : deepPurple[500];
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [securityExpanded, setSecurityExpanded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/auth");
      } else {
        setUser(data.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (!user) {
    return (
      <MapLayout isDashboard={true}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
          <Typography>Loading...</Typography>
        </Box>
      </MapLayout>
    );
  }

  return (
    <MapLayout isDashboard={true}>
      <Box
        sx={{
          maxWidth: 800,
          mx: "auto",
          mt: 4,
          mb: 4,
          px: 2,
        }}
      >
        <Card
          sx={{
            bgcolor: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <CardContent sx={{ p: 4 }}>
            {/* Profile Header */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                mb: 4,
              }}
            >
              <Avatar
                sx={{
                  bgcolor: getAvatarColor(user.email),
                  width: 80,
                  height: 80,
                  mb: 2,
                  fontSize: "2rem",
                }}
              >
                {getInitialsFromEmail(user.email)}
              </Avatar>
              <Typography variant="h5" component="h1" sx={{ mb: 1, fontWeight: 500 }}>
                Profile
              </Typography>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Email Section */}
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  mb: 2,
                }}
              >
                <EmailIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Email
                  </Typography>
                  <Typography variant="body1">{user.email}</Typography>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Security Section */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                Security
              </Typography>
              <List sx={{ bgcolor: "background.paper" }}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => setSecurityExpanded(!securityExpanded)}
                    sx={{
                      borderRadius: 1,
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <ListItemIcon>
                      <SecurityIcon sx={{ color: "text.secondary" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Security Settings"
                      secondary={securityExpanded ? "Click to collapse" : "Click to expand"}
                    />
                  </ListItemButton>
                </ListItem>
              </List>

              {/* Security Content (empty for now) */}
              {securityExpanded && (
                <Box
                  sx={{
                    mt: 2,
                    p: 2,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    minHeight: 100,
                  }}
                >
                  {/* Empty for now - will be populated later */}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </MapLayout>
  );
}

