import nodemailer, { type Transporter } from "nodemailer";
import type { RawFinding } from "./review-engine.js";
import { get } from "../db/queries.js";
import { decrypt } from "./encryption-service.js";

export type ReviewMetadata = {
  repoName: string;
  commitHash?: string;
  prId?: string;
  branch?: string;
  strictness?: string;
  reviewMode?: string;
  reviewedBy?: string;
  model?: string;
  tokensUsed?: number;
  estimatedCost?: number;
  duration?: string;
};

function countDiffStats(diff: string): { filesChanged: number; linesAdded: number; linesRemoved: number } {
  const fileMatches = diff.match(/^diff --git /gm);
  const addMatches = diff.match(/^\+(?!\+\+|\+)/gm);
  const removeMatches = diff.match(/^-(?!--|-)/gm);
  return {
    filesChanged: fileMatches?.length ?? 0,
    linesAdded: addMatches?.length ?? 0,
    linesRemoved: removeMatches?.length ?? 0,
  };
}

export function generateEmailDraft(
  repoName: string,
  findings: RawFinding[],
  aiOverview: string,
  changedFiles?: string[],
  diff?: string,
  metadata?: ReviewMetadata
): string {
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const diffStats = diff ? countDiffStats(diff) : null;
  const totalLines = (diffStats?.linesAdded ?? 0) + (diffStats?.linesRemoved ?? 0);

  const formatFinding = (f: RawFinding, index: number) => {
    const location = f.file_path + (f.line_number ? `:${f.line_number}` : "");
    const category = f.category ? ` [${f.category}]` : "";
    const severity = f.risk_level === "must_fix" ? "🔴" : f.risk_level === "should_fix_soon" ? "🟡" : "⚪";
    const fix = f.suggested_fix
      ? `\n\n     Suggested Fix:\n       ${f.suggested_fix.replace(/\n/g, "\n       ")}`
      : "";
    return `  ${index + 1}. ${severity} ${f.summary}${category}\n     Location: ${location}\n     ${f.explanation}${fix}`;
  };

  const sectionBlock = (label: string, icon: string, items: RawFinding[]) => {
    if (items.length === 0) return "";
    return `${icon} ${label} (${items.length})\n${"─".repeat(50)}\n\n${items.map((f, i) => formatFinding(f, i)).join("\n\n")}\n\n`;
  };

  const filesList = changedFiles && changedFiles.length > 0
    ? changedFiles.map((f, i) => `  ${i + 1}. ${f}`).join("\n")
    : "  (none detected)";

  const identifier = metadata?.prId
    ? `Pull Request #${metadata.prId}`
    : metadata?.commitHash
      ? `Commit ${metadata.commitHash.substring(0, 12)}`
      : "Code changes";

  const riskAssessment = grouped.must_fix.length > 0
    ? "⛔ HIGH RISK — Action required before merge"
    : grouped.should_fix_soon.length > 0
      ? "⚠️  MODERATE RISK — Review recommended"
      : findings.length > 0
        ? "✅ LOW RISK — Informational findings only"
        : "✅ CLEAN — No issues detected";

  const overviewSection = aiOverview && aiOverview !== "Review completed."
    ? aiOverview
    : "See findings below for details.";

  const findingsBody = findings.length === 0
    ? "✅ The diff looks clean. No issues were found during this review.\n"
    : `${sectionBlock("MUST FIX", "🔴", grouped.must_fix)}${sectionBlock("SHOULD FIX SOON", "🟡", grouped.should_fix_soon)}${sectionBlock("INFORMATIONAL", "⚪", grouped.ignore)}`;

  const categoryBreakdown = findings.length > 0
    ? findings.reduce<Record<string, number>>((acc, f) => {
        const cat = f.category || "other";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {})
    : null;

  const categoryLines = categoryBreakdown
    ? Object.entries(categoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, count]) => `     ${cat.padEnd(20)} ${count}`)
        .join("\n")
    : "     (none)";

  return `Hi Team,

AutoReview has completed an automated code review for ${repoName}.

══════════════════════════════════════════════════
  RISK ASSESSMENT: ${riskAssessment}
══════════════════════════════════════════════════

┌──────────────────────────────────────────────┐
│  REVIEW DETAILS                               │
└──────────────────────────────────────────────┘

  Repository    : ${repoName}
  Target        : ${identifier}
  Branch        : ${metadata?.branch || "N/A"}
  Review Mode   : ${metadata?.reviewMode === "pr" ? "Pull Request" : "Manual Commit"}
  Strictness    : ${metadata?.strictness || "balanced"}
  Reviewed By   : ${metadata?.reviewedBy || "AutoReview AI"}
${metadata?.model ? `  AI Model      : ${metadata.model}` : ""}
${diffStats ? `  Files Changed : ${diffStats.filesChanged}` : ""}
${diffStats ? `  Lines Reviewed: ~${totalLines} (${diffStats.linesAdded} added, ${diffStats.linesRemoved} removed)` : ""}
${metadata?.tokensUsed ? `  Tokens Used   : ${metadata.tokensUsed.toLocaleString()}` : ""}
${metadata?.estimatedCost ? `  Est. Cost     : $${metadata.estimatedCost.toFixed(4)}` : ""}

┌──────────────────────────────────────────────┐
│  AI OVERVIEW                                  │
└──────────────────────────────────────────────┘

${overviewSection}

┌──────────────────────────────────────────────┐
│  FILES REVIEWED (${changedFiles?.length ?? 0})                              │
└──────────────────────────────────────────────┘

${filesList}

┌──────────────────────────────────────────────┐
│  FINDINGS SUMMARY                             │
└──────────────────────────────────────────────┘

  🔴 Must Fix         : ${grouped.must_fix.length}
  🟡 Should Fix Soon  : ${grouped.should_fix_soon.length}
  ⚪ Informational     : ${grouped.ignore.length}
  ─────────────────────────────────
  Total               : ${findings.length}

  By Category:
${categoryLines}

┌──────────────────────────────────────────────┐
│  DETAILED FINDINGS                             │
└──────────────────────────────────────────────┘

${findingsBody}══════════════════════════════════════════════════

This review was generated automatically by AutoReview.
Review findings are AI-generated and should be validated by a human reviewer.

Regards,
AutoReview`;
}

export async function sendReviewEmail(
  repoId: string,
  repoName: string,
  findings: RawFinding[],
  aiOverview: string,
  changedFiles?: string[],
  diff?: string,
  metadata?: ReviewMetadata
): Promise<void> {
  const repo = await get<{
    smtp_host: string; smtp_port: number; smtp_user: string;
    smtp_password_encrypted: string; smtp_from_address: string;
    notification_recipients: string | null;
  }>(
    "SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address, notification_recipients FROM repositories WHERE id = $1",
    [repoId]
  );

  if (!repo || !repo.smtp_host) throw new Error("SMTP not configured for this repository");

  const smtpPassword = repo.smtp_password_encrypted ? decrypt(repo.smtp_password_encrypted) : "";

  const transporter = getSmtpTransporter(repo.smtp_host, repo.smtp_port, repo.smtp_user, smtpPassword);

  const mustCount = findings.filter((f) => f.risk_level === "must_fix").length;
  const statusTag = mustCount > 0 ? `⚠ ${mustCount} Must Fix` : findings.length > 0 ? `${findings.length} Findings` : "Clean";

  const identifier = metadata?.prId
    ? `PR #${metadata.prId}`
    : metadata?.commitHash
      ? metadata.commitHash.substring(0, 8)
      : "";

  const subject = `[AutoReview] ${repoName}${identifier ? ` (${identifier})` : ""} — ${statusTag}`;

  const body = generateEmailDraft(repoName, findings, aiOverview, changedFiles, diff, metadata);

  await transporter.sendMail({
    from: repo.smtp_from_address,
    to: repo.notification_recipients || "",
    subject,
    text: body,
  });
}

const smtpTransportCache = new Map<string, Transporter>();

function getSmtpTransporter(host: string, port: number, user: string, pass: string): Transporter {
  const cacheKey = `${host}:${port}:${user}`;
  let transporter = smtpTransportCache.get(cacheKey);
  if (!transporter) {
    transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
    smtpTransportCache.set(cacheKey, transporter);
    if (smtpTransportCache.size > 10) {
      const firstKey = smtpTransportCache.keys().next().value;
      if (firstKey) smtpTransportCache.delete(firstKey);
    }
  }
  return transporter;
}
