/**
 * Keyboard Simulation Module
 *
 * @deprecated Use PTY stdin writes instead. This module will be removed
 * once all keyboard input is routed through embedded terminals.
 *
 * Provides keyboard input simulation using robotjs.
 * Supports individual keys, key sequences, combinations, and hold-down/release.
 */

import robot from '@jitsi/robotjs';

/**
 * Common key name mappings for convenience.
 * Maps common aliases to robotjs key names.
 */
const KEY_MAP: Record<string, string> = {
    // Control keys
    'ctrl': 'control',
    'control': 'control',
    'alt': 'alt',
    'shift': 'shift',
    'meta': 'command',
    'cmd': 'command',
    'win': 'windows',
    'super': 'windows',

    // Navigation
    'enter': 'enter',
    'return': 'enter',
    'tab': 'tab',
    'space': 'space',
    'backspace': 'backspace',
    'delete': 'delete',
    'del': 'delete',
    'insert': 'insert',
    'home': 'home',
    'end': 'end',
    'escape': 'escape',
    'esc': 'escape',

    // Arrow keys
    'up': 'up',
    'down': 'down',
    'left': 'left',
    'right': 'right',

    // Function keys
    'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
    'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
    'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',

    // Special characters
    'plus': '+',
    'minus': '-',
    'equals': '=',
    'comma': ',',
    'period': '.',
    'slash': '/',
    'backslash': '\\',
    'quote': "'",
    'doublequote': '"',
    'backtick': '`',
    'tilde': '~',
    'bang': '!',
    'at': '@',
    'hash': '#',
    'dollar': '$',
    'percent': '%',
    'caret': '^',
    'ampersand': '&',
    'asterisk': '*',
    'parenleft': '(',
    'parenright': ')',
    'underscore': '_',
    'pipe': '|',
    'braceleft': '{',
    'braceright': '}',
    'bracketleft': '[',
    'bracketright': ']',
    'colon': ':',
    'semicolon': ';',
    'angleleft': '<',
    'angleright': '>',
    'question': '?',
};

/**
 * Default delay between key operations in milliseconds.
 */
const DEFAULT_KEY_DELAY = 10;

/**
 * KeyboardSimulator class for simulating keyboard input.
 */
export class KeyboardSimulator {
    private keyDelay: number;

    /**
     * Creates a new KeyboardSimulator instance.
     *
     * @param keyDelay - Delay between key operations in milliseconds (default: 10)
     */
    constructor(keyDelay: number = DEFAULT_KEY_DELAY) {
        this.keyDelay = keyDelay;
        // Note: @jitsi/robotjs doesn't support setKeyboardDelay
        // Delay is managed internally for manual use if needed
    }

    /**
     * Normalizes a key name using the key map.
     *
     * @param keyName - The key name to normalize
     * @returns The normalized key name for robotjs
     */
    private normalizeKey(keyName: string): string {
        const lowerKey = keyName.toLowerCase();
        return KEY_MAP[lowerKey] || lowerKey;
    }

    /**
     * Sends a single key tap (press and release).
     *
     * @param keyName - The name of the key to send
     *
     * @example
     * ```ts
     * keyboard.sendKey('a');
     * keyboard.sendKey('enter');
     * keyboard.sendKey('f5');
     * ```
     */
    sendKey(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyTap(normalizedKey);
    }

    /**
     * Sends a sequence of keys in order.
     *
     * @param keyNames - Array of key names to send sequentially
     *
     * @example
     * ```ts
     * keyboard.sendKeys(['h', 'e', 'l', 'l', 'o']);
     * keyboard.sendKeys(['ctrl', 'c']); // Not a combo - sends ctrl then c
     * ```
     */
    sendKeys(keyNames: string[]): void {
        for (const key of keyNames) {
            this.sendKey(key);
        }
    }

    /**
     * Sends a key combination (multiple keys held together).
     *
     * The first key in the array is pressed first, followed by all modifiers,
     * then all are released in reverse order.
     *
     * @param keyNames - Array of key names to send as a combination
     *
     * @example
     * ```ts
     * keyboard.sendKeyCombo(['ctrl', 'c']); // Copy
     * keyboard.sendKeyCombo(['ctrl', 'v']); // Paste
     * keyboard.sendKeyCombo(['ctrl', 'shift', 'esc']); // Task manager
     * ```
     */
    sendKeyCombo(keyNames: string[]): void {
        if (keyNames.length === 0) return;
        if (keyNames.length === 1) {
            this.sendKey(keyNames[0]);
            return;
        }

        // Normalize all keys
        const normalizedKeys = keyNames.map(k => this.normalizeKey(k));

        // The last key is the "main" key, others are modifiers
        const mainKey = normalizedKeys[normalizedKeys.length - 1];
        const modifiers = normalizedKeys.slice(0, -1);

        robot.keyTap(mainKey, modifiers);
    }

    /**
     * Presses a key down without releasing it.
     *
     * @param keyName - The name of the key to press down
     */
    keyDown(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyToggle(normalizedKey, 'down');
    }

    /**
     * Releases a previously pressed key.
     *
     * @param keyName - The name of the key to release
     */
    keyUp(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyToggle(normalizedKey, 'up');
    }

    /**
     * Presses multiple keys down in order without releasing them.
     *
     * @param keyNames - Array of key names to press down
     */
    comboDown(keyNames: string[]): void {
        for (const key of keyNames) {
            this.keyDown(key);
        }
    }

    /**
     * Releases multiple keys in reverse order.
     *
     * @param keyNames - Array of key names to release (reversed internally)
     */
    comboUp(keyNames: string[]): void {
        for (const key of [...keyNames].reverse()) {
            this.keyUp(key);
        }
    }

    /**
     * Types a string of text character by character.
     *
     * @param text - The text string to type
     *
     * @example
     * ```ts
     * keyboard.typeString('Hello World');
     * ```
     */
    typeString(text: string): void {
        robot.typeString(text);
    }

    /**
     * Updates the delay between key operations.
     *
     * @param delay - New delay in milliseconds
     */
    setKeyDelay(delay: number): void {
        this.keyDelay = delay;
        // Note: @jitsi/robotjs doesn't support setKeyboardDelay
    }

    /**
     * Gets the current key delay.
     *
     * @returns The current delay in milliseconds
     */
    getKeyDelay(): number {
        return this.keyDelay;
    }
}

/**
 * Default singleton instance for convenience.
 */
export const keyboard = new KeyboardSimulator();
