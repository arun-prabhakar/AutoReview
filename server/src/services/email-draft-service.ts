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

export function generateEmailDraft(
  repoName: string,
  findings: RawFinding[],
  aiOverview: string,
  _changedFiles?: string[],
  _diff?: string,
  _metadata?: ReviewMetadata
): string {
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

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

══════════════════════════════════════════════════
  RISK ASSESSMENT: ${riskAssessment}
══════════════════════════════════════════════════

**OVERVIEW**

${overviewSection}

**FINDINGS SUMMARY**

  🔴 Must Fix         : ${grouped.must_fix.length}
  🟡 Should Fix Soon  : ${grouped.should_fix_soon.length}
  ⚪ Informational     : ${grouped.ignore.length}
  ─────────────────────────────────
  Total               : ${findings.length}

  By Category:
${categoryLines}

**DETAILED FINDINGS**

${findingsBody}══════════════════════════════════════════════════

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
  const [smtpConfig, repo] = await Promise.all([
    get<{
      smtp_host: string; smtp_port: number; smtp_user: string;
      smtp_password_encrypted: string; smtp_from_address: string;
    }>("SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address FROM smtp_settings WHERE id = 'global'"),
    get<{ notification_recipients: string | null }>(
      "SELECT notification_recipients FROM repositories WHERE id = $1",
      [repoId]
    ),
  ]);

  if (!smtpConfig || !smtpConfig.smtp_host) throw new Error("SMTP not configured");

  const smtpPassword = smtpConfig.smtp_password_encrypted ? decrypt(smtpConfig.smtp_password_encrypted) : "";

  const transporter = getSmtpTransporter(smtpConfig.smtp_host, smtpConfig.smtp_port, smtpConfig.smtp_user, smtpPassword);

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
    from: smtpConfig.smtp_from_address,
    to: repo?.notification_recipients || "",
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
