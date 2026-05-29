/**
 * InputConfigStore — manages sticks, dpad, activity, chipActions, and
 * workingDirectories in config/input-config.yaml.
 */
import * as path from 'path';
import { loadYaml, saveYaml } from './yaml-store.js';
import type { ActivityConfig, ChipbarAction, DpadConfig, StickConfig, StickConfigs, WorkingDirectory } from './loader.js';

const DEFAULT_ACTIVITY: ActivityConfig = { timeoutMs: 5000 };
const DEFAULT_STICK: StickConfig = { mode: 'disabled', deadzone: 0.25, repeatRate: 50 };
const DEFAULT_DPAD: DpadConfig = { initialDelay: 400, repeatRate: 120 };

interface InputConfig {
  sticks?: StickConfigs;
  dpad?: DpadConfig;
  activity?: ActivityConfig;
  chipActions?: ChipbarAction[];
  workingDirectories?: WorkingDirectory[];
}

export class InputConfigStore {
  private data: InputConfig = {};

  constructor(private readonly configDir: string) {}

  get filePath(): string {
    return path.join(this.configDir, 'input-config.yaml');
  }

  load(): void {
    this.data = loadYaml<InputConfig>(this.filePath, {});
  }

  getStickConfig(stick: 'left' | 'right'): StickConfig {
    const s = this.data.sticks?.[stick];
    if (!s) return { ...DEFAULT_STICK };
    return {
      mode: s.mode ?? DEFAULT_STICK.mode,
      deadzone: s.deadzone ?? DEFAULT_STICK.deadzone,
      repeatRate: s.repeatRate ?? DEFAULT_STICK.repeatRate,
    };
  }

  getDpadConfig(): DpadConfig {
    return {
      initialDelay: this.data.dpad?.initialDelay ?? DEFAULT_DPAD.initialDelay,
      repeatRate: this.data.dpad?.repeatRate ?? DEFAULT_DPAD.repeatRate,
    };
  }

  getActivityTimeout(): number {
    return this.data.activity?.timeoutMs ?? DEFAULT_ACTIVITY.timeoutMs;
  }

  setActivityTimeout(ms: number): void {
    this.data.activity = { timeoutMs: ms };
    this.save();
  }

  getChipbarActions(): ChipbarAction[] {
    return this.data.chipActions ?? [];
  }

  setChipbarActions(actions: ChipbarAction[]): void {
    this.data.chipActions = actions;
    this.save();
  }

  getWorkingDirectories(): WorkingDirectory[] {
    return this.data.workingDirectories ?? [];
  }

  addWorkingDirectory(name: string, dirPath: string): void {
    if (!this.data.workingDirectories) this.data.workingDirectories = [];
    this.data.workingDirectories.push({ name, path: dirPath });
    this.save();
  }

  updateWorkingDirectory(index: number, name: string, dirPath: string): void {
    const dirs = this.data.workingDirectories ?? [];
    if (index < 0 || index >= dirs.length) throw new Error(`Invalid working directory index: ${index}`);
    dirs[index] = { name, path: dirPath };
    this.save();
  }

  removeWorkingDirectory(index: number): void {
    const dirs = this.data.workingDirectories ?? [];
    if (index < 0 || index >= dirs.length) throw new Error(`Invalid working directory index: ${index}`);
    dirs.splice(index, 1);
    this.save();
  }

  reorderWorkingDirectory(index: number, direction: 'up' | 'down'): void {
    const dirs = this.data.workingDirectories ?? [];
    // Guard the source index so an out-of-bounds caller cannot corrupt the array
    // by writing `undefined` into a slot via the swap below.
    if (index < 0 || index >= dirs.length) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= dirs.length) return;
    [dirs[index], dirs[target]] = [dirs[target], dirs[index]];
    this.save();
  }

  /** Import partial config from an existing profile during migration. */
  importFrom(partial: Partial<InputConfig>): void {
    if (partial.sticks) this.data.sticks = partial.sticks;
    if (partial.dpad) this.data.dpad = partial.dpad;
    if (partial.activity) this.data.activity = partial.activity;
    if (partial.chipActions?.length) this.data.chipActions = partial.chipActions;
    if (partial.workingDirectories?.length) this.data.workingDirectories = partial.workingDirectories;
  }

  save(): void {
    saveYaml(this.filePath, this.data);
  }
}
