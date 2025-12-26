import chalk from "chalk";
import ora from "ora";

function ts() {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export function createLogger({ verbose = false } = {}) {
  const prefix = chalk.dim(`[${ts()}]`);

  function log(line) {
    // eslint-disable-next-line no-console
    console.log(line);
  }

  return {
    verbose,
    info: (msg) => log(`${prefix} ${chalk.cyan("info")}  ${msg}`),
    warn: (msg) => log(`${prefix} ${chalk.yellow("warn")}  ${msg}`),
    success: (msg) => log(`${prefix} ${chalk.green("done")}  ${msg}`),
    error: (msg) => log(`${prefix} ${chalk.red("err")}   ${msg}`),
    debug: (msg) => {
      if (!verbose) return;
      log(`${prefix} ${chalk.magenta("debug")} ${chalk.dim(msg)}`);
    },
    spinner: (text) =>
      ora({
        text,
        spinner: "dots",
        color: "cyan"
      })
  };
}


