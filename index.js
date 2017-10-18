import { spawn } from "child_process";

import fs from "fs";
import through2 from "through2";
import _debug from "debug";

import AbstractCommand from "./abstract-command";
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

  debug(`Spawn ${this.cmd} ${this.args}`);
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
    this.stderr.end();
    this.stdout.end();
    this.stdin.end();
  });

  proc.on("exit", code => {
    this.emit("exit", code);
    debug(`Process ${this.cmd} exit.`);
  });

  proc.on("close", err => {
    this.emit("close", err);
    debug(`Process ${this.cmd} close.`);
  });

  return proc;
}

export class Command extends AbstractCommand {
  start(runtimeEnv) {
    debug("start " + this.cmd);
    this._osProcess = makeProcess.call(this, runtimeEnv);
    this._processStarted = true;

    const errored = new Promise(resolve => {
      this._osProcess.on("error", err => {
        resolve(err);
      });
    });

    return Promise.race([this.exitCode, errored]).then(exitCode => {
      debug("done " + this.cmd);
      return exitCode;
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
