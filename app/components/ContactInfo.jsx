"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import LanguageIcon from "@mui/icons-material/Language";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";
import Avatar from "@mui/material/Avatar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { useState } from "react";

/**
 * ContactInfo component displays website, phone, and email with icons
 * @param {Object} props
 * @param {string|string[]} props.website - Website URL(s)
 * @param {string|string[]} props.phone - Phone number(s)
 * @param {string|string[]} props.email - Email address(es)
 */
export default function ContactInfo({ website, phone, email }) {
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);

  // Normalize inputs to arrays
  const websites = Array.isArray(website) ? website : website ? [website] : [];
  const phones = Array.isArray(phone) ? phone : phone ? [phone] : [];
  const emails = Array.isArray(email) ? email : email ? [email] : [];

  // Clean and filter valid values
  const validWebsites = websites
    .filter(Boolean)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const validPhones = phones
    .filter(Boolean)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const validEmails = emails
    .filter(Boolean)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes("@"));

  // If no contact info, don't render anything
  if (validWebsites.length === 0 && validPhones.length === 0 && validEmails.length === 0) {
    return null;
  }

  // Clean phone number for tel: link (remove spaces, keep + and digits)
  const cleanPhoneForTel = (phoneNum) => {
    return phoneNum.replace(/[\s\-\(\)]/g, "");
  };

  // Clean URL - ensure it has protocol
  const cleanUrl = (url) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handlePhoneClick = (e) => {
    if (validPhones.length > 1) {
      e.preventDefault();
      setPhoneDialogOpen(true);
    }
    // If single phone, let the link handle it (tel:)
  };

  const handlePhoneSelect = (phoneNum) => {
    window.location.href = `tel:${cleanPhoneForTel(phoneNum)}`;
    setPhoneDialogOpen(false);
  };

  return (
    <>
      <Box
        sx={{
          padding: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontSize: "0.875rem",
            fontWeight: 600,
            mb: 1.5,
            color: "text.primary",
          }}
        >
          Contact
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Website */}
          {validWebsites.map((url, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "primary.main",
                  fontSize: "0.875rem",
                }}
              >
                <LanguageIcon sx={{ fontSize: "1rem" }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    mb: 0.25,
                  }}
                >
                  Website
                </Typography>
                <Link
                  href={cleanUrl(url)}
                  target="_blank"
                  rel="noopener nofollow"
                  sx={{
                    fontSize: "0.875rem",
                    color: "primary.main",
                    textDecoration: "none",
                    "&:hover": {
                      textDecoration: "underline",
                    },
                    wordBreak: "break-all",
                  }}
                >
                  {url.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
                </Link>
              </Box>
            </Box>
          ))}

          {/* Phone */}
          {validPhones.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "primary.main",
                  fontSize: "0.875rem",
                }}
              >
                <PhoneIcon sx={{ fontSize: "1rem" }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    mb: 0.25,
                  }}
                >
                  Phone
                </Typography>
                {validPhones.length === 1 ? (
                  <Link
                    href={`tel:${cleanPhoneForTel(validPhones[0])}`}
                    sx={{
                      fontSize: "0.875rem",
                      color: "primary.main",
                      textDecoration: "none",
                      "&:hover": {
                        textDecoration: "underline",
                      },
                    }}
                  >
                    {validPhones[0]}
                  </Link>
                ) : (
                  <Link
                    href="#"
                    onClick={handlePhoneClick}
                    sx={{
                      fontSize: "0.875rem",
                      color: "primary.main",
                      textDecoration: "none",
                      cursor: "pointer",
                      "&:hover": {
                        textDecoration: "underline",
                      },
                    }}
                  >
                    {validPhones.length} phone numbers
                  </Link>
                )}
              </Box>
            </Box>
          )}

          {/* Email */}
          {validEmails.map((emailAddr, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "primary.main",
                  fontSize: "0.875rem",
                }}
              >
                <EmailIcon sx={{ fontSize: "1rem" }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    mb: 0.25,
                  }}
                >
                  Email
                </Typography>
                <Link
                  href={`mailto:${emailAddr}`}
                  sx={{
                    fontSize: "0.875rem",
                    color: "primary.main",
                    textDecoration: "none",
                    "&:hover": {
                      textDecoration: "underline",
                    },
                    wordBreak: "break-all",
                  }}
                >
                  {emailAddr}
                </Link>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Phone selection dialog */}
      <Dialog
        open={phoneDialogOpen}
        onClose={() => setPhoneDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Select Phone Number</DialogTitle>
        <DialogContent>
          <List>
            {validPhones.map((phoneNum, idx) => (
              <ListItem key={idx} disablePadding>
                <ListItemButton onClick={() => handlePhoneSelect(phoneNum)}>
                  <PhoneIcon sx={{ mr: 2, color: "primary.main" }} />
                  <ListItemText primary={phoneNum} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhoneDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

