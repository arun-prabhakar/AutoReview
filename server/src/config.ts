let _warned = false;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    return secret;
  }

  if (!secret && !_warned) {
    console.warn("WARNING: Using dev-only JWT secret. Set JWT_SECRET for production.");
    _warned = true;
  }

  return secret || "autoreview-dev-secret";
}
