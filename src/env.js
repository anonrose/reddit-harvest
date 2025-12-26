import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

function getArgValue(argv, names) {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    for (const name of names) {
      if (a === name) return argv[i + 1];
      if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
    }
  }
  return undefined;
}

/**
 * Loads environment variables from a file into process.env.
 *
 * Priority:
 * - explicit `envFile` argument
 * - CLI arg `--env <path>` / `--envFile <path>` / `--env-file <path>`
 * - process.env.ENV_FILE
 * - default `.env` in CWD
 */
export function loadEnv({ envFile, argv = process.argv.slice(2) } = {}) {
  const requested =
    envFile ||
    getArgValue(argv, ["--env", "--envFile", "--env-file"]) ||
    process.env.ENV_FILE ||
    ".env";

  const envPath = path.isAbsolute(requested) ? requested : path.resolve(process.cwd(), requested);
  const mustExist = Boolean(envFile || getArgValue(argv, ["--env", "--envFile", "--env-file"]) || process.env.ENV_FILE);

  if (!fs.existsSync(envPath)) {
    if (mustExist) {
      throw new Error(`Env file not found: ${envPath}`);
    }
    return { envPath, loaded: false };
  }

  const result = dotenv.config({ path: envPath });
  if (result.error) throw result.error;
  return { envPath, loaded: true, parsed: result.parsed };
}


