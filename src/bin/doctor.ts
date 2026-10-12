import { loadEnv } from "../config/env";
import { buildDoctorReport, formatDoctorReport } from "../server/doctor-report";

function main() {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (error) {
    // Report which variables are invalid, never their values.
    const issues = (error as { issues?: Array<{ path: PropertyKey[] }> }).issues ?? [];
    console.error("Environment validation failed. Check these variables against .env.example:");
    for (const name of new Set(issues.map((issue) => issue.path.map(String).join(".")))) {
      console.error(`  ${name || "environment"}`);
    }
    process.exitCode = 1;
    return;
  }

  const report = buildDoctorReport(env);
  console.log(process.argv.includes("--json")
    ? JSON.stringify(report, null, 2)
    : formatDoctorReport(report, process.argv.includes("--compose") ? "compose" : "native"));
  if (!report.ready) process.exitCode = 1;
}

main();
