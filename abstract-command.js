import EventEmitter from "events";
import { PassThrough } from "stream";
import pEvent from "p-event";
import getStream from "get-stream";
import _debug from "debug";

const debug = _debug("piper");

const mkThenable = stream => {
  stream.then = async fn => {
    const completedStream = await getStream.buffer(stream);
    fn(completedStream);
  };
  return stream;
};

export default class AbstractCommand extends EventEmitter {
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

  start() {
    throw new Error("You must implement start method in children classes.");
  }

  _checkProcessNotStarted(methodName) {
    if (this._processStarted) {
      throw new Error(
        `You cannot call ${methodName} after process has started.`
      );
    }
  }

  pipe(cmd, args = [], { end = true } = {}) {
    this._checkProcessNotStarted("pipe");
    if (cmd instanceof AbstractCommand) {
      return this.pipeToCommand(cmd, { end });
    }
    const command = new this.constructor(cmd, ...args);
    return this.pipeToCommand(command, { end });
  }

  pipeToCommand(command, { end = true } = {}) {
    this._checkProcessNotStarted("pipe");
    debug(`${this.cmd} piped to ${command.cmd}`);
    this.stdout.pipe(command.stdin, { end });

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
