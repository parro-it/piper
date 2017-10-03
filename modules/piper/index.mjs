import cp from 'child_process'
import getStream from 'get-stream'
import pEvent from 'p-event'

export function piper(...commands) {
	const results = {}
	let lastSubprocess

	for (const cmd of commands) {
		const subprocess = cp.spawn(cmd[0], cmd.slice(1), {})

		if (!results.stdin) {
			results.stdin = subprocess.stdin
			results.stderr = subprocess.stderr
		}

		if (lastSubprocess) {
			lastSubprocess.stdout.pipe(subprocess.stdin)
		}

		lastSubprocess = subprocess
	}

	results.exitCode = pEvent(lastSubprocess, 'exit')
	results.stdout = lastSubprocess.stdout

	results.stdout.then = async fn => {
		const completedStdout = await getStream.buffer(results.stdout)
		fn(completedStdout)
	}

	return results
}
