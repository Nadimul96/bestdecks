// Repository policy: Next.js CLI telemetry is disabled for every local and CI
// invocation. Preloading this file is cross-platform and sets the flag before
// Next constructs its telemetry storage object.
process.env.NEXT_TELEMETRY_DISABLED = "1";
