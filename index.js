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
    if (cmd instanceof Command) {
      return this.pipeToCommand(cmd);
    }
    return this.pipeToCommand(new Command(cmd, ...args));
  }

  pipeToCommand(command) {
    this._checkProcessNotStarted("pipe");
    debug(`${this.cmd} piped to ${command.cmd} ${cmd}`);
    this.stdout.pipe(command.stdin);

    const originalStart = command.start;
    command.start = runtimeEnv => {
      debug(`${command.cmd} start patched `);
      originalStart.call(command, runtimeEnv);
      this.start(runtimeEnv);
      debug(`finish ${command.cmd} start patched `);
    };
    this._pipedProcess = command;

    this.on("error", err => command.emit("error", err));
    return command;
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

  startLater() {
    Promise.resolve().then(() => {
      if (this._pipedProcess) {
        return this._pipedProcess.startLater();
      }

      return this.start({});
    });
  }
}

export function cmd(cmd, ...args) {
  return new Command(cmd, ...args);
}

export function run(command, ...args) {
  const proc = cmd(command, ...args);
  proc.startLater();
  return proc;
}
