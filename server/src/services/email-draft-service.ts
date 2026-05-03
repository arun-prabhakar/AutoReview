import nodemailer from "nodemailer";
import type { RawFinding } from "./review-engine.js";
import { get } from "../db/queries.js";
import { decrypt } from "./encryption-service.js";

export function generateEmailDraft(
  repoName: string,
  branch: string,
  commitHash: string,
  findings: RawFinding[]
): string {
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const formatFinding = (f: RawFinding) =>
    `${f.summary}\nFile: ${f.file_path}${f.line_number ? `:${f.line_number}` : ""}\nReason: ${f.explanation}${f.suggested_fix ? `\nSuggested Fix: ${f.suggested_fix}` : ""}`;

  return `Hi Team,

AutoReview completed the code review.

Repository: ${repoName}
Branch: ${branch}
Commit ID: ${commitHash}

Summary:

Must Fix: ${grouped.must_fix.length}
Should Fix Soon: ${grouped.should_fix_soon.length}
Can Ignore for Now: ${grouped.ignore.length}

${grouped.must_fix.length > 0 ? `Must Fix:\n\n${grouped.must_fix.map(formatFinding).join("\n\n")}\n` : ""}\
${grouped.should_fix_soon.length > 0 ? `Should Fix Soon:\n\n${grouped.should_fix_soon.map(formatFinding).join("\n\n")}\n` : ""}\
${grouped.ignore.length > 0 ? `Can Ignore for Now:\n\n${grouped.ignore.map((f) => f.summary).join("\n")}\n` : ""}
Regards,
AutoReview`;
}

export async function sendReviewEmail(
  repoId: string,
  repoName: string,
  branch: string,
  commitHash: string,
  findings: RawFinding[]
): Promise<void> {
  const repo = await get<{
    smtp_host: string; smtp_port: number; smtp_user: string;
    smtp_password_encrypted: string; smtp_from_address: string;
    notification_recipients: string | null; include_commit_author: number;
  }>(
    "SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address, notification_recipients, include_commit_author FROM repositories WHERE id = ?",
    [repoId]
  );

  if (!repo || !repo.smtp_host) throw new Error("SMTP not configured for this repository");

  const smtpPassword = repo.smtp_password_encrypted
    ? decrypt(repo.smtp_password_encrypted)
    : "";

  const transporter = nodemailer.createTransport({
    host: repo.smtp_host,
    port: repo.smtp_port,
    auth: {
      user: repo.smtp_user,
      pass: smtpPassword,
    },
  });

  const subject = `Code Review Findings for ${repoName} - Commit ${commitHash.substring(0, 8)}`;
  const body = generateEmailDraft(repoName, branch, commitHash, findings);
  const recipients = repo.notification_recipients || "";

  await transporter.sendMail({
    from: repo.smtp_from_address,
    to: recipients,
    subject,
    text: body,
  });
}
