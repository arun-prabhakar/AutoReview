export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function validateRequired(value: FormDataEntryValue | null, label: string): string | undefined {
  if (value === null || String(value).trim() === "") return `${label} is required.`;
  return undefined;
}

export function validateRequiredValue(value: string, label: string): string | undefined {
  if (!value.trim()) return `${label} is required.`;
  return undefined;
}

export function validateHttpUrl(value: FormDataEntryValue | null, label: string): string | undefined {
  const missing = validateRequired(value, label);
  if (missing) return missing;
  if (!/^https?:\/\/\S+/.test(String(value).trim())) return "Enter a valid URL starting with https://";
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Atlassian email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid email address.";
  return undefined;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
