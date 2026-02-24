const PCI_ACTIONS = {
  // Token operations
  TOKEN_CREATE_ATTEMPT: "TOKEN_CREATE_ATTEMPT",
  TOKEN_CREATE_SUCCESS: "TOKEN_CREATE_SUCCESS",
  TOKEN_CREATE_ERROR: "TOKEN_CREATE_ERROR",

  TOKEN_ACCESS_ATTEMPT: "TOKEN_ACCESS_ATTEMPT",
  TOKEN_ACCESS_SUCCESS: "TOKEN_ACCESS_SUCCESS",
  TOKEN_ACCESS_ERROR: "TOKEN_ACCESS_ERROR",

  TOKEN_DELETE_ATTEMPT: "TOKEN_DELETE_ATTEMPT",
  TOKEN_DELETE_SUCCESS: "TOKEN_DELETE_SUCCESS",
  TOKEN_DELETE_ERROR: "TOKEN_DELETE_ERROR",

  TOKEN_UPDATE_ATTEMPT: "TOKEN_UPDATE_ATTEMPT",
  TOKEN_UPDATE_SUCCESS: "TOKEN_UPDATE_SUCCESS",
  TOKEN_UPDATE_ERROR: "TOKEN_UPDATE_ERROR",

  // Payment operations
  PAYMENT_PROCESS_ATTEMPT: "PAYMENT_PROCESS_ATTEMPT",
  PAYMENT_PROCESS_SUCCESS: "PAYMENT_PROCESS_SUCCESS",
  PAYMENT_PROCESS_ERROR: "PAYMENT_PROCESS_ERROR",

  // Migration operations
  TOKEN_MIGRATE_ATTEMPT: "TOKEN_MIGRATE_ATTEMPT",
  TOKEN_MIGRATE_SUCCESS: "TOKEN_MIGRATE_SUCCESS",
  TOKEN_MIGRATE_ERROR: "TOKEN_MIGRATE_ERROR",

  // Cleanup operations
  TOKEN_CLEANUP_ATTEMPT: "TOKEN_CLEANUP_ATTEMPT",
  TOKEN_CLEANUP_SUCCESS: "TOKEN_CLEANUP_SUCCESS",
  TOKEN_CLEANUP_ERROR: "TOKEN_CLEANUP_ERROR",
};

// Extracts client IP from request object
function getClientIp(req) {
  if (!req) return "unknown";

  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, first is the original client
    return forwardedFor.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

// Logs PCI DSS compliant structured log entry
function pciLog({ action, userId, processor, req, ip, error, metadata }) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action: action || "UNKNOWN_ACTION",
    userId: userId || "anonymous",
    processor: processor || "unknown",
    ip: ip || getClientIp(req),
  };

  // Add error message if present (sanitized)
  if (error) {
    // Ensure error doesn't contain sensitive data
    logEntry.error = sanitizeErrorMessage(error);
  }

  // Add safe metadata if present
  if (metadata && typeof metadata === "object") {
    logEntry.metadata = sanitizeMetadata(metadata);
  }

  // Output as JSON for Railway
  console.log(JSON.stringify(logEntry));
}

// Sanitizes error messages to remove potential sensitive data
function sanitizeErrorMessage(error) {
  let message =
    typeof error === "string" ? error : error?.message || "Unknown error";

  // Remove potential card numbers (13-19 digits)
  message = message.replace(/\b\d{13,19}\b/g, "[REDACTED_PAN]");

  // Remove potential CVV (3-4 digits in context)
  message = message.replace(/\bcvv[:\s]*\d{3,4}\b/gi, "cvv:[REDACTED]");
  message = message.replace(/\bcvc[:\s]*\d{3,4}\b/gi, "cvc:[REDACTED]");

  // Remove potential tokens that look like card data
  message = message.replace(/\b4\d{15}\b/g, "[REDACTED_VISA]");
  message = message.replace(/\b5[1-5]\d{14}\b/g, "[REDACTED_MC]");
  message = message.replace(/\b3[47]\d{13}\b/g, "[REDACTED_AMEX]");

  return message;
}

// Sanitizes metadata object to remove sensitive fields
function sanitizeMetadata(metadata) {
  const sensitiveFields = [
    "cardNumber",
    "card_number",
    "pan",
    "cvv",
    "cvc",
    "cvv2",
    "cvc2",
    "expiry",
    "exp_date",
    "expDate",
    "pin",
    "password",
    "secret",
    "token",
    "ecartpay_token", // Processor tokens should not be logged
  ];

  const sanitized = {};

  for (const [key, value] of Object.entries(metadata)) {
    const keyLower = key.toLowerCase();

    // Skip sensitive fields
    if (
      sensitiveFields.some((field) => keyLower.includes(field.toLowerCase()))
    ) {
      continue;
    }

    // Skip if value looks like card number
    if (typeof value === "string" && /^\d{13,19}$/.test(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

module.exports = {
  pciLog,
  PCI_ACTIONS,
  getClientIp,
};
