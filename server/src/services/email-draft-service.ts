import nodemailer from "nodemailer";
import type { RawFinding } from "./review-engine.js";
import { get } from "../db/queries.js";
import { decrypt } from "./encryption-service.js";

export function generateEmailDraft(
  repoName: string,
  findings: RawFinding[],
  aiOverview: string,
  changedFiles?: string[]
): string {
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const formatFinding = (f: RawFinding, index: number) => {
    const location = f.file_path + (f.line_number ? `:${f.line_number}` : "");
    const category = f.category ? ` [${f.category}]` : "";
    const fix = f.suggested_fix ? `\n     Suggested Fix:\n       ${f.suggested_fix.replace(/\n/g, "\n       ")}` : "";
    return `  ${index + 1}. ${f.summary}${category}\n     File: ${location}\n     ${f.explanation}${fix}`;
  };

  const sectionBlock = (label: string, items: RawFinding[]) => {
    if (items.length === 0) return "";
    return `${label} (${items.length}):\n\n${items.map(formatFinding).join("\n\n")}\n\n`;
  };

  const filesList = changedFiles && changedFiles.length > 0
    ? changedFiles.map((f) => `  • ${f}`).join("\n")
    : "  (none)";

  const overviewSection = [
    aiOverview,
    "",
    `Files Reviewed (${changedFiles?.length ?? 0}):`,
    filesList,
  ].join("\n");

  const findingsBody = findings.length === 0
    ? "No issues found. The diff looks clean.\n"
    : `${sectionBlock("MUST FIX", grouped.must_fix)}${sectionBlock("SHOULD FIX SOON", grouped.should_fix_soon)}${sectionBlock("CAN IGNORE", grouped.ignore)}`;

  return `Hi Team,

AutoReview completed a code review for ${repoName}.

─────────────────────────────────────────────
OVERVIEW
─────────────────────────────────────────────

${overviewSection}

─────────────────────────────────────────────
SUMMARY
─────────────────────────────────────────────
  Must Fix        : ${grouped.must_fix.length}
  Should Fix Soon : ${grouped.should_fix_soon.length}
  Can Ignore      : ${grouped.ignore.length}
  Total Findings  : ${findings.length}

─────────────────────────────────────────────
FINDINGS
─────────────────────────────────────────────

${findingsBody}─────────────────────────────────────────────

Regards,
AutoReview`;
}

export async function sendReviewEmail(
  repoId: string,
  repoName: string,
  findings: RawFinding[],
  aiOverview: string,
  changedFiles?: string[]
): Promise<void> {
  const repo = await get<{
    smtp_host: string; smtp_port: number; smtp_user: string;
    smtp_password_encrypted: string; smtp_from_address: string;
    notification_recipients: string | null;
  }>(
    "SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address, notification_recipients FROM repositories WHERE id = ?",
    [repoId]
  );

  if (!repo || !repo.smtp_host) throw new Error("SMTP not configured for this repository");

  const smtpPassword = repo.smtp_password_encrypted ? decrypt(repo.smtp_password_encrypted) : "";

  const transporter = nodemailer.createTransport({
    host: repo.smtp_host,
    port: repo.smtp_port,
    auth: { user: repo.smtp_user, pass: smtpPassword },
  });

  const mustCount = findings.filter((f) => f.risk_level === "must_fix").length;
  const statusTag = mustCount > 0 ? `⚠ ${mustCount} Must Fix` : findings.length > 0 ? `${findings.length} Findings` : "Clean";

  const subject = `[AutoReview] ${repoName} — ${statusTag}`;

  const body = generateEmailDraft(repoName, findings, aiOverview, changedFiles);

  await transporter.sendMail({
    from: repo.smtp_from_address,
    to: repo.notification_recipients || "",
    subject,
    text: body,
  });
}
