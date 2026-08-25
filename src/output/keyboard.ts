/**
 * OS-level Keyboard Simulation (Voice Bindings Only)
 *
 * Provides key tap and hold operations for voice binding triggers.
 * Regular terminal input uses PTY stdin — this module is ONLY for
 * OS-level key events that can't be expressed via PTY.
 */

import robot from '@jitsi/robotjs';

/**
 * Key name mappings to robotjs key names.
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
 * KeyboardSimulator — OS-level key simulation for voice bindings.
 */
export class KeyboardSimulator {
    private normalizeKey(keyName: string): string {
        const lowerKey = keyName.toLowerCase();
        return KEY_MAP[lowerKey] || lowerKey;
    }

    /** Tap a single key (press and release). Used for voice tap mode. */
    keyTap(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyTap(normalizedKey);
    }

    /** Tap a key combo (modifiers + main key). Used for voice tap mode with combos. */
    sendKeyCombo(keyNames: string[]): void {
        if (keyNames.length === 0) return;
        if (keyNames.length === 1) {
            this.keyTap(keyNames[0]);
            return;
        }
        const normalizedKeys = keyNames.map(k => this.normalizeKey(k));
        const mainKey = normalizedKeys[normalizedKeys.length - 1];
        const modifiers = normalizedKeys.slice(0, -1);
        robot.keyTap(mainKey, modifiers);
    }

    /** Press a key down without releasing. Used for voice hold mode. */
    keyDown(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyToggle(normalizedKey, 'down');
    }

    /** Release a previously pressed key. Used for voice hold mode. */
    keyUp(keyName: string): void {
        const normalizedKey = this.normalizeKey(keyName);
        robot.keyToggle(normalizedKey, 'up');
    }

    /** Press multiple keys down in order. Used for voice hold mode with combos. */
    comboDown(keyNames: string[]): void {
        for (const key of keyNames) {
            this.keyDown(key);
        }
    }

    /** Release multiple keys in reverse order. Used for voice hold mode. */
    comboUp(keyNames: string[]): void {
        for (const key of [...keyNames].reverse()) {
            this.keyUp(key);
        }
    }
}

/** Default singleton instance. */
export const keyboard = new KeyboardSimulator();
