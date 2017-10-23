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

function makeProcess(command, env) {
  const stdio = ["pipe", "pipe", "pipe"];
  if (command.redirections[0]) {
    stdio[0] = fs.openSync(command.redirections[0], "r");
  }

  if (command.redirections[1]) {
    stdio[1] = fs.openSync(command.redirections[1], "w");
  }

  if (command.redirections[2]) {
    stdio[2] = fs.openSync(command.redirections[2], "w");
  }

  debug(`Spawn ${command.cmd} ${command.args} (env:${JSON.stringify(env)})`);
  let proc;
  try {
    proc = spawn(command.cmd, command.args, {
      stdio,
      env
    });
  } catch (err) {
    debug(err, command.cmd, command.args);
    throw err;
  }

  if (command.redirections[0]) {
    proc.once("exit", () => command.stdin.end());
  } else {
    command.stdin.pipe(log(`Process ${command.cmd} stdin`)).pipe(proc.stdin);
  }

  if (command.redirections[1]) {
    proc.once("exit", () => command.stdout.end());
  } else {
    proc.stdout.pipe(log(`Process ${command.cmd} stdout`)).pipe(command.stdout);
  }

  if (command.redirections[2]) {
    proc.once("exit", () => command.stderr.end());
  } else {
    proc.stderr.pipe(command.stderr);
    command.stderr.pipe(log(`stderr for ${command.cmd}`));
  }

  proc.on("error", err => {
    command.emit("error", err);
    command.stderr.end();
    command.stdout.end();
    command.stdin.end();
  });

  proc.on("exit", code => {
    command.emit("exit", code);
    debug(`Process ${command.cmd} exit.`);
  });

  proc.on("close", err => {
    command.emit("close", err);
    debug(`Process ${command.cmd} close.`);
  });

  return proc;
}

export class Command extends AbstractCommand {
  start(env) {
    debug("start " + this.cmd);
    this._osProcess = makeProcess(this, env);
    this._processStarted = true;
    this.pid = this._osProcess.pid;

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
