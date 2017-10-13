import { spawn } from "child_process";

import getStream from "get-stream";
import pEvent from "p-event";
import EventEmitter from "events";
import fs from "fs";
import { PassThrough } from "stream";
import through2 from "through2";
import _debug from "debug";

const debug = _debug("piper");

const log = descr =>
  through2((chunk, enc, callback) => {
    debug(
      descr,
      chunk
        .toString("utf8")
        .replace(/\n/g, "\\n")
        .slice(0, 20) + ` (${chunk.length}) `
    );
    callback(null, chunk);
  });

const mkThenable = stream => {
  stream.then = async fn => {
    const completedStream = await getStream.buffer(stream);
    fn(completedStream);
  };
  return stream;
};

function makeProcess() {
  const stdio = ["pipe", "pipe", "pipe"];
  if (this.redirections[0]) {
    stdio[0] = fs.openSync(this.redirections[0], "r");
  }

  if (this.redirections[1]) {
    stdio[1] = fs.openSync(this.redirections[1], "w");
  }

  if (this.redirections[2]) {
    stdio[2] = fs.openSync(this.redirections[2], "w");
  }

  let proc;
  try {
    proc = spawn(this.cmd, this.args, { stdio });
  } catch (err) {
    debug(err, this.cmd, this.args);
    throw err;
  }

  if (this.redirections[0]) {
    proc.once("exit", () => this.stdin.end());
  } else {
    this.stdin.pipe(log(`Process ${this.cmd} stdin`)).pipe(proc.stdin);
  }

  if (this.redirections[1]) {
    proc.once("exit", () => this.stdout.end());
  } else {
    proc.stdout.pipe(log(`Process ${this.cmd} stdout`)).pipe(this.stdout);
  }

  if (this.redirections[2]) {
    proc.once("exit", () => this.stderr.end());
  } else {
    proc.stderr.pipe(this.stderr);
    this.stderr.pipe(log(`stderr for ${this.cmd}`));
  }

  proc.on("error", err => {
    this.emit("error", err);
  });

  proc.on("exit", err => {
    this.emit("exit", err);
    debug(`Process ${this.cmd} exit.`);
  });

  proc.on("close", err => {
    this.emit("close", err);
    debug(`Process ${this.cmd} close.`);
  });

  this._processStarted = true;
  return proc;
}

export class Command extends EventEmitter {
  constructor(cmd, ...args) {
    super();
    this.cmd = cmd;
    this.redirections = [];
    this.args = args;

    this._processStarted = false;
    this.stdin = new PassThrough();
    this.stdout = mkThenable(new PassThrough());
    this.stderr = mkThenable(new PassThrough());

    this.exitCode = pEvent(this, "exit", {
      rejectionEvents: "none"
    });

    this.stdin.on("close", () => debug(`stdin for ${cmd} closed.`));
    this.stdout.on("close", () => debug(`stdout for ${cmd} closed.`));
    this.stderr.on("close", () => debug(`stderr for ${cmd} closed.`));
  }

  start(runtimeEnv) {
    debug("cmd start " + this.cmd);
    this._osProcess = makeProcess.call(this, runtimeEnv);
    debug("cmd done " + this.cmd);
  }

  _checkProcessNotStarted(methodName) {
    if (this._processStarted) {
      throw new Error(
        `You cannot call ${methodName} after process has started.`
      );
    }
  }

  pipe(cmd, ...args) {
    this._checkProcessNotStarted("pipe");
    const target = new Command(cmd, ...args);
    debug(`${this.cmd} piped to ${target.cmd} ${cmd}`);
    this.stdout.pipe(target.stdin);

    const originalStart = this.start;
    this.start = runtimeEnv => {
      debug(`${this.cmd} start patched `);
      originalStart.call(this, runtimeEnv);
      target.start(runtimeEnv);
      debug(`finish ${this.cmd} start patched `);
    };

    this.on("error", err => target.emit("error", err));
    return target;
  }

  redirectTo(filepath, ioNumber) {
    this._checkProcessNotStarted("redirectTo");
    this.redirections[ioNumber] = filepath;
    return this;
  }

  inputFrom(filepath) {
    this._checkProcessNotStarted("inputFrom");
    this.redirections[0] = filepath;
    return this;
  }

  outputTo(filepath) {
    this._checkProcessNotStarted("outputTo");
    this.redirections[1] = filepath;
    return this;
  }

  errorTo(filepath) {
    this._checkProcessNotStarted("errorTo");
    this.redirections[2] = filepath;
    return this;
  }
}

export function run(cmd, ...args) {
  const proc = new Command(cmd, ...args);

  Promise.resolve().then(() => {
    proc.start({});
  });
  return proc;
}

/* Previous API
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

    const [cmdName, ...args] = cmd.filter(c => typeof c !== "object");

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
      if (typeof cmdName === "function") {
        subprocess = cmdName(args, { stdio });
      } else {
        subprocess = cp.spawn(cmdName, args, { stdio });
      }
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
*/
