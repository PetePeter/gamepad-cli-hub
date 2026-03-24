import { spawn, ChildProcess } from 'node:child_process';
import { configLoader, type SpawnConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';

export interface SpawnedProcess {
  process: ChildProcess;
  cliType: string;
  command: string;
  args: string[];
  pid: number;
  spawnedAt: Date;
}

class ProcessSpawner {
  private processes: Map<number, SpawnedProcess> = new Map();

  spawn(cliType: string, workingDir?: string, onExit?: (pid: number) => void): SpawnedProcess | null {
    const spawnConfig = configLoader.getSpawnConfig(cliType);
    if (!spawnConfig) {
      logger.error(`No spawn config found for CLI type: ${cliType}`);
      return null;
    }

    const { command, args } = spawnConfig;
    const childProcess = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell: true,
      cwd: workingDir || undefined,
    });

    const processInfo: SpawnedProcess = {
      process: childProcess,
      cliType,
      command,
      args,
      pid: childProcess.pid ?? 0,
      spawnedAt: new Date(),
    };

    this.processes.set(childProcess.pid ?? 0, processInfo);

    childProcess.on('exit', (code: number | null) => {
      this.processes.delete(childProcess.pid ?? 0);
      logger.info(`Process ${childProcess.pid} exited with code ${code}`);
      if (onExit && childProcess.pid) {
        onExit(childProcess.pid);
      }
    });

    childProcess.on('error', (err: Error) => {
      logger.error(`Failed to spawn ${cliType}: ${err.message}`);
      this.processes.delete(childProcess.pid ?? 0);
      if (onExit && childProcess.pid) {
        onExit(childProcess.pid);
      }
    });

    childProcess.unref();

    return processInfo;
  }

  getProcess(pid: number): SpawnedProcess | undefined {
    return this.processes.get(pid);
  }

  getAllProcesses(): SpawnedProcess[] {
    return Array.from(this.processes.values());
  }

  getProcessesByCliType(cliType: string): SpawnedProcess[] {
    return this.getAllProcesses().filter((p) => p.cliType === cliType);
  }

  kill(pid: number): boolean {
    const processInfo = this.processes.get(pid);
    if (!processInfo) {
      return false;
    }

    processInfo.process.kill();
    return true;
  }

  killAll(): void {
    for (const [pid, processInfo] of this.processes) {
      processInfo.process.kill();
    }
    this.processes.clear();
  }
}

export const processSpawner = new ProcessSpawner();
