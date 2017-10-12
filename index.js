import cp from "child_process";
import getStream from "get-stream";
import pEvent from "p-event";
import merge from "merge2";
import EventEmitter from "events";
import fs from "fs";
import { PassThrough } from "stream";

const mkThenable = stream => {
  stream.then = async fn => {
    const completedStream = await getStream.buffer(stream);
    fn(completedStream);
  };
  return stream;
};

let __testHook = false;
export function __setTestHook() {
  __testHook = true;
}

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

  const proc = cp.spawn(this.cmd, this.args, { stdio });

  if (this.stdoutPipedTo) {
    proc.stdout.pipe(this.stdoutPipedTo.stdin);
    if (!this.redirections[2]) {
      proc.stderr.pipe(this.stdoutPipedTo.stderr, { end: false });
      this.stdoutPipedTo.stderr.piped++;
    }

    this.on("error", err => this.stdoutPipedTo.emit("error", err));

    proc.once("exit", () => this.stdout.end());
  } else if (!this.redirections[1]) {
    proc.stdout.pipe(this.stdout);
  }

  if (!this.redirections[0]) {
    this.stdin.pipe(proc.stdin);
  }

  if (!this.redirections[2]) {
    proc.stderr.pipe(this.stderr, { end: false });
    this.stderr.piped++;
  }

  proc.on("error", err => {
    this.emit("error", err);
  });

  proc.on("exit", () => {
    this.stderr.piped--;
    if (this.stdoutPipedTo) {
      this.stdoutPipedTo.stderr.piped--;
    }

    if (this.stderr.piped <= 0) {
      this.stderr.end();
    }

    if (this.stdoutPipedTo && this.stdoutPipedTo.stderr.piped <= 0) {
      this.stdoutPipedTo.stderr.end();
    }
  });

  this._processStarted = true;
  return proc;
}

/* eslint-disable no-unused-vars */
export class Command extends EventEmitter {
  constructor(cmd, ...args) {
    super();
    this.cmd = cmd;
    this.redirections = [];
    this.args = args;

    const willBeProcess = Promise.resolve().then(makeProcess.bind(this));

    this._processStarted = false;
    this.started = willBeProcess;
    this.stdin = new PassThrough();
    this.stdout = mkThenable(new PassThrough());
    this.stderr = mkThenable(new PassThrough());

    this.stderr.piped = 0;
    this.exitCode = willBeProcess.then(proc =>
      pEvent(proc, "exit", {
        rejectionEvents: "none"
      })
    );
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
    this.stdoutPipedTo = target;
    target.stdinPipedFrom = target;
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
  return new Command(cmd, ...args);
}

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
