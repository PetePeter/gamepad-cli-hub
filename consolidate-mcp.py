#!/usr/bin/env python3
"""Consolidate MCP tool definitions by replacing duplicates with imports."""

import re

# Read the file
with open('src/mcp/localhost-mcp-server.ts', 'r') as f:
    content = f.read()

# Step 1: Update imports (add new imports after line 8)
import_section = """import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { McpConfig } from '../config/loader.js';
import type { ContextBindingTargetType } from '../types/context.js';
import { logger } from '../utils/logger.js';
import { HelmControlService } from './helm-control-service.js';
import { parseSessionAuthToken } from './session-auth.js';
import { MCP_TOOLS, REQUIRED_PLAN_DESCRIPTION_SECTIONS } from './tools/definitions.js';
import type { McpTool } from './tools/types.js';
import {
  asString,
  asRecord,
  asPlanStatus,
  asPlanTypeOrNull,
  asContextBindingTargetType,
  asAiagentState,
  asTerminalOutputMode,
  requireResult,
  requireBooleanResult,
  normalizeStructuredContent,
} from './tools/validation.js';"""

# Find and replace the old imports section
old_imports_pattern = r'import { createServer,.*?import { parseSessionAuthToken } from \'\.\/session-auth\.js\';'
content = re.sub(old_imports_pattern, import_section, content, flags=re.DOTALL)

# Step 2: Remove McpTool interface since it's imported from types.js now
# Pattern: interface McpTool { ... }
content = re.sub(
    r'\ninterface McpTool \{[^}]*\n\}',
    '',
    content,
    flags=re.DOTALL
)

# Step 3: Remove REQUIRED_PLAN_DESCRIPTION_SECTIONS constant since it's imported
content = re.sub(
    r'const REQUIRED_PLAN_DESCRIPTION_SECTIONS = \[[^\]]*\];',
    '',
    content,
    flags=re.DOTALL
)

# Step 4: Replace the TOOLS array with the import reference
# Pattern: const TOOLS: McpTool[] = [ ... ];
content = re.sub(
    r'const TOOLS: McpTool\[\] = \[[\s\S]*?\n\];',
    'const TOOLS = MCP_TOOLS;',
    content
)

# Step 5: Remove duplicate validation functions from the end of the file
# Remove: asString, asRecord, asPlanStatus, asPlanTypeOrNull, asContextBindingTargetType, asAiagentState, asTerminalOutputMode, requireResult, requireBooleanResult, normalizeStructuredContent
# But keep: normalizeStructuredContent, getToolReminder (getToolReminder is specific to this server)

# Pattern for duplicate validation functions (keep getToolReminder)
duplicate_validators = [
    r'\nfunction asString\(.*?\n\}',
    r'\nfunction asRecord\(.*?\n\}',
    r'\nfunction asPlanStatus\(.*?\n\}',
    r'\nfunction asPlanTypeOrNull\(.*?\n\}',
    r'\nfunction asContextBindingTargetType\(.*?\n\}',
    r'\nfunction asAiagentState\(.*?\n\}',
    r'\nfunction asTerminalOutputMode\(.*?\n\}',
    r'\nfunction requireResult\(.*?\n\}',
    r'\nfunction requireBooleanResult\(.*?\n\}',
    r'\nfunction normalizeStructuredContent\(.*?\n\}',
]

for pattern in duplicate_validators:
    content = re.sub(pattern, '', content, flags=re.DOTALL)

# Write the file back
with open('src/mcp/localhost-mcp-server.ts', 'w') as f:
    f.write(content)

print("[OK] Consolidated MCP tool definitions")
print("  - Updated imports")
print("  - Removed McpTool interface (imported from tools/types.js)")
print("  - Removed REQUIRED_PLAN_DESCRIPTION_SECTIONS constant (imported from definitions.js)")
print("  - Replaced TOOLS array with: const TOOLS = MCP_TOOLS;")
print("  - Removed duplicate validation functions (imported from tools/validation.js)")
