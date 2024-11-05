import { spawn } from 'child_process';
import readline from 'readline';

// Hardcoded array of script file names
const scripts = ['RekonAPIGateway.js', 'RekonAccounts.js', 'RekonGroups.js'];

// Object to keep track of child processes by script name
const childProcesses = {};

// Function to start a child process for a script
function startChildProcess(script) {
    if (childProcesses[script] && !childProcesses[script].killed) {
        console.log(`[${script}] is already running.`);
        return;
    }

    const child = spawn('node', [script]);

    // Store the child process in the object
    childProcesses[script] = child;

    // Create a readline interface for the child process's stdout
    const rlOut = readline.createInterface({ input: child.stdout });
    rlOut.on('line', (line) => {
        console.log(`[${script}]: ${line}`);
    });

    // Create a readline interface for the child process's stderr
    const rlErr = readline.createInterface({ input: child.stderr });
    rlErr.on('line', (line) => {
        console.error(`[${script} ERROR]: ${line}`);
    });

    child.on('close', (code) => {
        console.log(`[${script}] exited with code ${code}`);
    });

    console.log(`[${script}] started with PID ${child.pid}`);
}

// Function to restart a specific child process
function restartChildProcess(script) {
    if (childProcesses[script] && !childProcesses[script].killed) {
        console.log(`Restarting [${script}]...`);
        childProcesses[script].kill('SIGTERM');
    } else {
        console.log(`[${script}] is not running, starting it...`);
    }
    startChildProcess(script);
}

// Start all scripts initially
scripts.forEach(startChildProcess);

// Create a readline interface for command input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.on('line', (input) => {
    const [command, script] = input.trim().split(' ');

    if (command === 'restart' && scripts.includes(script)) {
        restartChildProcess(script);
    } else if (command === 'exit') {
        terminateChildProcesses();
        process.exit();
    } else {
        console.log(`Unknown command. Use 'restart <script>' to restart a script or 'exit' to quit.`);
    }
});

// Function to terminate all child processes
function terminateChildProcesses() {
    console.log('Terminating child processes...');
    for (const script in childProcesses) {
        const child = childProcesses[script];
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    }
}

// Handle process exit events
process.on('exit', terminateChildProcesses);
process.on('SIGINT', () => {
    terminateChildProcesses();
    process.exit();
});
process.on('SIGTERM', () => {
    terminateChildProcesses();
    process.exit();
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    terminateChildProcesses();
    process.exit(1);
});
