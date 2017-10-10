import cp from "child_process";
import getStream from "get-stream";
import pEvent from "p-event";
import merge from "merge2";
import EventEmitter from "events";
import fs from "fs";

class StdinFrom {
  constructor(path) {
    this.path = path;
  }
}

class StdoutTo {
  constructor(path) {
    this.path = path;
  }
}

class StderrTo {
  constructor(path) {
    this.path = path;
  }
}

const makeThenable = stream => async fn => {
  const completedStream = await getStream.buffer(stream);
  fn(completedStream);
};

let __testHook = false;
export function __setTestHook() {
  __testHook = true;
}

export function piper(...commands) {
  const results = new EventEmitter();
  const allStderr = [];
  let prevSubprocess;
  let idx = 0;

  for (const cmd of commands) {
    const stdio = ["pipe", "pipe", "pipe"];
    idx++;

    if (!__testHook) {
      if (idx === 1) {
        stdio[0] = "inherit";
      }

      if (idx === commands.length) {
        stdio[1] = "inherit";
      }
    }

    const forwardEvent = err => {
      results.emit("error", err);
    };

    const [cmdName, ...args] = cmd.filter(c => typeof c === "string");

    cmd.forEach(c => {
      if (c instanceof StderrTo) {
        stdio[2] = fs.openSync(c.path, "w");
      }

      if (c instanceof StdoutTo) {
        stdio[1] = fs.openSync(c.path, "w");
      }

      if (c instanceof StdinFrom) {
        stdio[0] = fs.openSync(c.path, "r");
      }
    });

    let subprocess;
    try {
      subprocess = cp.spawn(cmdName, args, { stdio });
    } catch (err) {
      forwardEvent(err);
      continue;
    }

    if (subprocess.stderr) {
      allStderr.push(subprocess.stderr);
    }

    const unpipe = () => {
      if (prevSubprocess.stdout) {
        prevSubprocess.stdout.unpipe(subprocess.stdin);
      }
    };

    if (idx === 1) {
      results.stdin = subprocess.stdin;
    }

    if (subprocess.stdin) {
      subprocess.stdin.on("error", forwardEvent);
    }

    if (subprocess.stdout) {
      subprocess.stdout.on("error", forwardEvent);
    }

    if (subprocess.stderr) {
      subprocess.stderr.on("error", forwardEvent);
    }

    subprocess.on("error", forwardEvent);

    if (prevSubprocess) {
      subprocess.once("exit", unpipe);
      prevSubprocess.once("exit", unpipe);
      if (prevSubprocess.stdout && subprocess.stdin) {
        prevSubprocess.stdout.pipe(subprocess.stdin);
      }
    }

    prevSubprocess = subprocess;
  }
  results.exitCode = pEvent(prevSubprocess, "exit", {
    rejectionEvents: "none"
  });
  results.stdout = prevSubprocess.stdout;
  results.stderr = merge(allStderr, { objectMode: false });

  if (results.stdout) {
    results.stdout.then = makeThenable(results.stdout);
  }

  if (results.stderr) {
    results.stderr.then = makeThenable(results.stderr);
  }

  return results;
}

export const stdinFrom = path => new StdinFrom(path);
export const stdoutTo = path => new StdoutTo(path);
export const stderrTo = path => new StderrTo(path);
