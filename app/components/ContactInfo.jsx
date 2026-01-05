"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import LanguageIcon from "@mui/icons-material/Language";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";
import ContactMailIcon from "@mui/icons-material/ContactMail";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import IconButton from "@mui/material/IconButton";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import { alpha } from "@mui/material/styles";
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

  // Contact item component for better reusability
  const ContactItem = ({ icon: Icon, label, value, href, onClick, external = false, count }) => {
    const content = (
      <Card
        sx={{
          mb: 1.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            borderColor: "primary.main",
            boxShadow: (theme) => `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
            transform: "translateY(-1px)",
          },
        }}
      >
        <CardActionArea
          component={onClick ? "button" : "a"}
          href={onClick ? undefined : href}
          onClick={onClick}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener nofollow" : undefined}
          sx={{
            p: 0,
            "&:hover": {
              backgroundColor: "transparent",
            },
          }}
        >
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* Icon Container */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  color: "primary.main",
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 24 }} />
              </Box>

              {/* Content */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    mb: 0.5,
                  }}
                >
                  {label}
                </Typography>
                <Box
                  sx={{
                    color: "text.primary",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    wordBreak: "break-word",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      color: "text.primary",
                      fontSize: "0.9375rem",
                      fontWeight: 500,
                      wordBreak: "break-word",
                    }}
                  >
                    {value}
                  </Typography>
                  {external && (
                    <OpenInNewIcon
                      sx={{
                        fontSize: 16,
                        color: "text.secondary",
                        ml: 0.5,
                      }}
                    />
                  )}
                  {count && count > 1 && (
                    <Chip
                      label={count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.6875rem",
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        color: "primary.main",
                        fontWeight: 600,
                      }}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    );

    return content;
  };

  return (
    <>
      <Box
        sx={{
          padding: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 1.5,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
              color: "primary.main",
            }}
          >
            <ContactMailIcon sx={{ fontSize: 22 }} />
          </Box>
          <Typography
            variant="h6"
            sx={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Contact Information
          </Typography>
        </Box>

        {/* Contact Items */}
        <Box>
          {/* Website */}
          {validWebsites.map((url, idx) => (
            <ContactItem
              key={idx}
              icon={LanguageIcon}
              label="Website"
              value={url.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              href={cleanUrl(url)}
              external={true}
            />
          ))}

          {/* Phone */}
          {validPhones.length > 0 && (
            <ContactItem
              icon={PhoneIcon}
              label="Phone"
              value={
                validPhones.length === 1
                  ? validPhones[0]
                  : `${validPhones.length} phone numbers`
              }
              href={
                validPhones.length === 1
                  ? `tel:${cleanPhoneForTel(validPhones[0])}`
                  : undefined
              }
              onClick={validPhones.length > 1 ? handlePhoneClick : undefined}
              count={validPhones.length > 1 ? validPhones.length : undefined}
            />
          )}

          {/* Email */}
          {validEmails.map((emailAddr, idx) => (
            <ContactItem
              key={idx}
              icon={EmailIcon}
              label="Email"
              value={emailAddr}
              href={`mailto:${emailAddr}`}
            />
          ))}
        </Box>
      </Box>

      {/* Phone selection dialog */}
      <Dialog
        open={phoneDialogOpen}
        onClose={() => setPhoneDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle
          sx={{
            pb: 1.5,
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Select Phone Number
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 0 }}>
          <List sx={{ py: 1.5 }}>
            {validPhones.map((phoneNum, idx) => (
              <ListItem key={idx} disablePadding>
                <ListItemButton
                  onClick={() => handlePhoneSelect(phoneNum)}
                  sx={{
                    py: 1.75,
                    px: 2.5,
                    borderRadius: 1.5,
                    mx: 1.5,
                    mb: 0.75,
                    transition: "all 0.2s ease-in-out",
                    "&:hover": {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                      transform: "translateX(2px)",
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 56, mr: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 1.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        color: "primary.main",
                      }}
                    >
                      <PhoneIcon sx={{ fontSize: 22 }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={phoneNum}
                    primaryTypographyProps={{
                      sx: {
                        fontWeight: 500,
                        fontSize: "0.9375rem",
                        color: "text.primary",
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setPhoneDialogOpen(false)}
            variant="outlined"
            sx={{
              borderRadius: 1.5,
              textTransform: "none",
              px: 2,
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

